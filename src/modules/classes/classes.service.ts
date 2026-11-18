import type { z } from 'zod';

import { V } from '@bareeq/shared';
import type {
  ClassDto,
  ClassListQuery,
  createClassSchema,
  Paginated,
  updateClassSchema,
} from '@bareeq/shared';

import { db } from '../../db/client.js';
import type { Executor } from '../../db/client.js';
import { AppError } from '../../lib/errors.js';
import { paginate } from '../../lib/pagination.js';
import type { AuthUser } from '../../lib/types.js';
import { academicYearsRepo } from '../academicYears/academicYears.repo.js';

import { classesRepo } from './classes.repo.js';

async function assertYearInOrg(ex: Executor, orgId: string, yearId: string): Promise<void> {
  if (!(await academicYearsRepo.findInOrg(orgId, yearId, ex))) {
    throw AppError.validation('Unknown academic year', { academicYearId: V.invalidChoice });
  }
}

export const classesService = {
  async list(user: AuthUser, q: ClassListQuery): Promise<Paginated<ClassDto>> {
    const { rows, total } = await classesRepo.list(user.orgId, q);
    return paginate(rows, total, q);
  },

  async create(user: AuthUser, input: z.output<typeof createClassSchema>): Promise<ClassDto> {
    return db.transaction(async (tx) => {
      await assertYearInOrg(tx, user.orgId, input.academicYearId);
      const id = await classesRepo.insert(tx, { ...input, orgId: user.orgId });
      const dto = await classesRepo.findDto(user.orgId, id, tx);
      if (!dto) throw AppError.notFound('Class');
      return dto;
    });
  },

  async update(
    user: AuthUser,
    id: string,
    input: z.output<typeof updateClassSchema>,
  ): Promise<ClassDto> {
    return db.transaction(async (tx) => {
      if (input.academicYearId) await assertYearInOrg(tx, user.orgId, input.academicYearId);
      if (!(await classesRepo.update(tx, user.orgId, id, input))) {
        throw AppError.notFound('Class');
      }
      const dto = await classesRepo.findDto(user.orgId, id, tx);
      if (!dto) throw AppError.notFound('Class');
      return dto;
    });
  },
};
