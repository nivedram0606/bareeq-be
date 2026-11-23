import { and, count, eq, ilike, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import type { RecordStatus, StudentDto, StudentListQuery } from '@bareeq/shared';

import { db } from '../../db/client.js';
import type { Executor } from '../../db/client.js';
import { classes, guardians, students } from '../../db/schema.js';
import { likePattern, offsetOf, orderByOf } from '../../lib/pagination.js';

type StudentRow = typeof students.$inferSelect;
type StudentInsert = typeof students.$inferInsert;
export type StudentPatch = Partial<Omit<StudentRow, 'id' | 'orgId' | 'createdAt' | 'updatedAt'>>;

/** Primary guardian joined 1:1 (at most one primary per student, by unique index). */
const primaryGuardian = and(eq(guardians.studentId, students.id), eq(guardians.isPrimary, true));

const selection = {
  id: students.id,
  admissionNo: students.admissionNo,
  firstName: students.firstName,
  lastName: students.lastName,
  nameAr: students.nameAr,
  dob: students.dob,
  gender: students.gender,
  classId: students.classId,
  className: classes.name,
  status: students.status,
  joinedOn: students.joinedOn,
  primaryGuardianName: guardians.name,
  primaryGuardianPhone: guardians.phone,
  createdAt: students.createdAt,
};

interface SelectedRow extends Omit<StudentDto, 'gender' | 'createdAt'> {
  gender: string;
  createdAt: Date;
}

const toDto = (r: SelectedRow): StudentDto => ({
  ...r,
  gender: r.gender as StudentDto['gender'],
  createdAt: r.createdAt.toISOString(),
});

export interface StudentFilters {
  classId?: string;
  status?: RecordStatus;
  search?: string;
}

/** WHERE clause shared by the student list and the student report. */
export function studentWhere(orgId: string, f: StudentFilters): SQL | undefined {
  const pattern = f.search ? likePattern(f.search) : undefined;
  return and(
    eq(students.orgId, orgId),
    f.classId ? eq(students.classId, f.classId) : undefined,
    f.status ? eq(students.status, f.status) : undefined,
    pattern
      ? or(
          ilike(students.admissionNo, pattern),
          ilike(students.firstName, pattern),
          ilike(students.lastName, pattern),
          ilike(students.nameAr, pattern),
          ilike(sql`${students.firstName} || ' ' || ${students.lastName}`, pattern),
        )
      : undefined,
  );
}

/**
 * Natural order for admission numbers (collation from migration 0005): digit runs compare as
 * numbers, so ADM-2 < ADM-10 < ADM-100 where plain text order gives ADM-10 < ADM-100 < ADM-2.
 */
const admissionNoNatural = sql`${students.admissionNo} collate "natural_sort"`;

export const studentSortColumns = {
  admissionNo: admissionNoNatural,
  firstName: students.firstName,
  lastName: students.lastName,
  className: classes.name,
  status: students.status,
  joinedOn: students.joinedOn,
  createdAt: students.createdAt,
};
export const defaultStudentOrder = sql`${admissionNoNatural} asc`;

export const studentsRepo = {
  async list(orgId: string, q: StudentListQuery): Promise<{ rows: StudentDto[]; total: number }> {
    const where = studentWhere(orgId, q);
    const [rows, [{ total } = { total: 0 }]] = await Promise.all([
      db
        .select(selection)
        .from(students)
        .leftJoin(classes, eq(classes.id, students.classId))
        .leftJoin(guardians, primaryGuardian)
        .where(where)
        .orderBy(orderByOf(q.sort, studentSortColumns, defaultStudentOrder))
        .limit(q.pageSize)
        .offset(offsetOf(q)),
      db.select({ total: count() }).from(students).where(where),
    ]);
    return { rows: rows.map(toDto), total };
  },

  async findDto(orgId: string, id: string, ex: Executor = db): Promise<StudentDto | undefined> {
    const [row] = await ex
      .select(selection)
      .from(students)
      .leftJoin(classes, eq(classes.id, students.classId))
      .leftJoin(guardians, primaryGuardian)
      .where(and(eq(students.orgId, orgId), eq(students.id, id)));
    return row ? toDto(row) : undefined;
  },

  async findRow(orgId: string, id: string, ex: Executor = db): Promise<StudentRow | undefined> {
    const [row] = await ex
      .select()
      .from(students)
      .where(and(eq(students.orgId, orgId), eq(students.id, id)));
    return row;
  },

  async insert(ex: Executor, values: StudentInsert): Promise<string> {
    const [row] = await ex.insert(students).values(values).returning({ id: students.id });
    if (!row) throw new Error('Student insert returned no row');
    return row.id;
  },

  async update(ex: Executor, orgId: string, id: string, patch: StudentPatch): Promise<void> {
    await ex
      .update(students)
      .set(patch)
      .where(and(eq(students.orgId, orgId), eq(students.id, id)));
  },
};
