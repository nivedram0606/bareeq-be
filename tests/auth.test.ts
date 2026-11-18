import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { SignJWT } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { loginResponseSchema, meSchema } from '@bareeq/shared';

import { db } from '../src/db/client.js';
import { profiles } from '../src/db/schema.js';

import { API, app, as, auditRows, errorOf, signIn, TestContext } from './helpers.js';
import type { TestUser } from './helpers.js';

const ctx = new TestContext();
let admin: TestUser;
let staff: TestUser;
let inactive: TestUser;

beforeAll(async () => {
  const orgId = await ctx.createOrg();
  admin = await ctx.createUser(orgId, 'admin');
  staff = await ctx.createUser(orgId, 'staff');
  inactive = await ctx.createUser(orgId, 'staff', { isActive: false });
});

afterAll(() => ctx.cleanup());

const login = (username: string, password: string) =>
  request(app).post(`${API}/auth/login`).send({ username, password });

describe('POST /auth/login', () => {
  it('returns a token for the right username and password (username is case-insensitive)', async () => {
    const res = await login(admin.username.toUpperCase(), admin.password);
    expect(res.status).toBe(200);
    const body = loginResponseSchema.parse(res.body);
    expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now());
    const me = meSchema.parse((await as(body).get(`${API}/me`)).body);
    expect(me.profile).toMatchObject({ id: admin.id, username: admin.username, role: 'admin' });
  });

  it('gives the same 401 for a wrong password and an unknown username', async () => {
    const wrong = await login(admin.username, 'not-the-password');
    const unknown = await login(`nobody-${randomUUID()}`, 'whatever-123');
    for (const res of [wrong, unknown]) {
      expect(res.status).toBe(401);
      expect(errorOf(res)).toMatchObject({
        code: 'UNAUTHENTICATED',
        message: 'Invalid username or password',
      });
    }
  });

  it('403 for a deactivated account with the right password', async () => {
    const res = await login(inactive.username, inactive.password);
    expect(res.status).toBe(403);
  });

  it('401 for an account that has no password set', async () => {
    const user = await ctx.createUser(admin.orgId, 'viewer');
    await db.update(profiles).set({ passwordHash: null }).where(eq(profiles.id, user.id));
    expect((await login(user.username, user.password)).status).toBe(401);
  });

  it('400 when fields are missing', async () => {
    const res = await request(app).post(`${API}/auth/login`).send({});
    expect(res.status).toBe(400);
    expect(Object.keys(errorOf(res).details ?? {}).sort()).toEqual(['password', 'username']);
  });
});

describe('session tokens', () => {
  it('401 without a token', async () => {
    const res = await request(app).get(`${API}/me`);
    expect(res.status).toBe(401);
    expect(errorOf(res).code).toBe('UNAUTHENTICATED');
  });

  it('401 with a malformed token', async () => {
    const res = await request(app).get(`${API}/me`).set('Authorization', 'Bearer not-a-jwt');
    expect(res.status).toBe(401);
  });

  it('401 with a non-bearer scheme', async () => {
    const res = await request(app).get(`${API}/me`).set('Authorization', `Basic ${admin.token}`);
    expect(res.status).toBe(401);
  });

  it('401 with a token signed by another secret', async () => {
    const forged = await new SignJWT({ sv: 0 })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(admin.id)
      .setIssuer('bareeq-api')
      .setAudience('bareeq-web')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(`wrong-secret-${randomUUID()}`));
    const res = await request(app).get(`${API}/me`).set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });

  it('401 with a tampered payload', async () => {
    const [h, p, s] = admin.token.split('.') as [string, string, string];
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString()) as Record<string, unknown>;
    const tampered = Buffer.from(JSON.stringify({ ...payload, sub: staff.id })).toString(
      'base64url',
    );
    const res = await request(app)
      .get(`${API}/me`)
      .set('Authorization', `Bearer ${h}.${tampered}.${s}`);
    expect(res.status).toBe(401);
  });

  it('403 for a user deactivated after signing in', async () => {
    const res = await as(inactive).get(`${API}/me`);
    expect(res.status).toBe(403);
    expect(errorOf(res).code).toBe('FORBIDDEN');
  });

  it('401 once the profile is deleted', async () => {
    const user = await ctx.createUser(admin.orgId, 'viewer');
    await db.delete(profiles).where(eq(profiles.id, user.id));
    expect((await as(user).get(`${API}/me`)).status).toBe(401);
  });

  it('/health stays public', async () => {
    expect((await request(app).get(`${API}/health`)).status).toBe(200);
  });
});

describe('POST /auth/change-password', () => {
  it('rejects a wrong current password', async () => {
    const res = await as(staff)
      .post(`${API}/auth/change-password`)
      .send({ currentPassword: 'wrong-one', newPassword: 'New-password-1' });
    expect(res.status).toBe(400);
    expect(errorOf(res).details).toEqual({ currentPassword: 'validation.wrong_password' });
  });

  it('changes the password, revokes old tokens and returns a fresh one', async () => {
    const user = await ctx.createUser(admin.orgId, 'staff');
    const newPassword = `New-${randomUUID()}`;
    const res = await as(user)
      .post(`${API}/auth/change-password`)
      .send({ currentPassword: user.password, newPassword });
    expect(res.status).toBe(200);
    const fresh = loginResponseSchema.parse(res.body);

    expect((await as(user).get(`${API}/me`)).status).toBe(401);
    expect((await as(fresh).get(`${API}/me`)).status).toBe(200);
    await expect(signIn(user.username, user.password)).rejects.toThrow();
    await signIn(user.username, newPassword);

    const audit = await auditRows(user.id);
    expect(audit.some((a) => (a.diff as { password?: string }).password === 'changed')).toBe(true);
  });
});

describe('PUT /users/:id/password (admin reset)', () => {
  it('admin sets a new password; the old one and old sessions stop working', async () => {
    const user = await ctx.createUser(admin.orgId, 'viewer');
    const password = `Reset-${randomUUID()}`;
    const res = await as(admin).put(`${API}/users/${user.id}/password`).send({ password });
    expect(res.status).toBe(204);
    expect((await as(user).get(`${API}/me`)).status).toBe(401);
    await expect(signIn(user.username, user.password)).rejects.toThrow();
    await signIn(user.username, password);
  });

  it('staff cannot reset passwords; unknown or other-org ids are 404', async () => {
    const forbidden = await as(staff)
      .put(`${API}/users/${admin.id}/password`)
      .send({ password: 'Whatever-123' });
    expect(forbidden.status).toBe(403);

    const other = await ctx.createUser(await ctx.createOrg('Other'), 'viewer');
    for (const id of [randomUUID(), other.id]) {
      const res = await as(admin)
        .put(`${API}/users/${id}/password`)
        .send({ password: 'Whatever-123' });
      expect(res.status).toBe(404);
    }
  });

  it('rejects a short password', async () => {
    const res = await as(admin)
      .put(`${API}/users/${staff.id}/password`)
      .send({ password: 'short' });
    expect(res.status).toBe(400);
    expect(errorOf(res).details).toEqual({ password: 'validation.password_short' });
  });
});
