/**
 * Seeds the pilot organization. Idempotent: safe to run repeatedly.
 *
 *   pnpm db:seed           org, current academic year, 3 classes, first admin
 *   pnpm db:seed --demo    ...plus demo students, guardians, fees and payments
 *
 * The first admin is created with SEED_ADMIN_USERNAME / SEED_ADMIN_PASSWORD (skipped if that
 * username already exists). (Without shell access, `POST /api/v1/setup/admin`
 * does the same over HTTP — see docs/prod-deployment.md.)
 */
import { eq, sql } from 'drizzle-orm';

import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { currentAcademicYear, ensureSchool } from '../modules/setup/school.js';
import { usersRepo } from '../modules/users/users.repo.js';
import { insertUser } from '../modules/users/users.service.js';

import { closeDb, db } from './client.js';
import type { Tx } from './client.js';
import { feeItems, guardians, payments, profiles, students } from './schema.js';

const ADMIN_NAME = 'School Administrator';

/** Returns the admin's profile id, creating the account (or re-enabling it as admin) if needed. */
async function ensureAdminUser(
  tx: Tx,
  orgId: string,
  username: string,
  password: string,
): Promise<string> {
  const existing = await usersRepo.findByUsername(username, tx);
  if (existing) {
    await tx
      .update(profiles)
      .set({ role: 'admin', isActive: true })
      .where(eq(profiles.id, existing.id));
    logger.info({ username }, 'Admin user already exists');
    return existing.id;
  }
  const profile = await insertUser(
    tx,
    { orgId, username, password, fullName: ADMIN_NAME, role: 'admin' },
    { via: 'seed' },
  );
  logger.info({ username }, 'Admin user created');
  return profile.id;
}

const DEMO_STUDENTS = [
  ['Ahmed', 'Al-Balushi', 'أحمد البلوشي', 'male', 'Salim Al-Balushi'],
  ['Fatma', 'Al-Harthi', 'فاطمة الحارثي', 'female', 'Khalid Al-Harthi'],
  ['Mohammed', 'Al-Rawahi', 'محمد الرواحي', 'male', 'Said Al-Rawahi'],
  ['Maryam', 'Al-Hinai', 'مريم الهنائي', 'female', 'Hamad Al-Hinai'],
  ['Omar', 'Al-Lawati', 'عمر اللواتي', 'male', 'Ali Al-Lawati'],
  ['Aisha', 'Al-Maskari', 'عائشة المسكري', 'female', 'Nasser Al-Maskari'],
  ['Yousuf', 'Al-Kindi', 'يوسف الكندي', 'male', 'Majid Al-Kindi'],
  ['Zainab', 'Al-Busaidi', 'زينب البوسعيدي', 'female', 'Hilal Al-Busaidi'],
  ['Hamza', 'Al-Saadi', 'حمزة السعدي', 'male', 'Talal Al-Saadi'],
] as const;

async function seedDemo(
  tx: Tx,
  orgId: string,
  academicYearId: string,
  classIds: string[],
  adminId: string,
): Promise<void> {
  const [{ count } = { count: 0 }] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(students)
    .where(eq(students.orgId, orgId));
  if (count > 0) {
    logger.info('Students already exist; skipping demo data');
    return;
  }

  const year = currentAcademicYear();
  for (const [i, [first, last, nameAr, gender, guardian]] of DEMO_STUDENTS.entries()) {
    const [student] = await tx
      .insert(students)
      .values({
        orgId,
        admissionNo: `ADM-${String(1001 + i)}`,
        firstName: first,
        lastName: last,
        nameAr,
        gender,
        dob: `${2018 - (i % 3)}-0${(i % 9) + 1}-15`,
        classId: classIds[i % classIds.length] ?? null,
        status: i === DEMO_STUDENTS.length - 1 ? 'inactive' : 'active',
        joinedOn: year.startDate,
      })
      .returning({ id: students.id });
    if (!student) throw new Error('Failed to insert demo student');

    await tx.insert(guardians).values({
      orgId,
      studentId: student.id,
      name: guardian,
      relation: 'Father',
      phone: `+968 9${String(1000000 + i * 1111).padStart(7, '0')}`,
      email: `guardian${i + 1}@example.com`,
      isPrimary: true,
    });

    const [fee] = await tx
      .insert(feeItems)
      .values({
        orgId,
        studentId: student.id,
        academicYearId,
        title: 'Tuition — Term 1',
        amount: '450.000',
        discount: i % 4 === 0 ? '50.000' : '0',
        dueDate: year.startDate.replace(/-09-01$/, '-10-15'),
      })
      .returning({ id: feeItems.id });
    if (!fee) throw new Error('Failed to insert demo fee');

    // Mix of unpaid (i % 3 === 0), partial and fully paid.
    if (i % 3 === 1) {
      await tx.insert(payments).values({
        orgId,
        feeItemId: fee.id,
        studentId: student.id,
        amount: '200.000',
        paidOn: year.startDate,
        method: 'cash',
        receivedBy: adminId,
      });
    } else if (i % 3 === 2) {
      await tx.insert(payments).values({
        orgId,
        feeItemId: fee.id,
        studentId: student.id,
        amount: '450.000',
        paidOn: year.startDate,
        method: 'bank_transfer',
        reference: `TRX-${String(5000 + i)}`,
        receivedBy: adminId,
      });
    }
  }
  logger.info({ students: DEMO_STUDENTS.length }, 'Demo data created');
}

async function main(): Promise<void> {
  const demo = process.argv.includes('--demo');
  const username = env.SEED_ADMIN_USERNAME?.trim().toLowerCase();
  const password = env.SEED_ADMIN_PASSWORD;
  if (!username || !password) {
    throw new Error(
      'SEED_ADMIN_USERNAME and SEED_ADMIN_PASSWORD must be set to seed the first admin',
    );
  }

  await db.transaction(async (tx) => {
    const { orgId, academicYearId, classIds } = await ensureSchool(tx);
    const adminId = await ensureAdminUser(tx, orgId, username, password);
    if (demo) await seedDemo(tx, orgId, academicYearId, classIds, adminId);
  });

  logger.info({ demo }, 'Seed complete');
}

main()
  .catch((err: unknown) => {
    logger.fatal({ err }, 'Seed failed');
    process.exitCode = 1;
  })
  .finally(() => closeDb());
