import { randomUUID } from 'node:crypto';

import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { academicYearSchema, orgSchema, paginated, profileSchema } from '@bareeq/shared';

import { API, app, as, auditRows, errorOf, TestContext } from './helpers.js';
import type { TestUser } from './helpers.js';

const ctx = new TestContext();
let admin: TestUser;
let staff: TestUser;
let viewer: TestUser;
let otherAdmin: TestUser;

beforeAll(async () => {
  const orgId = await ctx.createOrg();
  admin = await ctx.createUser(orgId, 'admin');
  staff = await ctx.createUser(orgId, 'staff');
  viewer = await ctx.createUser(orgId, 'viewer');
  otherAdmin = await ctx.createUser(await ctx.createOrg('Other School'), 'admin');
});

afterAll(() => ctx.cleanup());

const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

describe('role guards on admin-only writes', () => {
  const writes: [string, (u: TestUser) => ReturnType<ReturnType<typeof as>['get']>][] = [
    ['PATCH /org', (u) => as(u).patch(`${API}/org`).send({ name: 'X' })],
    ['POST /org/logo', (u) => as(u).post(`${API}/org/logo`).attach('logo', PNG_1PX, 'l.png')],
    ['GET /users', (u) => as(u).get(`${API}/users`)],
    [
      'POST /users',
      (u) =>
        as(u)
          .post(`${API}/users`)
          .send({ username: 'x-user', fullName: 'X', role: 'viewer', password: 'Password-1' }),
    ],
    ['PATCH /users/:id', (u) => as(u).patch(`${API}/users/${admin.id}`).send({ role: 'viewer' })],
    [
      'POST /academic-years',
      (u) =>
        as(u)
          .post(`${API}/academic-years`)
          .send({ name: 'Y', startDate: '2030-09-01', endDate: '2031-06-30' }),
    ],
    [
      'PATCH /academic-years/:id',
      (u) => as(u).patch(`${API}/academic-years/${randomUUID()}`).send({ name: 'Y' }),
    ],
  ];

  for (const [name, call] of writes) {
    it(`${name}: staff and viewer get 403`, async () => {
      for (const user of [staff, viewer]) {
        const res = await call(user);
        expect(res.status, `${user.role} ${name}`).toBe(403);
        expect(errorOf(res).code).toBe('FORBIDDEN');
      }
    });
  }
});

describe('organization', () => {
  it('any role can read the org', async () => {
    for (const user of [admin, staff, viewer]) {
      const res = await as(user).get(`${API}/org`);
      expect(res.status).toBe(200);
      expect(orgSchema.parse(res.body).id).toBe(admin.orgId);
    }
  });

  it('admin updates settings and an audit row is written', async () => {
    const res = await as(admin).patch(`${API}/org`).send({
      name: 'Renamed School',
      nameAr: 'مدرسة',
      brandColor: '#123ABC',
      defaultLocale: 'ar',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      name: 'Renamed School',
      nameAr: 'مدرسة',
      brandColor: '#123abc',
      defaultLocale: 'ar',
    });
    const audit = await auditRows(admin.orgId);
    expect(audit.some((a) => a.entity === 'organization' && a.action === 'update')).toBe(true);
  });

  it('validation errors return field details', async () => {
    const res = await as(admin).patch(`${API}/org`).send({ brandColor: 'blue', name: '' });
    expect(res.status).toBe(400);
    expect(errorOf(res)).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: { brandColor: 'validation.invalid_color', name: 'validation.required' },
    });
  });

  it('admin uploads a PNG logo; it is served publicly from Postgres', async () => {
    const res = await as(admin).post(`${API}/org/logo`).attach('logo', PNG_1PX, 'logo.png');
    expect(res.status).toBe(200);
    const org = orgSchema.parse(res.body);
    expect(org.logoPath).toMatch(/^logo-\d+\.png$/);
    expect(org.logoUrl).toBe(`/orgs/${admin.orgId}/logo?v=${org.logoPath}`);

    const file = await request(app).get(`${API}${org.logoUrl}`).buffer(true);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toBe('image/png');
    expect(file.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(Buffer.compare(file.body as Buffer, PNG_1PX)).toBe(0);

    expect((await request(app).get(`${API}/orgs/${randomUUID()}/logo`)).status).toBe(404);
    expect((await request(app).get(`${API}/orgs/not-a-uuid/logo`)).status).toBe(404);
  });

  it('rejects files that are not images or are too large', async () => {
    const fake = await as(admin)
      .post(`${API}/org/logo`)
      .attach('logo', Buffer.from('hello'), { filename: 'a.png', contentType: 'image/png' });
    expect(fake.status).toBe(400);

    const pdf = await as(admin).post(`${API}/org/logo`).attach('logo', Buffer.from('%PDF-1.4'), {
      filename: 'a.pdf',
      contentType: 'application/pdf',
    });
    expect(pdf.status).toBe(400);

    const big = Buffer.concat([PNG_1PX, Buffer.alloc(1024 * 1024 + 10)]);
    const large = await as(admin).post(`${API}/org/logo`).attach('logo', big, 'big.png');
    expect(large.status).toBe(400);
    expect(errorOf(large).details).toEqual({ logo: 'validation.logo_size' });

    const missing = await as(admin).post(`${API}/org/logo`).send({});
    expect(missing.status).toBe(400);
  });
});

describe('users', () => {
  it('admin lists only users of their own org', async () => {
    const res = await as(admin).get(`${API}/users?pageSize=100`);
    expect(res.status).toBe(200);
    const body = paginated(profileSchema).parse(res.body);
    expect(body.total).toBe(3);
    expect(body.data.every((u) => u.orgId === admin.orgId)).toBe(true);
  });

  it('admin changes role and deactivates; deactivated user is locked out', async () => {
    const target = await ctx.createUser(admin.orgId, 'viewer');
    const promote = await as(admin).patch(`${API}/users/${target.id}`).send({ role: 'staff' });
    expect(promote.status).toBe(200);
    expect(profileSchema.parse(promote.body).role).toBe('staff');

    const deactivate = await as(admin).patch(`${API}/users/${target.id}`).send({ isActive: false });
    expect(deactivate.status).toBe(200);
    expect((await as(target).get(`${API}/me`)).status).toBe(403);

    const audit = await auditRows(target.id);
    expect(audit.map((a) => a.action).sort()).toEqual(['status_change', 'update']);
  });

  it('admin cannot demote or deactivate themselves', async () => {
    expect((await as(admin).patch(`${API}/users/${admin.id}`).send({ role: 'staff' })).status).toBe(
      409,
    );
    expect(
      (await as(admin).patch(`${API}/users/${admin.id}`).send({ isActive: false })).status,
    ).toBe(409);
  });

  it("another org's user is 404", async () => {
    const res = await as(admin).patch(`${API}/users/${otherAdmin.id}`).send({ role: 'viewer' });
    expect(res.status).toBe(404);
  });

  it('malformed ids are 400', async () => {
    const res = await as(admin).patch(`${API}/users/not-a-uuid`).send({ role: 'viewer' });
    expect(res.status).toBe(400);
  });
});

describe('academic years', () => {
  it('admin creates years; only one stays current', async () => {
    const a = await as(admin)
      .post(`${API}/academic-years`)
      .send({ name: '2040-2041', startDate: '2040-09-01', endDate: '2041-06-30', isCurrent: true });
    expect(a.status).toBe(201);
    const b = await as(admin)
      .post(`${API}/academic-years`)
      .send({ name: '2041-2042', startDate: '2041-09-01', endDate: '2042-06-30', isCurrent: true });
    expect(b.status).toBe(201);

    const list = paginated(academicYearSchema).parse(
      (await as(viewer).get(`${API}/academic-years`)).body,
    );
    expect(list.data.filter((y) => y.isCurrent).map((y) => y.name)).toEqual(['2041-2042']);

    const switchBack = await as(admin)
      .patch(`${API}/academic-years/${academicYearSchema.parse(a.body).id}`)
      .send({ isCurrent: true });
    expect(switchBack.status).toBe(200);
    const after = paginated(academicYearSchema).parse(
      (await as(staff).get(`${API}/academic-years`)).body,
    );
    expect(after.data.filter((y) => y.isCurrent).map((y) => y.name)).toEqual(['2040-2041']);
  });

  it('duplicate name is 409; end before start is 400 (also on partial update)', async () => {
    const dup = await as(admin)
      .post(`${API}/academic-years`)
      .send({ name: '2040-2041', startDate: '2050-09-01', endDate: '2051-06-30' });
    expect(dup.status).toBe(409);

    const bad = await as(admin)
      .post(`${API}/academic-years`)
      .send({ name: 'Bad', startDate: '2050-09-01', endDate: '2050-01-01' });
    expect(bad.status).toBe(400);

    const list = paginated(academicYearSchema).parse(
      (await as(admin).get(`${API}/academic-years`)).body,
    );
    const year = list.data[0];
    const partial = await as(admin)
      .patch(`${API}/academic-years/${year?.id}`)
      .send({ endDate: '2000-01-01' });
    expect(partial.status).toBe(400);
    expect(errorOf(partial).details).toEqual({ endDate: 'validation.end_before_start' });
  });

  it("another org's year is invisible and 404 on update", async () => {
    const other = await as(otherAdmin)
      .post(`${API}/academic-years`)
      .send({ name: 'Other', startDate: '2040-09-01', endDate: '2041-06-30' });
    expect(other.status).toBe(201);
    const id = academicYearSchema.parse(other.body).id;

    const list = paginated(academicYearSchema).parse(
      (await as(admin).get(`${API}/academic-years?pageSize=100`)).body,
    );
    expect(list.data.some((y) => y.id === id)).toBe(false);
    expect(
      (await as(admin).patch(`${API}/academic-years/${id}`).send({ name: 'Hacked' })).status,
    ).toBe(404);
  });
});
