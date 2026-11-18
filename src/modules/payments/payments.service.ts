import type { z } from 'zod';

import type { createPaymentSchema, PaymentDto, voidPaymentSchema } from '@bareeq/shared';

import { db } from '../../db/client.js';
import { writeAudit } from '../../lib/audit.js';
import { AppError } from '../../lib/errors.js';
import type { AuthUser } from '../../lib/types.js';
import { feesRepo } from '../fees/fees.repo.js';

import { paymentsRepo } from './payments.repo.js';

export const paymentsService = {
  /**
   * Records a manual payment. Partial and multiple payments are allowed; overpayment is allowed
   * (shown as negative outstanding). Runs in one transaction with its audit row.
   */
  async create(user: AuthUser, input: z.output<typeof createPaymentSchema>): Promise<PaymentDto> {
    return db.transaction(async (tx) => {
      const fee = await feesRepo.findForUpdate(tx, user.orgId, input.feeItemId);
      if (!fee) throw AppError.notFound('Fee item');
      const id = await paymentsRepo.insert(tx, {
        ...input,
        orgId: user.orgId,
        studentId: fee.studentId,
        receivedBy: user.id,
      });
      await writeAudit(tx, {
        orgId: user.orgId,
        actorId: user.id,
        entity: 'payment',
        entityId: id,
        action: 'create',
        diff: {
          feeItemId: fee.id,
          amount: input.amount,
          method: input.method,
          paidOn: input.paidOn,
        },
      });
      const dto = await paymentsRepo.findDto(user.orgId, id, tx);
      if (!dto) throw AppError.notFound('Payment');
      return dto;
    });
  },

  /** Payments are immutable; an admin may void one (excluded from balances from then on). */
  async void(
    user: AuthUser,
    id: string,
    input: z.output<typeof voidPaymentSchema>,
  ): Promise<PaymentDto> {
    return db.transaction(async (tx) => {
      const payment = await paymentsRepo.findForUpdate(tx, user.orgId, id);
      if (!payment) throw AppError.notFound('Payment');
      if (payment.voidedAt) throw AppError.conflict('This payment is already voided');
      await paymentsRepo.markVoided(tx, id, { voidedBy: user.id, voidReason: input.reason });
      await writeAudit(tx, {
        orgId: user.orgId,
        actorId: user.id,
        entity: 'payment',
        entityId: id,
        action: 'void',
        diff: { amount: payment.amount, reason: input.reason },
      });
      const dto = await paymentsRepo.findDto(user.orgId, id, tx);
      if (!dto) throw AppError.notFound('Payment');
      return dto;
    });
  },
};
