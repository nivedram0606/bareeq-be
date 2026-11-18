import type { z } from 'zod';

import { toBaisa, V } from '@bareeq/shared';
import type { createFeeSchema, FeeItemDto, StudentFeesDto, updateFeeSchema } from '@bareeq/shared';

import { db } from '../../db/client.js';
import type { Executor } from '../../db/client.js';
import { diffOf, writeAudit } from '../../lib/audit.js';
import { AppError } from '../../lib/errors.js';
import type { AuthUser } from '../../lib/types.js';
import { academicYearsRepo } from '../academicYears/academicYears.repo.js';
import { paymentsRepo } from '../payments/payments.repo.js';
import { studentsRepo } from '../students/students.repo.js';

import { feesRepo } from './fees.repo.js';

async function assertYearInOrg(ex: Executor, orgId: string, yearId: string | null | undefined) {
  if (yearId && !(await academicYearsRepo.findInOrg(orgId, yearId, ex))) {
    throw AppError.validation('Unknown academic year', { academicYearId: V.invalidChoice });
  }
}

export const feesService = {
  /** Fee items with balances and full payment history (voided included) for one student. */
  async studentFees(user: AuthUser, studentId: string): Promise<StudentFeesDto> {
    if (!(await studentsRepo.findRow(user.orgId, studentId))) throw AppError.notFound('Student');
    const [items, summary] = await Promise.all([
      feesRepo.listForStudent(user.orgId, studentId),
      feesRepo.studentSummary(user.orgId, studentId),
    ]);
    const allPayments = await paymentsRepo.listForFeeItems(
      user.orgId,
      items.map((i) => i.id),
    );
    return {
      summary: summary ?? { netDue: '0.000', paid: '0.000', outstanding: '0.000', status: 'paid' },
      items: items.map((item) => ({
        ...item,
        payments: allPayments.filter((p) => p.feeItemId === item.id),
      })),
    };
  },

  async create(user: AuthUser, input: z.output<typeof createFeeSchema>): Promise<FeeItemDto> {
    return db.transaction(async (tx) => {
      if (!(await studentsRepo.findRow(user.orgId, input.studentId, tx))) {
        throw AppError.validation('Unknown student', { studentId: V.invalidChoice });
      }
      await assertYearInOrg(tx, user.orgId, input.academicYearId);
      const id = await feesRepo.insert(tx, { ...input, orgId: user.orgId });
      await writeAudit(tx, {
        orgId: user.orgId,
        actorId: user.id,
        entity: 'fee_item',
        entityId: id,
        action: 'create',
        diff: { title: input.title, amount: input.amount, discount: input.discount },
      });
      const dto = await feesRepo.findDto(user.orgId, id, tx);
      if (!dto) throw AppError.notFound('Fee item');
      return dto;
    });
  },

  /** Fees are editable only while they have no non-voided payments. */
  async update(
    user: AuthUser,
    id: string,
    input: z.output<typeof updateFeeSchema>,
  ): Promise<FeeItemDto> {
    return db.transaction(async (tx) => {
      const before = await feesRepo.findForUpdate(tx, user.orgId, id);
      if (!before) throw AppError.notFound('Fee item');
      if (await feesRepo.hasActivePayments(tx, id)) {
        throw AppError.conflict('This fee has payments and can no longer be edited');
      }
      const amount = input.amount ?? before.amount;
      const discount = input.discount ?? before.discount;
      if (toBaisa(discount) > toBaisa(amount)) {
        throw AppError.validation('Discount cannot exceed the amount', {
          discount: V.discountTooLarge,
        });
      }
      await assertYearInOrg(tx, user.orgId, input.academicYearId);
      await feesRepo.update(tx, id, input);

      const diff = diffOf(before, input);
      if (Object.keys(diff).length > 0) {
        await writeAudit(tx, {
          orgId: user.orgId,
          actorId: user.id,
          entity: 'fee_item',
          entityId: id,
          action: 'update',
          diff,
        });
      }
      const dto = await feesRepo.findDto(user.orgId, id, tx);
      if (!dto) throw AppError.notFound('Fee item');
      return dto;
    });
  },
};
