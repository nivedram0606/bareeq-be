import { and, asc, eq, isNull, sql } from 'drizzle-orm';

import type { BalanceDto, FeeItemDto } from '@bareeq/shared';

import { db } from '../../db/client.js';
import type { Executor } from '../../db/client.js';
import { feeItems, payments, vFeeBalances, vStudentBalances } from '../../db/schema.js';

type FeeRow = typeof feeItems.$inferSelect;
type FeeInsert = typeof feeItems.$inferInsert;
export type FeePatch = Partial<
  Pick<FeeRow, 'title' | 'academicYearId' | 'amount' | 'discount' | 'dueDate'>
>;

// Correlated subquery: columns are qualified explicitly because Drizzle renders them unqualified
// in single-table queries, which would bind both sides to `payments`.
const hasActivePayments = sql<boolean>`exists (
  select 1 from "payments" p
  where p."fee_item_id" = "v_fee_balances"."fee_item_id" and p."voided_at" is null
)`;

const selection = {
  id: vFeeBalances.feeItemId,
  studentId: vFeeBalances.studentId,
  academicYearId: vFeeBalances.academicYearId,
  title: vFeeBalances.title,
  amount: vFeeBalances.amount,
  discount: vFeeBalances.discount,
  dueDate: vFeeBalances.dueDate,
  netDue: vFeeBalances.netDue,
  paid: vFeeBalances.paid,
  outstanding: vFeeBalances.outstanding,
  status: vFeeBalances.status,
  locked: hasActivePayments,
};

export const feesRepo = {
  /** Fee items with balances computed by `v_fee_balances`. */
  async listForStudent(orgId: string, studentId: string): Promise<FeeItemDto[]> {
    return db
      .select(selection)
      .from(vFeeBalances)
      .where(and(eq(vFeeBalances.orgId, orgId), eq(vFeeBalances.studentId, studentId)))
      .orderBy(asc(vFeeBalances.dueDate), asc(vFeeBalances.title));
  },

  async findDto(orgId: string, id: string, ex: Executor = db): Promise<FeeItemDto | undefined> {
    const [row] = await ex
      .select(selection)
      .from(vFeeBalances)
      .where(and(eq(vFeeBalances.orgId, orgId), eq(vFeeBalances.feeItemId, id)));
    return row;
  },

  async studentSummary(orgId: string, studentId: string): Promise<BalanceDto | undefined> {
    const [row] = await db
      .select({
        netDue: vStudentBalances.netDue,
        paid: vStudentBalances.paid,
        outstanding: vStudentBalances.outstanding,
        status: vStudentBalances.status,
      })
      .from(vStudentBalances)
      .where(and(eq(vStudentBalances.orgId, orgId), eq(vStudentBalances.studentId, studentId)));
    return row;
  },

  /** Locks the fee item row so concurrent payments/edits on it are serialised. */
  async findForUpdate(ex: Executor, orgId: string, id: string): Promise<FeeRow | undefined> {
    const [row] = await ex
      .select()
      .from(feeItems)
      .where(and(eq(feeItems.orgId, orgId), eq(feeItems.id, id)))
      .for('update');
    return row;
  },

  async hasActivePayments(ex: Executor, feeItemId: string): Promise<boolean> {
    const [row] = await ex
      .select({ id: payments.id })
      .from(payments)
      .where(and(eq(payments.feeItemId, feeItemId), isNull(payments.voidedAt)))
      .limit(1);
    return Boolean(row);
  },

  async insert(ex: Executor, values: FeeInsert): Promise<string> {
    const [row] = await ex.insert(feeItems).values(values).returning({ id: feeItems.id });
    if (!row) throw new Error('Fee insert returned no row');
    return row.id;
  },

  async update(ex: Executor, id: string, patch: FeePatch): Promise<void> {
    await ex.update(feeItems).set(patch).where(eq(feeItems.id, id));
  },
};
