import type { z } from 'zod';

import { V } from '@bareeq/shared';
import type { createGuardianSchema, GuardianDto, updateGuardianSchema } from '@bareeq/shared';

import { db } from '../../db/client.js';
import { AppError } from '../../lib/errors.js';
import type { AuthUser } from '../../lib/types.js';
import { studentsRepo } from '../students/students.repo.js';

import { guardiansRepo, toGuardianDto } from './guardians.repo.js';

/** The primary contact must be reachable (BUG-007). */
function assertPrimaryHasPhone(isPrimary: boolean, phone: string | null | undefined): void {
  if (isPrimary && !phone) {
    throw AppError.validation('The primary contact needs a phone number', {
      phone: V.primaryPhoneRequired,
    });
  }
}

export const guardiansService = {
  async list(user: AuthUser, studentId: string): Promise<GuardianDto[]> {
    if (!(await studentsRepo.findRow(user.orgId, studentId))) throw AppError.notFound('Student');
    const rows = await guardiansRepo.listForStudent(user.orgId, studentId);
    return rows.map(toGuardianDto);
  },

  async create(
    user: AuthUser,
    studentId: string,
    input: z.output<typeof createGuardianSchema>,
  ): Promise<GuardianDto> {
    return db.transaction(async (tx) => {
      if (!(await studentsRepo.findRow(user.orgId, studentId, tx))) {
        throw AppError.notFound('Student');
      }
      // The first guardian is always primary; a new primary replaces the previous one.
      const isPrimary =
        input.isPrimary || (await guardiansRepo.countForStudent(tx, studentId)) === 0;
      assertPrimaryHasPhone(isPrimary, input.phone);
      if (isPrimary) await guardiansRepo.clearPrimary(tx, studentId);
      const row = await guardiansRepo.insert(tx, {
        ...input,
        isPrimary,
        studentId,
        orgId: user.orgId,
      });
      return toGuardianDto(row);
    });
  },

  async update(
    user: AuthUser,
    id: string,
    input: z.output<typeof updateGuardianSchema>,
  ): Promise<GuardianDto> {
    return db.transaction(async (tx) => {
      const before = await guardiansRepo.findInOrg(user.orgId, id, tx);
      if (!before) throw AppError.notFound('Guardian');
      if (input.isPrimary === false && before.isPrimary) {
        throw AppError.conflict('Mark another guardian as primary instead', {
          isPrimary: 'validation.primary_required',
        });
      }
      assertPrimaryHasPhone(
        input.isPrimary ?? before.isPrimary,
        input.phone === undefined ? before.phone : input.phone,
      );
      if (input.isPrimary) await guardiansRepo.clearPrimary(tx, before.studentId, id);
      const row = await guardiansRepo.update(tx, id, input);
      if (!row) throw AppError.notFound('Guardian');
      return toGuardianDto(row);
    });
  },

  async remove(user: AuthUser, id: string): Promise<void> {
    await db.transaction(async (tx) => {
      const before = await guardiansRepo.findInOrg(user.orgId, id, tx);
      if (!before) throw AppError.notFound('Guardian');
      await guardiansRepo.delete(tx, id);
      if (before.isPrimary) await guardiansRepo.promoteOldest(tx, before.studentId);
    });
  },
};
