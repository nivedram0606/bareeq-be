import { randomUUID } from 'node:crypto';

import { eq, inArray } from 'drizzle-orm';
import request from 'supertest';

import { apiErrorSchema } from '@bareeq/shared';
import type { Role } from '@bareeq/shared';

import { createApp } from '../src/app.js';
import { db } from '../src/db/client.js';
import {
  academicYears,
  auditLog,
  classes,
  feeItems,
  guardians,
  organizations,
  payments,
  profiles,
  staff,
  students,
} from '../src/db/schema.js';
import { hashPassword } from '../src/lib/password.js';

export const app = createApp();

export interface TestUser {
  id: string;
  username: string;
  password: string;
  role: Role;
  orgId: string;
  token: string;
}

/** Tracks everything a test file creates so `cleanup()` can remove it. */
export class TestContext {
  private readonly orgIds: string[] = [];
  private readonly runId = randomUUID().slice(0, 8);

  async createOrg(name = 'Test School'): Promise<string> {
    const [org] = await db
      .insert(organizations)
      .values({ name: `${name} ${this.runId}` })
      .returning({ id: organizations.id });
    if (!org) throw new Error('org insert failed');
    this.orgIds.push(org.id);
    return org.id;
  }

  /** Creates a profile with a password and signs in through `POST /auth/login`. */
  async createUser(
    orgId: string,
    role: Role,
    opts: { isActive?: boolean } = {},
  ): Promise<TestUser> {
    const username = `${role}-${randomUUID().slice(0, 8)}`;
    const password = `Pw-${randomUUID()}`;
    const [row] = await db
      .insert(profiles)
      .values({
        orgId,
        username,
        passwordHash: await hashPassword(password),
        fullName: `Test ${role}`,
        role,
      })
      .returning({ id: profiles.id });
    if (!row) throw new Error('profile insert failed');
    const token = await signIn(username, password);
    if (opts.isActive === false) {
      await db.update(profiles).set({ isActive: false }).where(eq(profiles.id, row.id));
    }
    return { id: row.id, username, password, role, orgId, token };
  }

  async cleanup(): Promise<void> {
    if (this.orgIds.length) {
      const ids = this.orgIds;
      await db.transaction(async (tx) => {
        for (const table of [
          auditLog,
          payments,
          feeItems,
          guardians,
          students,
          classes,
          staff,
          academicYears,
          profiles,
        ]) {
          await tx.delete(table).where(inArray(table.orgId, ids));
        }
        await tx.delete(organizations).where(inArray(organizations.id, ids));
      });
    }
  }
}

/** Signs in through the API and returns the session token. */
export async function signIn(username: string, password: string): Promise<string> {
  const res = await request(app).post(`${API}/auth/login`).send({ username, password });
  if (res.status !== 200) throw new Error(`sign-in failed: ${res.status} ${res.text}`);
  return (res.body as { token: string }).token;
}

/** Supertest request with the user's bearer token. */
export const as = (user: Pick<TestUser, 'token'>) => ({
  get: (path: string) => request(app).get(path).set('Authorization', `Bearer ${user.token}`),
  post: (path: string) => request(app).post(path).set('Authorization', `Bearer ${user.token}`),
  patch: (path: string) => request(app).patch(path).set('Authorization', `Bearer ${user.token}`),
  put: (path: string) => request(app).put(path).set('Authorization', `Bearer ${user.token}`),
  delete: (path: string) => request(app).delete(path).set('Authorization', `Bearer ${user.token}`),
});

export const API = '/api/v1';

export async function auditRows(entityId: string) {
  return db.select().from(auditLog).where(eq(auditLog.entityId, entityId));
}

/** Parses a response body as the standard error envelope. */
export const errorOf = (res: { body: unknown }) => apiErrorSchema.parse(res.body).error;
