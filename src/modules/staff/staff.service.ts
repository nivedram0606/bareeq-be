import type { z } from 'zod';

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

export const staffService = {
  async list(user: AuthUser, q: StaffListQuery): Promise<Paginated<StaffDto>> {
    const { rows, total } = await staffRepo.list(user.orgId, q);
    return paginate(rows.map(toStaffDto), total, q);
  },

  async create(user: AuthUser, input: z.output<typeof createStaffSchema>): Promise<StaffDto> {
    return toStaffDto(await staffRepo.insert(db, { ...input, orgId: user.orgId }));
  },

  async update(
    user: AuthUser,
    id: string,
    input: z.output<typeof updateStaffSchema>,
  ): Promise<StaffDto> {
    const row = await staffRepo.update(db, user.orgId, id, input);
    if (!row) throw AppError.notFound('Staff member');
    return toStaffDto(row);
  },
};
