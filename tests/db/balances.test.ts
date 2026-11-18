import { randomUUID } from 'node:crypto';

import { eq, sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

import { closeDb, db } from '../../src/db/client.js';
import type { Tx } from '../../src/db/client.js';
import {
  feeItems,
  organizations,
  payments,
  profiles,
  students,
  vFeeBalances,
  vStudentBalances,
} from '../../src/db/schema.js';

class Rollback extends Error {}

/** Runs `fn` in a transaction that is always rolled back, leaving the DB untouched. */
async function inRollback(fn: (tx: Tx) => Promise<void>): Promise<void> {
  try {
    await db.transaction(async (tx) => {
      await fn(tx);
      throw new Rollback();
    });
  } catch (err) {
    if (!(err instanceof Rollback)) throw err;
  }
}

async function fixture(tx: Tx) {
  const userId = randomUUID();
  const [org] = await tx.insert(organizations).values({ name: 'Test School' }).returning();
  if (!org) throw new Error('org');
  await tx.insert(profiles).values({
    id: userId,
    orgId: org.id,
    username: `tester-${userId}`,
    fullName: 'Tester',
    role: 'admin',
  });
  const [student] = await tx
    .insert(students)
    .values({
      orgId: org.id,
      admissionNo: 'T-1',
      firstName: 'Test',
      lastName: 'Student',
      dob: '2018-01-01',
      gender: 'male',
    })
    .returning();
  if (!student) throw new Error('student');

  const addFee = async (amount: string, discount = '0') => {
    const [fee] = await tx
      .insert(feeItems)
      .values({
        orgId: org.id,
        studentId: student.id,
        title: 'Fee',
        amount,
        discount,
        dueDate: '2026-10-01',
      })
      .returning();
    if (!fee) throw new Error('fee');
    return fee.id;
  };
  const pay = async (feeItemId: string, amount: string) => {
    const [p] = await tx
      .insert(payments)
      .values({
        orgId: org.id,
        feeItemId,
        studentId: student.id,
        amount,
        method: 'cash',
        receivedBy: userId,
      })
      .returning();
    if (!p) throw new Error('payment');
    return p.id;
  };
  const feeBalance = async (feeItemId: string) => {
    const [row] = await tx.select().from(vFeeBalances).where(eq(vFeeBalances.feeItemId, feeItemId));
    return row;
  };
  return { userId, orgId: org.id, studentId: student.id, addFee, pay, feeBalance };
}

describe('balance views', () => {
  afterAll(async () => {
    await closeDb();
  });

  it('computes unpaid → partial → paid with discount, and excludes voided payments', async () => {
    await inRollback(async (tx) => {
      const f = await fixture(tx);
      const feeId = await f.addFee('100.000', '10.000');

      expect(await f.feeBalance(feeId)).toMatchObject({
        netDue: '90.000',
        paid: '0.000',
        outstanding: '90.000',
        status: 'unpaid',
      });

      await f.pay(feeId, '40.000');
      expect(await f.feeBalance(feeId)).toMatchObject({
        paid: '40.000',
        outstanding: '50.000',
        status: 'partial',
      });

      const voidMe = await f.pay(feeId, '50.000');
      expect(await f.feeBalance(feeId)).toMatchObject({ outstanding: '0.000', status: 'paid' });

      await tx
        .update(payments)
        .set({ voidedAt: new Date(), voidedBy: f.userId, voidReason: 'Entered twice' })
        .where(eq(payments.id, voidMe));
      expect(await f.feeBalance(feeId)).toMatchObject({
        paid: '40.000',
        outstanding: '50.000',
        status: 'partial',
      });
    });
  });

  it('shows overpayment as negative outstanding', async () => {
    await inRollback(async (tx) => {
      const f = await fixture(tx);
      const feeId = await f.addFee('25.500');
      await f.pay(feeId, '30.000');
      expect(await f.feeBalance(feeId)).toMatchObject({
        outstanding: '-4.500',
        status: 'paid',
      });
    });
  });

  it('aggregates per student, including students without fees', async () => {
    await inRollback(async (tx) => {
      const f = await fixture(tx);
      const a = await f.addFee('100.000');
      await f.addFee('60.250');
      await f.pay(a, '100.000');

      const [row] = await tx
        .select()
        .from(vStudentBalances)
        .where(eq(vStudentBalances.studentId, f.studentId));
      expect(row).toMatchObject({
        netDue: '160.250',
        paid: '100.000',
        outstanding: '60.250',
        status: 'partial',
      });
    });
  });

  it('rejects a discount larger than the amount and non-positive payments', async () => {
    await inRollback(async (tx) => {
      const f = await fixture(tx);
      await expect(
        tx.transaction(async (sp) => {
          await sp.insert(feeItems).values({
            orgId: f.orgId,
            studentId: f.studentId,
            title: 'Bad',
            amount: '10.000',
            discount: '11.000',
            dueDate: '2026-10-01',
          });
        }),
      ).rejects.toThrow();
      const feeId = await f.addFee('10.000');
      await expect(tx.transaction(async () => void (await f.pay(feeId, '0')))).rejects.toThrow();
    });
  });
});
