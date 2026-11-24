import type { z } from 'zod';

import { V } from '@bareeq/shared';
import type {
  createStaffSchema,
  Paginated,
  StaffDto,
  StaffListQuery,
  updateStaffSchema,
} from '@bareeq/shared';

import { db } from '../../db/client.js';
import { AppError } from '../../lib/errors.js';
import { paginate } from '../../lib/pagination.js';
import type { AuthUser } from '../../lib/types.js';

import { staffRepo, toStaffDto } from './staff.repo.js';

/** One record per person: the e-mail and the phone number can't belong to another staff member. */
async function assertNotDuplicate(
  orgId: string,
  input: { email?: string | null; phone?: string | null },
  exceptId?: string,
): Promise<void> {
  if (!input.email && !input.phone) return;
  const dup = await staffRepo.findDuplicate(orgId, input, exceptId);
  const details: Record<string, string> = {};
  if (dup.email) details.email = V.duplicateStaffEmail;
  if (dup.phone) details.phone = V.duplicateStaffPhone;
  if (Object.keys(details).length > 0) {
    throw AppError.validation('Another staff member already has these contact details', details);
  }
}

export const staffService = {
  async list(user: AuthUser, q: StaffListQuery): Promise<Paginated<StaffDto>> {
    const { rows, total } = await staffRepo.list(user.orgId, q);
    return paginate(rows.map(toStaffDto), total, q);
  },

  async create(user: AuthUser, input: z.output<typeof createStaffSchema>): Promise<StaffDto> {
    await assertNotDuplicate(user.orgId, input);
    return toStaffDto(await staffRepo.insert(db, { ...input, orgId: user.orgId }));
  },

  async update(
    user: AuthUser,
    id: string,
    input: z.output<typeof updateStaffSchema>,
  ): Promise<StaffDto> {
    await assertNotDuplicate(user.orgId, input, id);
    const row = await staffRepo.update(db, user.orgId, id, input);
    if (!row) throw AppError.notFound('Staff member');
    return toStaffDto(row);
  },
};
