import { and, asc, count, desc, eq, gt, gte, ilike, isNull, lte, or, sql } from 'drizzle-orm';

import type {
  FeeCollectionQuery,
  FeeCollectionRow,
  OutstandingQuery,
  OutstandingRow,
  StudentReportQuery,
  StudentReportRow,
} from '@bareeq/shared';

import { db } from '../../db/client.js';
import {
  classes,
  feeItems,
  guardians,
  payments,
  profiles,
  students,
  vFeeBalances,
} from '../../db/schema.js';
import { likePattern, orderByOf } from '../../lib/pagination.js';
import {
  defaultStudentOrder,
  studentSortColumns,
  studentWhere,
} from '../students/students.repo.js';

/** `undefined` → every row (CSV); otherwise one page (JSON). */
export type Paging = { limit: number; offset: number } | undefined;

const studentName = sql<string>`${students.firstName} || ' ' || ${students.lastName}`;
const studentSearch = (search: string | undefined) => {
  if (!search) return undefined;
  const p = likePattern(search);
  return or(
    ilike(students.admissionNo, p),
    ilike(students.nameAr, p),
    ilike(sql`${students.firstName} || ' ' || ${students.lastName}`, p),
  );
};

export const reportsRepo = {
  async students(
    orgId: string,
    q: StudentReportQuery,
    paging: Paging,
  ): Promise<{ rows: StudentReportRow[]; total: number }> {
    const where = studentWhere(orgId, q);
    const query = db
      .select({
        studentId: students.id,
        admissionNo: students.admissionNo,
        studentName,
        nameAr: students.nameAr,
        className: classes.name,
        status: students.status,
        primaryGuardian: guardians.name,
        phone: guardians.phone,
      })
      .from(students)
      .leftJoin(classes, eq(classes.id, students.classId))
      .leftJoin(guardians, and(eq(guardians.studentId, students.id), eq(guardians.isPrimary, true)))
      .where(where)
      .orderBy(orderByOf(q.sort, studentSortColumns, defaultStudentOrder))
      .$dynamic();
    const [rows, [{ total } = { total: 0 }]] = await Promise.all([
      paging ? query.limit(paging.limit).offset(paging.offset) : query,
      db.select({ total: count() }).from(students).where(where),
    ]);
    return { rows, total };
  },

  async feeCollection(
    orgId: string,
    q: FeeCollectionQuery,
    paging: Paging,
  ): Promise<{ rows: FeeCollectionRow[]; total: number; collected: string }> {
    const where = and(
      eq(payments.orgId, orgId),
      isNull(payments.voidedAt),
      q.from ? gte(payments.paidOn, q.from) : undefined,
      q.to ? lte(payments.paidOn, q.to) : undefined,
      q.classId ? eq(students.classId, q.classId) : undefined,
      q.method ? eq(payments.method, q.method) : undefined,
      q.search
        ? or(studentSearch(q.search), ilike(payments.reference, likePattern(q.search)))
        : undefined,
    );
    const query = db
      .select({
        paymentId: payments.id,
        paidOn: payments.paidOn,
        studentId: students.id,
        admissionNo: students.admissionNo,
        studentName,
        className: classes.name,
        feeTitle: feeItems.title,
        amount: payments.amount,
        method: payments.method,
        reference: payments.reference,
        receivedBy: profiles.fullName,
      })
      .from(payments)
      .innerJoin(students, eq(students.id, payments.studentId))
      .innerJoin(feeItems, eq(feeItems.id, payments.feeItemId))
      .innerJoin(profiles, eq(profiles.id, payments.receivedBy))
      .leftJoin(classes, eq(classes.id, students.classId))
      .where(where)
      .orderBy(desc(payments.paidOn), desc(payments.createdAt))
      .$dynamic();
    const [rows, [agg = { total: 0, collected: '0.000' }]] = await Promise.all([
      paging ? query.limit(paging.limit).offset(paging.offset) : query,
      db
        .select({
          total: count(),
          collected: sql<string>`coalesce(sum(${payments.amount}), 0)::numeric(12,3)`,
        })
        .from(payments)
        .innerJoin(students, eq(students.id, payments.studentId))
        .where(where),
    ]);
    return { rows, ...agg };
  },

  async outstanding(
    orgId: string,
    q: OutstandingQuery,
    paging: Paging,
  ): Promise<{ rows: OutstandingRow[]; total: number; outstanding: string }> {
    const where = and(
      eq(vFeeBalances.orgId, orgId),
      gt(vFeeBalances.outstanding, '0'),
      q.classId ? eq(students.classId, q.classId) : undefined,
      q.dueBefore ? lte(vFeeBalances.dueDate, q.dueBefore) : undefined,
      studentSearch(q.search),
    );
    const query = db
      .select({
        feeItemId: vFeeBalances.feeItemId,
        studentId: students.id,
        admissionNo: students.admissionNo,
        studentName,
        className: classes.name,
        feeTitle: vFeeBalances.title,
        netDue: vFeeBalances.netDue,
        paid: vFeeBalances.paid,
        outstanding: vFeeBalances.outstanding,
        dueDate: vFeeBalances.dueDate,
      })
      .from(vFeeBalances)
      .innerJoin(students, eq(students.id, vFeeBalances.studentId))
      .leftJoin(classes, eq(classes.id, students.classId))
      .where(where)
      .orderBy(asc(vFeeBalances.dueDate), sql`lower(${students.lastName})`)
      .$dynamic();
    const [rows, [agg = { total: 0, outstanding: '0.000' }]] = await Promise.all([
      paging ? query.limit(paging.limit).offset(paging.offset) : query,
      db
        .select({
          total: count(),
          outstanding: sql<string>`coalesce(sum(${vFeeBalances.outstanding}), 0)::numeric(12,3)`,
        })
        .from(vFeeBalances)
        .innerJoin(students, eq(students.id, vFeeBalances.studentId))
        .where(where),
    ]);
    return { rows, ...agg };
  },

  async dashboardTotals(
    orgId: string,
    month: { from: string; to: string },
  ): Promise<{ activeStudents: number; collectedThisMonth: string; totalOutstanding: string }> {
    const [
      [students_ = { n: 0 }],
      [collected = { sum: '0.000' }],
      [outstanding = { sum: '0.000' }],
    ] = await Promise.all([
      db
        .select({ n: count() })
        .from(students)
        .where(and(eq(students.orgId, orgId), eq(students.status, 'active'))),
      db
        .select({ sum: sql<string>`coalesce(sum(${payments.amount}), 0)::numeric(12,3)` })
        .from(payments)
        .where(
          and(
            eq(payments.orgId, orgId),
            isNull(payments.voidedAt),
            gte(payments.paidOn, month.from),
            lte(payments.paidOn, month.to),
          ),
        ),
      db
        .select({
          // Overpayments do not reduce what other fees still owe.
          sum: sql<string>`coalesce(sum(greatest(${vFeeBalances.outstanding}, 0)), 0)::numeric(12,3)`,
        })
        .from(vFeeBalances)
        .where(eq(vFeeBalances.orgId, orgId)),
    ]);
    return {
      activeStudents: students_.n,
      collectedThisMonth: collected.sum,
      totalOutstanding: outstanding.sum,
    };
  },
};
