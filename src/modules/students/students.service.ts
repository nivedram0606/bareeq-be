import type { z } from 'zod';

import { V } from '@bareeq/shared';
import type {
  createStudentSchema,
  Paginated,
  StudentDto,
  StudentListQuery,
  updateStudentSchema,
} from '@bareeq/shared';

import { db } from '../../db/client.js';
import type { Executor } from '../../db/client.js';
import { diffOf, writeAudit } from '../../lib/audit.js';
import { AppError, findPgError } from '../../lib/errors.js';
import { paginate } from '../../lib/pagination.js';
import type { AuthUser } from '../../lib/types.js';
import { classesRepo } from '../classes/classes.repo.js';

import { studentsRepo } from './students.repo.js';

async function assertClassInOrg(ex: Executor, orgId: string, classId: string | null | undefined) {
  if (classId && !(await classesRepo.exists(orgId, classId, ex))) {
    throw AppError.validation('Unknown class', { classId: V.invalidChoice });
  }
}

/** Maps the unique (org, admission_no) violation onto a field-level 409. */
async function withAdmissionNoCheck<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (findPgError(err)?.constraint_name === 'students_org_admission_no_key') {
      throw AppError.conflict('Admission number is already in use', {
        admissionNo: 'validation.admission_no_taken',
      });
    }
    throw err;
  }
}

export const studentsService = {
  async list(user: AuthUser, q: StudentListQuery): Promise<Paginated<StudentDto>> {
    const { rows, total } = await studentsRepo.list(user.orgId, q);
    return paginate(rows, total, q);
  },

  async get(user: AuthUser, id: string): Promise<StudentDto> {
    const dto = await studentsRepo.findDto(user.orgId, id);
    if (!dto) throw AppError.notFound('Student');
    return dto;
  },

  async create(user: AuthUser, input: z.output<typeof createStudentSchema>): Promise<StudentDto> {
    return withAdmissionNoCheck(() =>
      db.transaction(async (tx) => {
        await assertClassInOrg(tx, user.orgId, input.classId);
        const id = await studentsRepo.insert(tx, { ...input, orgId: user.orgId });
        await writeAudit(tx, {
          orgId: user.orgId,
          actorId: user.id,
          entity: 'student',
          entityId: id,
          action: 'create',
          diff: { admissionNo: input.admissionNo, status: input.status },
        });
        const dto = await studentsRepo.findDto(user.orgId, id, tx);
        if (!dto) throw AppError.notFound('Student');
        return dto;
      }),
    );
  },

  async update(
    user: AuthUser,
    id: string,
    input: z.output<typeof updateStudentSchema>,
  ): Promise<StudentDto> {
    return withAdmissionNoCheck(() =>
      db.transaction(async (tx) => {
        const before = await studentsRepo.findRow(user.orgId, id, tx);
        if (!before) throw AppError.notFound('Student');
        await assertClassInOrg(tx, user.orgId, input.classId);
        await studentsRepo.update(tx, user.orgId, id, input);

        const diff = diffOf(before, input);
        if (diff.status) {
          await writeAudit(tx, {
            orgId: user.orgId,
            actorId: user.id,
            entity: 'student',
            entityId: id,
            action: 'status_change',
            diff: { status: diff.status },
          });
        }
        const dto = await studentsRepo.findDto(user.orgId, id, tx);
        if (!dto) throw AppError.notFound('Student');
        return dto;
      }),
    );
  },
};
