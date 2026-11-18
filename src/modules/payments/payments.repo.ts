import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import type { PaymentDto, RecentPaymentDto } from '@bareeq/shared';

import { db } from '../../db/client.js';
import type { Executor } from '../../db/client.js';
import { feeItems, payments, profiles, students } from '../../db/schema.js';

type PaymentRow = typeof payments.$inferSelect;
type PaymentInsert = typeof payments.$inferInsert;

const receiver = alias(profiles, 'receiver');
const voider = alias(profiles, 'voider');

const selection = {
  id: payments.id,
  feeItemId: payments.feeItemId,
  studentId: payments.studentId,
  amount: payments.amount,
  paidOn: payments.paidOn,
  method: payments.method,
  reference: payments.reference,
  receivedById: payments.receivedBy,
  receivedByName: receiver.fullName,
  voidedAt: payments.voidedAt,
  voidedByName: voider.fullName,
  voidReason: payments.voidReason,
  createdAt: payments.createdAt,
};

interface SelectedRow extends Omit<PaymentDto, 'voidedAt' | 'createdAt'> {
  voidedAt: Date | null;
  createdAt: Date;
}

const toDto = <T extends SelectedRow>(r: T): Omit<T, 'voidedAt' | 'createdAt'> & PaymentDto => ({
  ...r,
  voidedAt: r.voidedAt ? r.voidedAt.toISOString() : null,
  createdAt: r.createdAt.toISOString(),
});

function baseQuery(ex: Executor) {
  return ex
    .select(selection)
    .from(payments)
    .innerJoin(receiver, eq(receiver.id, payments.receivedBy))
    .leftJoin(voider, eq(voider.id, payments.voidedBy));
}

export const paymentsRepo = {
  async findDto(orgId: string, id: string, ex: Executor = db): Promise<PaymentDto | undefined> {
    const [row] = await baseQuery(ex).where(and(eq(payments.orgId, orgId), eq(payments.id, id)));
    return row ? toDto(row) : undefined;
  },

  async listForFeeItems(orgId: string, feeItemIds: string[]): Promise<PaymentDto[]> {
    if (feeItemIds.length === 0) return [];
    const rows = await baseQuery(db)
      .where(and(eq(payments.orgId, orgId), inArray(payments.feeItemId, feeItemIds)))
      .orderBy(desc(payments.paidOn), desc(payments.createdAt));
    return rows.map(toDto);
  },

  async recent(orgId: string, limit: number): Promise<RecentPaymentDto[]> {
    const rows = await db
      .select({
        ...selection,
        studentName: sql<string>`${students.firstName} || ' ' || ${students.lastName}`,
        feeTitle: feeItems.title,
      })
      .from(payments)
      .innerJoin(receiver, eq(receiver.id, payments.receivedBy))
      .leftJoin(voider, eq(voider.id, payments.voidedBy))
      .innerJoin(students, eq(students.id, payments.studentId))
      .innerJoin(feeItems, eq(feeItems.id, payments.feeItemId))
      .where(eq(payments.orgId, orgId))
      .orderBy(desc(payments.createdAt))
      .limit(limit);
    return rows.map(toDto);
  },

  /** Locks the payment row for the rest of the transaction. */
  async findForUpdate(ex: Executor, orgId: string, id: string): Promise<PaymentRow | undefined> {
    const [row] = await ex
      .select()
      .from(payments)
      .where(and(eq(payments.orgId, orgId), eq(payments.id, id)))
      .for('update');
    return row;
  },

  async insert(ex: Executor, values: PaymentInsert): Promise<string> {
    const [row] = await ex.insert(payments).values(values).returning({ id: payments.id });
    if (!row) throw new Error('Payment insert returned no row');
    return row.id;
  },

  async markVoided(
    ex: Executor,
    id: string,
    values: { voidedBy: string; voidReason: string },
  ): Promise<void> {
    await ex
      .update(payments)
      .set({ ...values, voidedAt: new Date() })
      .where(eq(payments.id, id));
  },
};
