import { randomUUID } from 'node:crypto';

import { eq, inArray } from 'drizzle-orm';
import request from 'supertest';

import { apiErrorSchema } from '@bareeq/shared';
import type { Role } from '@bareeq/shared';

import { createApp } from '../src/app.js';
import { env } from '../src/config/env.js';
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
import { BRANDING_BUCKET, supabaseAdmin } from '../src/lib/supabase.js';

export const app = createApp();

export interface TestUser {
  id: string;
  email: string;
  role: Role;
  orgId: string;
  token: string;
}

/** Tracks everything a test file creates so `cleanup()` can remove it. */
export class TestContext {
  private readonly orgIds: string[] = [];
  private readonly userIds: string[] = [];
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

  /** Creates an auth user + profile and signs in to obtain a real Supabase access token. */
  async createUser(
    orgId: string,
    role: Role,
    opts: { isActive?: boolean; withProfile?: boolean } = {},
  ): Promise<TestUser> {
    const email = `${role}-${randomUUID().slice(0, 8)}@test.local`;
    const password = `Pw-${randomUUID()}`;
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    this.userIds.push(data.user.id);

    if (opts.withProfile !== false) {
      await db.insert(profiles).values({
        id: data.user.id,
        orgId,
        email,
        fullName: `Test ${role}`,
        role,
        isActive: opts.isActive ?? true,
      });
    }
    return { id: data.user.id, email, role, orgId, token: await signIn(email, password) };
  }

  /** Registers an auth user created elsewhere (e.g. by the invite endpoint) for cleanup. */
  trackUser(id: string): void {
    this.userIds.push(id);
  }

  async cleanup(): Promise<void> {
    for (const orgId of this.orgIds) {
      const bucket = supabaseAdmin.storage.from(BRANDING_BUCKET);
      const { data: files } = await bucket.list(orgId);
      if (files?.length) await bucket.remove(files.map((f) => `${orgId}/${f.name}`));
    }
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
    for (const id of this.userIds) {
      await supabaseAdmin.auth.admin.deleteUser(id);
    }
  }
}

export async function signIn(email: string, password: string): Promise<string> {
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`sign-in failed: ${res.status} ${await res.text()}`);
  const body = (await res.json()) as { access_token: string };
  return body.access_token;
}

/** Supertest request with the user's bearer token. */
export const as = (user: Pick<TestUser, 'token'>) => ({
  get: (path: string) => request(app).get(path).set('Authorization', `Bearer ${user.token}`),
  post: (path: string) => request(app).post(path).set('Authorization', `Bearer ${user.token}`),
  patch: (path: string) => request(app).patch(path).set('Authorization', `Bearer ${user.token}`),
  delete: (path: string) => request(app).delete(path).set('Authorization', `Bearer ${user.token}`),
});

export const API = '/api/v1';

export async function auditRows(entityId: string) {
  return db.select().from(auditLog).where(eq(auditLog.entityId, entityId));
}

/** Parses a response body as the standard error envelope. */
export const errorOf = (res: { body: unknown }) => apiErrorSchema.parse(res.body).error;
