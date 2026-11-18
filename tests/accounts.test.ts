import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { meSchema, profileSchema } from '@bareeq/shared';

import { env } from '../src/config/env.js';

import { API, app, as, auditRows, errorOf, signIn, TestContext } from './helpers.js';
import type { TestUser } from './helpers.js';

const ctx = new TestContext();
let admin: TestUser;
let staff: TestUser;
let viewer: TestUser;

beforeAll(async () => {
  const orgId = await ctx.createOrg();
  admin = await ctx.createUser(orgId, 'admin');
  staff = await ctx.createUser(orgId, 'staff');
  viewer = await ctx.createUser(orgId, 'viewer');
});

afterAll(() => ctx.cleanup());

describe('POST /users (create with password)', () => {
  const newUser = (role = 'admin') => ({
    email: `created-${randomUUID().slice(0, 8)}@test.local`,
    fullName: 'Created Admin',
    role,
    password: `Pw-${randomUUID().slice(0, 12)}`,
  });

  it('admin creates another admin who can sign in immediately', async () => {
    const body = newUser('admin');
    const res = await as(admin).post(`${API}/users`).send(body);
    expect(res.status).toBe(201);
    const profile = profileSchema.parse(res.body);
    ctx.trackUser(profile.id);
    expect(profile).toMatchObject({ email: body.email, role: 'admin', orgId: admin.orgId });

    const token = await signIn(body.email, body.password);
    const me = meSchema.parse((await as({ token }).get(`${API}/me`)).body);
    expect(me.profile).toMatchObject({ id: profile.id, role: 'admin' });

    const audit = await auditRows(profile.id);
    expect(audit[0]).toMatchObject({ action: 'create', actorId: admin.id });
    expect(audit[0]?.diff).toMatchObject({ via: 'password' });
  });

  it('staff and viewer cannot create users', async () => {
    for (const user of [staff, viewer]) {
      expect((await as(user).post(`${API}/users`).send(newUser())).status).toBe(403);
    }
  });

  it('rejects short passwords and duplicate e-mails', async () => {
    const short = await as(admin)
      .post(`${API}/users`)
      .send({ ...newUser(), password: 'short' });
    expect(short.status).toBe(400);
    expect(errorOf(short).details).toEqual({ password: 'validation.password_short' });

    const dup = await as(admin)
      .post(`${API}/users`)
      .send({ ...newUser(), email: staff.email });
    expect(dup.status).toBe(409);
    expect(errorOf(dup).details).toEqual({ email: 'validation.email_taken' });
  });
});

describe('POST /setup/admin (first-admin bootstrap)', () => {
  const original = env.SETUP_TOKEN;
  const token = `test-setup-token-${randomUUID()}`;
  const body = {
    email: `setup-${randomUUID().slice(0, 8)}@test.local`,
    fullName: 'Setup Admin',
    password: 'Setup-password-123',
  };
  afterEach(() => {
    env.SETUP_TOKEN = original;
  });

  it('is disabled (404) when SETUP_TOKEN is not configured', async () => {
    env.SETUP_TOKEN = undefined;
    const res = await request(app)
      .post(`${API}/setup/admin`)
      .set('x-setup-token', token)
      .send(body);
    expect(res.status).toBe(404);
  });

  it('rejects a missing or wrong token (403) without a session', async () => {
    env.SETUP_TOKEN = token;
    expect((await request(app).post(`${API}/setup/admin`).send(body)).status).toBe(403);
    const wrong = await request(app)
      .post(`${API}/setup/admin`)
      .set('x-setup-token', `${token}x`)
      .send(body);
    expect(wrong.status).toBe(403);
  });

  it('refuses once an admin exists (409) and creates no account', async () => {
    env.SETUP_TOKEN = token;
    const res = await request(app)
      .post(`${API}/setup/admin`)
      .set('x-setup-token', token)
      .send(body);
    expect(res.status).toBe(409);
    await expect(signIn(body.email, body.password)).rejects.toThrow();
  });

  it('validates the body', async () => {
    env.SETUP_TOKEN = token;
    const res = await request(app)
      .post(`${API}/setup/admin`)
      .set('x-setup-token', token)
      .send({ email: 'nope', fullName: '', password: '1' });
    expect(res.status).toBe(400);
    expect(Object.keys(errorOf(res).details ?? {}).sort()).toEqual([
      'email',
      'fullName',
      'password',
    ]);
  });
});
