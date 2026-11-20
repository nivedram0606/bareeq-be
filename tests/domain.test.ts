import { randomUUID } from 'node:crypto';

import type { Response } from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  academicYearSchema,
  classSchema,
  dashboardSchema,
  feeCollectionReportSchema,
  feeItemSchema,
  guardianSchema,
  outstandingReportSchema,
  paginated,
  paymentSchema,
  staffSchema,
  studentFeesSchema,
  studentReportSchema,
  studentSchema,
} from '@bareeq/shared';

import { exportRepo } from '../src/modules/export/export.repo.js';

import { API, as, auditRows, errorOf, TestContext } from './helpers.js';
import type { TestUser } from './helpers.js';

const ctx = new TestContext();
let admin: TestUser;
let staff: TestUser;
let viewer: TestUser;
let otherAdmin: TestUser;
let yearId: string;
let classId: string;

const today = new Date().toISOString().slice(0, 10);

async function createStudent(
  user: TestUser,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const res = await as(user)
    .post(`${API}/students`)
    .send({
      admissionNo: `A-${randomUUID().slice(0, 6)}`,
      firstName: 'Salma',
      lastName: 'Al-Rawahi',
      nameAr: 'سلمى الرواحي',
      dob: '2017-05-04',
      gender: 'female',
      classId,
      joinedOn: '2026-09-01',
      ...overrides,
    });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return studentSchema.parse(res.body).id;
}

async function createFee(user: TestUser, studentId: string, amount = '100.000', extra = {}) {
  const res = await as(user)
    .post(`${API}/fees`)
    .send({ studentId, title: 'Tuition', amount, dueDate: '2026-10-01', ...extra });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return feeItemSchema.parse(res.body);
}

async function pay(user: TestUser, feeItemId: string, amount: string, method = 'cash') {
  const res = await as(user)
    .post(`${API}/payments`)
    .send({ feeItemId, amount, paidOn: today, method, reference: 'R-1' });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return paymentSchema.parse(res.body);
}

async function fees(user: TestUser, studentId: string) {
  const res = await as(user).get(`${API}/students/${studentId}/fees`);
  expect(res.status).toBe(200);
  return studentFeesSchema.parse(res.body);
}

/** Collects a binary response body (ZIP) as a Buffer. */
function binary(res: Response, cb: (err: Error | null, body: Buffer) => void) {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
}

beforeAll(async () => {
  const orgId = await ctx.createOrg();
  admin = await ctx.createUser(orgId, 'admin');
  staff = await ctx.createUser(orgId, 'staff');
  viewer = await ctx.createUser(orgId, 'viewer');
  otherAdmin = await ctx.createUser(await ctx.createOrg('Other School'), 'admin');

  const year = await as(admin)
    .post(`${API}/academic-years`)
    .send({ name: '2026-2027', startDate: '2026-09-01', endDate: '2027-06-30', isCurrent: true });
  yearId = academicYearSchema.parse(year.body).id;
  const cls = await as(admin)
    .post(`${API}/classes`)
    .send({ name: 'Grade 4 - A', grade: 'Grade 4', section: 'A', academicYearId: yearId });
  classId = classSchema.parse(cls.body).id;
});

afterAll(() => ctx.cleanup());

describe('role guards', () => {
  const id = randomUUID();
  const writes: [string, (u: TestUser) => ReturnType<ReturnType<typeof as>['get']>][] = [
    ['POST /classes', (u) => as(u).post(`${API}/classes`).send({})],
    ['PATCH /classes/:id', (u) => as(u).patch(`${API}/classes/${id}`).send({})],
    ['POST /students', (u) => as(u).post(`${API}/students`).send({})],
    ['PATCH /students/:id', (u) => as(u).patch(`${API}/students/${id}`).send({})],
    ['POST /students/:id/guardians', (u) => as(u).post(`${API}/students/${id}/guardians`).send({})],
    ['PATCH /guardians/:id', (u) => as(u).patch(`${API}/guardians/${id}`).send({})],
    ['DELETE /guardians/:id', (u) => as(u).delete(`${API}/guardians/${id}`)],
    ['POST /fees', (u) => as(u).post(`${API}/fees`).send({})],
    ['PATCH /fees/:id', (u) => as(u).patch(`${API}/fees/${id}`).send({})],
    ['POST /payments', (u) => as(u).post(`${API}/payments`).send({})],
    ['POST /payments/:id/void', (u) => as(u).post(`${API}/payments/${id}/void`).send({})],
    ['POST /staff', (u) => as(u).post(`${API}/staff`).send({})],
    ['PATCH /staff/:id', (u) => as(u).patch(`${API}/staff/${id}`).send({})],
    ['GET /export', (u) => as(u).get(`${API}/export`)],
  ];
  const adminOnly = new Set([
    'POST /payments/:id/void',
    'POST /staff',
    'PATCH /staff/:id',
    'GET /export',
  ]);

  for (const [name, call] of writes) {
    it(`${name}: viewer 403${adminOnly.has(name) ? ', staff 403' : ''}`, async () => {
      expect((await call(viewer)).status).toBe(403);
      if (adminOnly.has(name)) expect((await call(staff)).status).toBe(403);
    });
  }

  it('every role can read lists, balances and reports', async () => {
    for (const path of [
      '/classes',
      '/students',
      '/staff',
      '/dashboard',
      '/reports/students',
      '/reports/fee-collection',
      '/reports/outstanding',
      '/reports/outstanding.csv',
    ]) {
      expect((await as(viewer).get(`${API}${path}`)).status, path).toBe(200);
    }
  });
});

describe('classes', () => {
  it('staff creates and edits classes; names are unique per year', async () => {
    const res = await as(staff)
      .post(`${API}/classes`)
      .send({ name: 'Grade 5 - B', grade: 'Grade 5', section: 'B', academicYearId: yearId });
    expect(res.status).toBe(201);
    const cls = classSchema.parse(res.body);
    expect(cls).toMatchObject({ academicYearName: '2026-2027', studentCount: 0 });

    const edit = await as(staff).patch(`${API}/classes/${cls.id}`).send({ section: 'C' });
    expect(edit.body).toMatchObject({ section: 'C' });

    const dup = await as(staff)
      .post(`${API}/classes`)
      .send({ name: 'Grade 5 - B', grade: 'Grade 5', academicYearId: yearId });
    expect(dup.status).toBe(409);
  });

  it('rejects an academic year from another org', async () => {
    const other = await as(otherAdmin)
      .post(`${API}/academic-years`)
      .send({ name: 'X', startDate: '2026-09-01', endDate: '2027-06-30' });
    const res = await as(admin)
      .post(`${API}/classes`)
      .send({ name: 'Z', grade: 'Z', academicYearId: academicYearSchema.parse(other.body).id });
    expect(res.status).toBe(400);
    expect(errorOf(res).details).toEqual({ academicYearId: 'validation.invalid_choice' });
  });
});

describe('students', () => {
  it('creates, reads, edits, filters and searches students', async () => {
    const id = await createStudent(staff, { admissionNo: 'S-100', firstName: 'Khalid' });
    const get = studentSchema.parse((await as(viewer).get(`${API}/students/${id}`)).body);
    expect(get).toMatchObject({
      admissionNo: 'S-100',
      className: 'Grade 4 - A',
      status: 'active',
      nameAr: 'سلمى الرواحي',
    });

    const edit = await as(staff)
      .patch(`${API}/students/${id}`)
      .send({ firstName: 'Khaled', classId: null });
    expect(edit.status).toBe(200);
    expect(edit.body).toMatchObject({ firstName: 'Khaled', classId: null, className: null });

    const search = paginated(studentSchema).parse(
      (await as(viewer).get(`${API}/students?search=khaled al`)).body,
    );
    expect(search.data.map((s) => s.id)).toEqual([id]);

    const byClass = paginated(studentSchema).parse(
      (await as(viewer).get(`${API}/students?classId=${classId}&pageSize=100`)).body,
    );
    expect(byClass.data.some((s) => s.id === id)).toBe(false);
  });

  it('admission number is unique per org (409 with field detail)', async () => {
    await createStudent(admin, { admissionNo: 'DUP-1' });
    const res = await as(admin).post(`${API}/students`).send({
      admissionNo: 'DUP-1',
      firstName: 'A',
      lastName: 'B',
      dob: '2017-01-01',
      gender: 'male',
      joinedOn: '2026-09-01',
    });
    expect(res.status).toBe(409);
    expect(errorOf(res).details).toEqual({ admissionNo: 'validation.admission_no_taken' });

    // The same number is fine in another org.
    await createStudent(otherAdmin, { admissionNo: 'DUP-1', classId: null });
  });

  it('toggles active/inactive, filters by status and audits the change', async () => {
    const id = await createStudent(staff);
    const res = await as(staff).patch(`${API}/students/${id}`).send({ status: 'inactive' });
    expect(res.body).toMatchObject({ status: 'inactive' });

    const inactive = paginated(studentSchema).parse(
      (await as(viewer).get(`${API}/students?status=inactive&pageSize=100`)).body,
    );
    expect(inactive.data.every((s) => s.status === 'inactive')).toBe(true);
    expect(inactive.data.some((s) => s.id === id)).toBe(true);

    const audit = await auditRows(id);
    expect(audit.map((a) => a.action).sort()).toEqual(['create', 'status_change']);
  });

  it('validates input with field details', async () => {
    const res = await as(staff)
      .post(`${API}/students`)
      .send({ admissionNo: '', firstName: 'A', lastName: 'B', dob: 'x', gender: 'other' });
    expect(res.status).toBe(400);
    expect(errorOf(res).details).toMatchObject({
      admissionNo: 'validation.required',
      dob: 'validation.invalid_date',
      gender: 'validation.invalid_choice',
      joinedOn: expect.any(String) as unknown,
    });
  });
});

describe('guardians', () => {
  it('first guardian becomes primary; a new primary replaces it; deleting promotes', async () => {
    const studentId = await createStudent(staff);
    const g1 = guardianSchema.parse(
      (
        await as(staff)
          .post(`${API}/students/${studentId}/guardians`)
          .send({ name: 'Father', relation: 'Father', phone: '+968 9000 0001' })
      ).body,
    );
    expect(g1.isPrimary).toBe(true);

    const g2 = guardianSchema.parse(
      (
        await as(staff)
          .post(`${API}/students/${studentId}/guardians`)
          .send({ name: 'Mother', relation: 'Mother', email: 'MUM@example.com', isPrimary: true })
      ).body,
    );
    expect(g2).toMatchObject({ isPrimary: true, email: 'mum@example.com' });

    const list = (await as(viewer).get(`${API}/students/${studentId}/guardians`)).body as unknown[];
    expect(list.map((g) => guardianSchema.parse(g).name)).toEqual(['Mother', 'Father']);

    const student = studentSchema.parse(
      (await as(viewer).get(`${API}/students/${studentId}`)).body,
    );
    expect(student.primaryGuardianName).toBe('Mother');

    expect(
      (await as(staff).patch(`${API}/guardians/${g2.id}`).send({ isPrimary: false })).status,
    ).toBe(409);

    expect((await as(staff).delete(`${API}/guardians/${g2.id}`)).status).toBe(204);
    const after = (await as(viewer).get(`${API}/students/${studentId}/guardians`))
      .body as unknown[];
    expect(after.map((g) => guardianSchema.parse(g))).toMatchObject([
      { name: 'Father', isPrimary: true },
    ]);
  });
});

describe('fees and payments', () => {
  it('100.000 fee, 40.000 payment → partial with 60.000 outstanding', async () => {
    const studentId = await createStudent(staff);
    const fee = await createFee(staff, studentId, '100.000', { academicYearId: yearId });
    expect(fee).toMatchObject({ netDue: '100.000', status: 'unpaid', locked: false });

    const p = await pay(staff, fee.id, '40');
    expect(p).toMatchObject({ amount: '40.000', studentId, receivedById: staff.id });

    const f = await fees(viewer, studentId);
    expect(f.items[0]).toMatchObject({ paid: '40.000', outstanding: '60.000', status: 'partial' });
    expect(f.summary).toMatchObject({ outstanding: '60.000', status: 'partial' });
    expect(f.items[0]?.payments).toHaveLength(1);
  });

  it('multiple payments, overpayment and admin void (excluded from balance, audited)', async () => {
    const studentId = await createStudent(staff);
    const fee = await createFee(staff, studentId, '50.000', { discount: '5.000' });
    await pay(staff, fee.id, '20.000');
    const big = await pay(staff, fee.id, '30.000', 'bank_transfer');

    let f = await fees(viewer, studentId);
    expect(f.items[0]).toMatchObject({ netDue: '45.000', outstanding: '-5.000', status: 'paid' });

    expect(
      (await as(staff).post(`${API}/payments/${big.id}/void`).send({ reason: 'Wrong' })).status,
    ).toBe(403);
    const voided = await as(admin)
      .post(`${API}/payments/${big.id}/void`)
      .send({ reason: 'Entered twice' });
    expect(voided.status).toBe(200);
    expect(voided.body).toMatchObject({ voidReason: 'Entered twice', voidedByName: 'Test admin' });

    f = await fees(viewer, studentId);
    expect(f.items[0]).toMatchObject({ paid: '20.000', outstanding: '25.000', status: 'partial' });
    expect(f.items[0]?.payments.find((p) => p.id === big.id)?.voidedAt).not.toBeNull();

    const again = await as(admin).post(`${API}/payments/${big.id}/void`).send({ reason: 'x' });
    expect(again.status).toBe(409);

    const audit = await auditRows(big.id);
    expect(audit.map((a) => a.action).sort()).toEqual(['create', 'void']);
  });

  it('fees are editable only without non-voided payments', async () => {
    const studentId = await createStudent(staff);
    const fee = await createFee(staff, studentId, '80.000');
    const edit = await as(staff).patch(`${API}/fees/${fee.id}`).send({ amount: '90' });
    expect(edit.body).toMatchObject({ amount: '90.000', netDue: '90.000' });

    const p = await pay(staff, fee.id, '10.000');
    expect((await fees(viewer, studentId)).items[0]?.locked).toBe(true);
    const blocked = await as(staff).patch(`${API}/fees/${fee.id}`).send({ amount: '95' });
    expect(blocked.status).toBe(409);

    await as(admin).post(`${API}/payments/${p.id}/void`).send({ reason: 'Undo' });
    const ok = await as(staff).patch(`${API}/fees/${fee.id}`).send({ discount: '95' });
    expect(ok.status).toBe(400); // discount > amount
    expect(errorOf(ok).details).toEqual({ discount: 'validation.discount_too_large' });
    expect((await as(staff).patch(`${API}/fees/${fee.id}`).send({ amount: '95' })).status).toBe(
      200,
    );

    const audit = await auditRows(fee.id);
    expect(audit.map((a) => a.action).sort()).toEqual(['create', 'update', 'update']);
  });

  it('rejects zero/negative payments and malformed money', async () => {
    const studentId = await createStudent(staff);
    const fee = await createFee(staff, studentId);
    for (const amount of ['0', '-5', '1.2345', 'abc']) {
      const res = await as(staff)
        .post(`${API}/payments`)
        .send({ feeItemId: fee.id, amount, paidOn: today, method: 'cash' });
      expect(res.status, amount).toBe(400);
    }
  });
});

describe('staff directory', () => {
  it('admin creates and edits; everyone reads', async () => {
    const res = await as(admin)
      .post(`${API}/staff`)
      .send({ fullName: 'Huda Al-Saadi', designation: 'teacher', phone: '+968 9111 2222' });
    expect(res.status).toBe(201);
    const member = staffSchema.parse(res.body);
    expect(member.status).toBe('active');

    const edit = await as(admin)
      .patch(`${API}/staff/${member.id}`)
      .send({ designation: 'principal', status: 'inactive' });
    expect(edit.body).toMatchObject({ designation: 'principal', status: 'inactive' });

    const list = paginated(staffSchema).parse(
      (await as(viewer).get(`${API}/staff?search=huda`)).body,
    );
    expect(list.data.map((s) => s.id)).toEqual([member.id]);
  });
  it('only accepts designations from the fixed list', async () => {
    const res = await as(admin)
      .post(`${API}/staff`)
      .send({ fullName: 'X', designation: 'Head Chef' });
    expect(res.status).toBe(400);
    expect(errorOf(res).details).toEqual({ designation: 'validation.invalid_choice' });
  });
});

describe('org isolation', () => {
  it("another org's records are invisible and 404 on every access", async () => {
    const studentId = await createStudent(admin);
    const fee = await createFee(admin, studentId);
    const payment = await pay(admin, fee.id, '1.000');
    const guardian = guardianSchema.parse(
      (
        await as(admin)
          .post(`${API}/students/${studentId}/guardians`)
          .send({ name: 'G', relation: 'Uncle' })
      ).body,
    );
    const member = staffSchema.parse(
      (await as(admin).post(`${API}/staff`).send({ fullName: 'S', designation: 'other' })).body,
    );

    const other = as(otherAdmin);
    const checks: [string, Promise<Response>][] = [
      ['get student', other.get(`${API}/students/${studentId}`)],
      ['patch student', other.patch(`${API}/students/${studentId}`).send({ firstName: 'X' })],
      ['guardians', other.get(`${API}/students/${studentId}/guardians`)],
      [
        'add guardian',
        other.post(`${API}/students/${studentId}/guardians`).send({ name: 'X', relation: 'X' }),
      ],
      ['patch guardian', other.patch(`${API}/guardians/${guardian.id}`).send({ name: 'X' })],
      ['delete guardian', other.delete(`${API}/guardians/${guardian.id}`)],
      ['fees', other.get(`${API}/students/${studentId}/fees`)],
      ['patch fee', other.patch(`${API}/fees/${fee.id}`).send({ title: 'X' })],
      [
        'pay fee',
        other
          .post(`${API}/payments`)
          .send({ feeItemId: fee.id, amount: '1', paidOn: today, method: 'cash' }),
      ],
      ['void payment', other.post(`${API}/payments/${payment.id}/void`).send({ reason: 'X' })],
      ['patch class', other.patch(`${API}/classes/${classId}`).send({ name: 'X' })],
      ['patch staff', other.patch(`${API}/staff/${member.id}`).send({ fullName: 'X' })],
    ];
    for (const [name, req] of checks) {
      expect((await req).status, name).toBe(404);
    }

    const fee400 = await other
      .post(`${API}/fees`)
      .send({ studentId, title: 'X', amount: '1', dueDate: '2026-10-01' });
    expect(fee400.status).toBe(400);

    const lists = await Promise.all([
      other.get(`${API}/students?pageSize=100`),
      other.get(`${API}/classes?pageSize=100`),
      other.get(`${API}/staff?pageSize=100`),
      other.get(`${API}/reports/outstanding?pageSize=100`),
      other.get(`${API}/reports/fee-collection?pageSize=100`),
    ]);
    const ids = JSON.stringify(lists.map((l) => l.body as unknown));
    for (const leaked of [studentId, classId, member.id, fee.id, payment.id]) {
      expect(ids).not.toContain(leaked);
    }
  });
});

describe('reports, CSV and dashboard', () => {
  let reportClassId: string;
  let paidStudent: string;

  beforeAll(async () => {
    const cls = await as(admin)
      .post(`${API}/classes`)
      .send({ name: 'Report Class', grade: 'R', academicYearId: yearId });
    reportClassId = classSchema.parse(cls.body).id;

    paidStudent = await createStudent(admin, {
      classId: reportClassId,
      firstName: '=HYPERLINK("x")',
      lastName: 'Noor',
      nameAr: 'نور',
    });
    await as(admin)
      .post(`${API}/students/${paidStudent}/guardians`)
      .send({ name: 'Ali', relation: 'Father', phone: '+968 9555 0000' });
    const f1 = await createFee(admin, paidStudent, '100.000');
    await pay(admin, f1.id, '40.000');
    const voidMe = await pay(admin, f1.id, '10.000', 'card');
    await as(admin).post(`${API}/payments/${voidMe.id}/void`).send({ reason: 'Test' });

    const other = await createStudent(admin, { classId: reportClassId });
    await createFee(admin, other, '30.500', { dueDate: '2027-03-01' });
  });

  it('class list counts its active students', async () => {
    const list = paginated(classSchema).parse(
      (await as(viewer).get(`${API}/classes?pageSize=100`)).body,
    );
    expect(list.data.find((c) => c.id === reportClassId)?.studentCount).toBe(2);
  });

  it('student listing report filters by class and status', async () => {
    const res = await as(viewer).get(`${API}/reports/students?classId=${reportClassId}`);
    const report = studentReportSchema.parse(res.body);
    expect(report.total).toBe(2);
    expect(report.data.find((r) => r.studentId === paidStudent)).toMatchObject({
      className: 'Report Class',
      primaryGuardian: 'Ali',
      phone: '+968 9555 0000',
    });
  });

  it('fee collection report excludes voided payments and totals the rest', async () => {
    const res = await as(viewer).get(
      `${API}/reports/fee-collection?classId=${reportClassId}&from=${today}&to=${today}`,
    );
    const report = feeCollectionReportSchema.parse(res.body);
    expect(report.total).toBe(1);
    expect(report.totals.collected).toBe('40.000');
    expect(report.data[0]).toMatchObject({
      amount: '40.000',
      method: 'cash',
      receivedBy: 'Test admin',
    });

    const card = feeCollectionReportSchema.parse(
      (await as(viewer).get(`${API}/reports/fee-collection?classId=${reportClassId}&method=card`))
        .body,
    );
    expect(card.total).toBe(0);
  });

  it('outstanding report filters by due date and totals', async () => {
    const all = outstandingReportSchema.parse(
      (await as(viewer).get(`${API}/reports/outstanding?classId=${reportClassId}`)).body,
    );
    expect(all.totals.outstanding).toBe('90.500');
    expect(all.data.map((r) => r.outstanding).sort()).toEqual(['30.500', '60.000']);

    const early = outstandingReportSchema.parse(
      (
        await as(viewer).get(
          `${API}/reports/outstanding?classId=${reportClassId}&dueBefore=2026-12-31`,
        )
      ).body,
    );
    expect(early.data).toHaveLength(1);
    expect(early.totals.outstanding).toBe('60.000');
  });

  it('CSV exports use the same filters, a BOM, and are injection-safe', async () => {
    const res = await as(viewer).get(`${API}/reports/students.csv?classId=${reportClassId}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="students-.*\.csv"/);
    expect(res.text.charCodeAt(0)).toBe(0xfeff);
    const lines = res.text.slice(1).trim().split('\r\n');
    expect(lines[0]).toBe('Admission No,Name,Arabic Name,Class,Status,Primary Guardian,Phone');
    expect(lines).toHaveLength(3);
    expect(res.text).toContain('نور');
    // Formula-like text is neutralised with a leading apostrophe.
    expect(res.text).toContain(`"'=HYPERLINK(""x"") Noor"`);
    expect(res.text).not.toMatch(/,"?=HYPERLINK/);

    const out = await as(viewer).get(`${API}/reports/outstanding.csv?classId=${reportClassId}`);
    expect(out.text.trim().split('\r\n').at(-1)).toContain('TOTAL');
    expect(out.text).toContain('90.500');

    const col = await as(viewer).get(`${API}/reports/fee-collection.csv?classId=${reportClassId}`);
    expect(col.status).toBe(200);
    expect(col.text).toContain('40.000');
  });

  it('dashboard shows active students, this month and outstanding totals', async () => {
    const res = await as(viewer).get(`${API}/dashboard`);
    const d = dashboardSchema.parse(res.body);
    expect(d.activeStudents).toBeGreaterThanOrEqual(2);
    expect(Number(d.collectedThisMonth)).toBeGreaterThanOrEqual(40);
    expect(Number(d.totalOutstanding)).toBeGreaterThanOrEqual(90.5);
    expect(d.recentPayments.length).toBeGreaterThan(0);
    expect(d.recentPayments.length).toBeLessThanOrEqual(10);
  });
});

describe('data export', () => {
  it('admin downloads a ZIP with one CSV per table', async () => {
    const res = await as(admin).get(`${API}/export`).buffer(true).parse(binary);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/zip');
    const zip = res.body as Buffer;
    expect(zip.subarray(0, 2).toString()).toBe('PK');
    const text = zip.toString('latin1');
    for (const table of [
      'organizations',
      'profiles',
      'academic_years',
      'classes',
      'students',
      'guardians',
      'staff',
      'fee_items',
      'payments',
      'audit_log',
    ]) {
      expect(text).toContain(`${table}.csv`);
    }
  });

  it('never exports password hashes, session versions or logo bytes', async () => {
    const dumps = [];
    for await (const dump of exportRepo.tables(admin.orgId)) dumps.push(dump);
    const profilesDump = dumps.find((d) => d.name === 'profiles');
    const orgDump = dumps.find((d) => d.name === 'organizations');
    expect(profilesDump?.headers).toContain('username');
    expect(profilesDump?.headers).not.toContain('password_hash');
    expect(profilesDump?.headers).not.toContain('session_version');
    expect(JSON.stringify(profilesDump?.rows)).not.toMatch(/\$2[aby]\$/);
    expect(orgDump?.headers).not.toContain('logo_data');
  });
});
