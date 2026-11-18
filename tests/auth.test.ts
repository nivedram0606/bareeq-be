import { randomUUID } from 'node:crypto';

import { generateKeyPair, SignJWT } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { meSchema } from '@bareeq/shared';

import { env } from '../src/config/env.js';

import { API, app, as, errorOf, TestContext } from './helpers.js';
import type { TestUser } from './helpers.js';

const ctx = new TestContext();
let admin: TestUser;
let inactive: TestUser;
let noProfile: TestUser;

beforeAll(async () => {
  const orgId = await ctx.createOrg();
  admin = await ctx.createUser(orgId, 'admin');
  inactive = await ctx.createUser(orgId, 'staff', { isActive: false });
  noProfile = await ctx.createUser(orgId, 'viewer', { withProfile: false });
});

afterAll(() => ctx.cleanup());

describe('authentication', () => {
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

  it('401 with a token signed by an unknown key', async () => {
    const { privateKey } = await generateKeyPair('ES256');
    const forged = await new SignJWT({ role: 'authenticated' })
      .setProtectedHeader({ alg: 'ES256', kid: randomUUID() })
      .setSubject(admin.id)
      .setIssuer(env.SUPABASE_JWT_ISSUER)
      .setAudience('authenticated')
      .setIssuedAt()
      .setExpirationTime('1h')
      .sign(privateKey);
    const res = await request(app).get(`${API}/me`).set('Authorization', `Bearer ${forged}`);
    expect(res.status).toBe(401);
  });

  it('401 with a tampered payload', async () => {
    const [h, p, s] = admin.token.split('.') as [string, string, string];
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString()) as Record<string, unknown>;
    const tampered = Buffer.from(JSON.stringify({ ...payload, sub: randomUUID() })).toString(
      'base64url',
    );
    const res = await request(app)
      .get(`${API}/me`)
      .set('Authorization', `Bearer ${h}.${tampered}.${s}`);
    expect(res.status).toBe(401);
  });

  it('403 for an inactive user', async () => {
    const res = await as(inactive).get(`${API}/me`);
    expect(res.status).toBe(403);
    expect(errorOf(res).code).toBe('FORBIDDEN');
  });

  it('403 for an auth user without a profile', async () => {
    const res = await as(noProfile).get(`${API}/me`);
    expect(res.status).toBe(403);
  });

  it('GET /me returns the profile and organization', async () => {
    const res = await as(admin).get(`${API}/me`);
    expect(res.status).toBe(200);
    const me = meSchema.parse(res.body);
    expect(me.profile).toMatchObject({ id: admin.id, role: 'admin', email: admin.email });
    expect(me.org).toMatchObject({ id: admin.orgId, currency: 'OMR' });
  });

  it('/health stays public', async () => {
    expect((await request(app).get(`${API}/health`)).status).toBe(200);
  });
});
