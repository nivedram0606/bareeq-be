import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  customType,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  pgView,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import {
  AUDIT_ACTIONS,
  DESIGNATIONS,
  GENDERS,
  PAY_METHODS,
  ROLES,
  STUDENT_STATUS,
} from '@bareeq/shared';
import type { BalanceStatus } from '@bareeq/shared';

/* ------------------------------------------------------------------ enums */

export const userRole = pgEnum('user_role', ROLES);
export const recordStatus = pgEnum('record_status', STUDENT_STATUS);
export const payMethod = pgEnum('pay_method', PAY_METHODS);

/* -------------------------------------------------------- column helpers */

const id = () => uuid('id').primaryKey().defaultRandom();
const money = (name: string) => numeric(name, { precision: 12, scale: 3 });
const timestamps = () => ({
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
const orgId = () =>
  uuid('org_id')
    .notNull()
    .references(() => organizations.id);
const inList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '));

/** Raw bytes (Postgres `bytea`), read and written as Node Buffers. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});

/* ----------------------------------------------------------------- tables */

export const organizations = pgTable(
  'organizations',
  {
    id: id(),
    name: text('name').notNull(),
    nameAr: text('name_ar'),
    currency: text('currency').notNull().default('OMR'),
    defaultLocale: text('default_locale').notNull().default('en'),
    brandColor: text('brand_color').notNull().default('#0f766e'),
    /** Logo file name (`logo-<timestamp>.<ext>`); changes on every upload, busting caches. */
    logoPath: text('logo_path'),
    logoMime: text('logo_mime'),
    logoData: bytea('logo_data'),
    ...timestamps(),
  },
  (t) => [
    check('organizations_default_locale_check', sql`${t.defaultLocale} in ('en', 'ar')`),
    check('organizations_brand_color_check', sql`${t.brandColor} ~ '^#[0-9a-fA-F]{6}$'`),
  ],
).enableRLS();

export const profiles = pgTable(
  'profiles',
  {
    id: id(),
    orgId: orgId(),
    /** Login name, stored lower-case. */
    username: text('username').notNull(),
    /** bcrypt hash; null means the account cannot sign in until an admin sets a password. */
    passwordHash: text('password_hash'),
    /** Bumped on password change/reset to revoke existing session tokens. */
    sessionVersion: integer('session_version').notNull().default(0),
    fullName: text('full_name').notNull(),
    email: text('email'),
    role: userRole('role').notNull().default('viewer'),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps(),
  },
  (t) => [
    index('profiles_org_idx').on(t.orgId),
    uniqueIndex('profiles_username_key').on(sql`lower(${t.username})`),
  ],
).enableRLS();

export const academicYears = pgTable(
  'academic_years',
  {
    id: id(),
    orgId: orgId(),
    name: text('name').notNull(),
    startDate: date('start_date').notNull(),
    endDate: date('end_date').notNull(),
    isCurrent: boolean('is_current').notNull().default(false),
    ...timestamps(),
  },
  (t) => [
    unique('academic_years_org_name_key').on(t.orgId, t.name),
    uniqueIndex('academic_years_one_current_per_org')
      .on(t.orgId)
      .where(sql`${t.isCurrent}`),
    check('academic_years_dates_check', sql`${t.endDate} > ${t.startDate}`),
  ],
).enableRLS();

export const classes = pgTable(
  'classes',
  {
    id: id(),
    orgId: orgId(),
    name: text('name').notNull(),
    grade: text('grade').notNull(),
    section: text('section'),
    academicYearId: uuid('academic_year_id')
      .notNull()
      .references(() => academicYears.id),
    ...timestamps(),
  },
  (t) => [unique('classes_org_year_name_key').on(t.orgId, t.academicYearId, t.name)],
).enableRLS();

export const students = pgTable(
  'students',
  {
    id: id(),
    orgId: orgId(),
    admissionNo: text('admission_no').notNull(),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    nameAr: text('name_ar'),
    dob: date('dob').notNull(),
    gender: text('gender').notNull(),
    classId: uuid('class_id').references(() => classes.id),
    status: recordStatus('status').notNull().default('active'),
    joinedOn: date('joined_on')
      .notNull()
      .default(sql`current_date`),
    ...timestamps(),
  },
  (t) => [
    unique('students_org_admission_no_key').on(t.orgId, t.admissionNo),
    index('students_org_class_status_idx').on(t.orgId, t.classId, t.status),
    index('students_org_last_name_idx').on(t.orgId, sql`lower(${t.lastName})`),
    check('students_gender_check', sql`${t.gender} in (${inList(GENDERS)})`),
  ],
).enableRLS();

export const guardians = pgTable(
  'guardians',
  {
    id: id(),
    orgId: orgId(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id),
    name: text('name').notNull(),
    relation: text('relation').notNull(),
    phone: text('phone'),
    email: text('email'),
    isPrimary: boolean('is_primary').notNull().default(false),
    ...timestamps(),
  },
  (t) => [
    index('guardians_student_idx').on(t.studentId),
    uniqueIndex('guardians_one_primary_per_student')
      .on(t.studentId)
      .where(sql`${t.isPrimary}`),
  ],
).enableRLS();

export const staff = pgTable(
  'staff',
  {
    id: id(),
    orgId: orgId(),
    fullName: text('full_name').notNull(),
    designation: text('designation', { enum: DESIGNATIONS }).notNull(),
    phone: text('phone'),
    email: text('email'),
    status: recordStatus('status').notNull().default('active'),
    ...timestamps(),
  },
  (t) => [
    index('staff_org_idx').on(t.orgId),
    check('staff_designation_check', sql`${t.designation} in (${inList(DESIGNATIONS)})`),
  ],
).enableRLS();

export const feeItems = pgTable(
  'fee_items',
  {
    id: id(),
    orgId: orgId(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id),
    academicYearId: uuid('academic_year_id').references(() => academicYears.id),
    title: text('title').notNull(),
    amount: money('amount').notNull(),
    discount: money('discount').notNull().default('0'),
    dueDate: date('due_date').notNull(),
    ...timestamps(),
  },
  (t) => [
    index('fee_items_org_student_idx').on(t.orgId, t.studentId),
    // Target of the payments (fee_item_id, student_id) composite FK.
    unique('fee_items_id_student_key').on(t.id, t.studentId),
    check('fee_items_amount_check', sql`${t.amount} >= 0`),
    check('fee_items_discount_check', sql`${t.discount} >= 0 and ${t.discount} <= ${t.amount}`),
  ],
).enableRLS();

export const payments = pgTable(
  'payments',
  {
    id: id(),
    orgId: orgId(),
    feeItemId: uuid('fee_item_id').notNull(),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id),
    amount: money('amount').notNull(),
    paidOn: date('paid_on')
      .notNull()
      .default(sql`current_date`),
    method: payMethod('method').notNull(),
    reference: text('reference'),
    receivedBy: uuid('received_by')
      .notNull()
      .references(() => profiles.id),
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidedBy: uuid('voided_by').references(() => profiles.id),
    voidReason: text('void_reason'),
    ...timestamps(),
  },
  (t) => [
    foreignKey({
      name: 'payments_fee_item_student_fk',
      columns: [t.feeItemId, t.studentId],
      foreignColumns: [feeItems.id, feeItems.studentId],
    }),
    index('payments_org_paid_on_idx').on(t.orgId, t.paidOn),
    index('payments_fee_item_idx').on(t.feeItemId),
    check('payments_amount_check', sql`${t.amount} > 0`),
    check(
      'payments_void_check',
      sql`(${t.voidedAt} is null and ${t.voidedBy} is null and ${t.voidReason} is null) or (${t.voidedAt} is not null and ${t.voidedBy} is not null and ${t.voidReason} is not null)`,
    ),
  ],
).enableRLS();

export const auditLog = pgTable(
  'audit_log',
  {
    id: id(),
    orgId: orgId(),
    actorId: uuid('actor_id').references(() => profiles.id),
    entity: text('entity').notNull(),
    entityId: uuid('entity_id').notNull(),
    action: text('action').notNull(),
    diff: jsonb('diff'),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_log_org_entity_idx').on(t.orgId, t.entity, t.entityId),
    check('audit_log_action_check', sql`${t.action} in (${inList(AUDIT_ACTIONS)})`),
  ],
).enableRLS();

/* ------------------------------------------------------------------ views
 * Created by the hand-written SQL migration; declared here for typed reads only. */

export const vFeeBalances = pgView('v_fee_balances', {
  feeItemId: uuid('fee_item_id').notNull(),
  orgId: uuid('org_id').notNull(),
  studentId: uuid('student_id').notNull(),
  academicYearId: uuid('academic_year_id'),
  title: text('title').notNull(),
  amount: money('amount').notNull(),
  discount: money('discount').notNull(),
  dueDate: date('due_date').notNull(),
  netDue: money('net_due').notNull(),
  paid: money('paid').notNull(),
  outstanding: money('outstanding').notNull(),
  status: text('status').$type<BalanceStatus>().notNull(),
}).existing();

export const vStudentBalances = pgView('v_student_balances', {
  studentId: uuid('student_id').notNull(),
  orgId: uuid('org_id').notNull(),
  netDue: money('net_due').notNull(),
  paid: money('paid').notNull(),
  outstanding: money('outstanding').notNull(),
  status: text('status').$type<BalanceStatus>().notNull(),
}).existing();
