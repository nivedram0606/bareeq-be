import type { z } from 'zod';

import { V } from '@bareeq/shared';
import type {
  AcademicYearDto,
  createAcademicYearSchema,
  ListQuery,
  Paginated,
  updateAcademicYearSchema,
} from '@bareeq/shared';

import { db } from '../../db/client.js';
import { AppError } from '../../lib/errors.js';
import { paginate } from '../../lib/pagination.js';
import type { AuthUser } from '../../lib/types.js';

import { academicYearsRepo, toYearDto } from './academicYears.repo.js';

export const academicYearsService = {
  async list(user: AuthUser, q: ListQuery): Promise<Paginated<AcademicYearDto>> {
    const { rows, total } = await academicYearsRepo.list(user.orgId, q);
    return paginate(rows.map(toYearDto), total, q);
  },

  async create(
    user: AuthUser,
    input: z.output<typeof createAcademicYearSchema>,
  ): Promise<AcademicYearDto> {
    return db.transaction(async (tx) => {
      if (input.isCurrent) await academicYearsRepo.clearCurrent(tx, user.orgId);
      const row = await academicYearsRepo.insert(tx, { ...input, orgId: user.orgId });
      return toYearDto(row);
    });
  },

  async update(
    user: AuthUser,
    id: string,
    input: z.output<typeof updateAcademicYearSchema>,
  ): Promise<AcademicYearDto> {
    return db.transaction(async (tx) => {
      const before = await academicYearsRepo.findInOrg(user.orgId, id, tx);
      if (!before) throw AppError.notFound('Academic year');
      const startDate = input.startDate ?? before.startDate;
      const endDate = input.endDate ?? before.endDate;
      if (endDate <= startDate) {
        throw AppError.validation('End date must be after start date', {
          endDate: V.endBeforeStart,
        });
      }
      if (input.isCurrent) await academicYearsRepo.clearCurrent(tx, user.orgId, id);
      const row = await academicYearsRepo.update(tx, user.orgId, id, input);
      if (!row) throw AppError.notFound('Academic year');
      return toYearDto(row);
    });
  },
};
