import { and, count, eq, ilike, or, sql } from 'drizzle-orm';

import type { ClassDto, ClassListQuery } from '@bareeq/shared';

import { db } from '../../db/client.js';
import type { Executor } from '../../db/client.js';
import { academicYears, classes } from '../../db/schema.js';
import { likePattern, offsetOf, orderByOf } from '../../lib/pagination.js';

type ClassRow = typeof classes.$inferSelect;
type ClassInsert = typeof classes.$inferInsert;
export type ClassPatch = Partial<Pick<ClassRow, 'name' | 'grade' | 'section' | 'academicYearId'>>;

// Correlated subquery with explicit qualification (see fees.repo.ts for why).
const activeStudentCount = sql<number>`(
  select count(*)::int from "students" s
  where s."class_id" = "classes"."id" and s."status" = 'active'
)`;

const selection = {
  id: classes.id,
  name: classes.name,
  grade: classes.grade,
  section: classes.section,
  academicYearId: classes.academicYearId,
  academicYearName: academicYears.name,
  studentCount: activeStudentCount,
};

export const classesRepo = {
  async list(orgId: string, q: ClassListQuery): Promise<{ rows: ClassDto[]; total: number }> {
    const where = and(
      eq(classes.orgId, orgId),
      q.academicYearId ? eq(classes.academicYearId, q.academicYearId) : undefined,
      q.search
        ? or(
            ilike(classes.name, likePattern(q.search)),
            ilike(classes.grade, likePattern(q.search)),
          )
        : undefined,
    );
    const orderBy = orderByOf(
      q.sort,
      { name: classes.name, grade: classes.grade },
      sql`${academicYears.startDate} desc, ${classes.name} asc`,
    );
    const [rows, [{ total } = { total: 0 }]] = await Promise.all([
      db
        .select(selection)
        .from(classes)
        .innerJoin(academicYears, eq(academicYears.id, classes.academicYearId))
        .where(where)
        .orderBy(orderBy)
        .limit(q.pageSize)
        .offset(offsetOf(q)),
      db.select({ total: count() }).from(classes).where(where),
    ]);
    return { rows, total };
  },

  async findDto(orgId: string, id: string, ex: Executor = db): Promise<ClassDto | undefined> {
    const [row] = await ex
      .select(selection)
      .from(classes)
      .innerJoin(academicYears, eq(academicYears.id, classes.academicYearId))
      .where(and(eq(classes.orgId, orgId), eq(classes.id, id)));
    return row;
  },

  async exists(orgId: string, id: string, ex: Executor = db): Promise<boolean> {
    const [row] = await ex
      .select({ id: classes.id })
      .from(classes)
      .where(and(eq(classes.orgId, orgId), eq(classes.id, id)));
    return Boolean(row);
  },

  async insert(ex: Executor, values: ClassInsert): Promise<string> {
    const [row] = await ex.insert(classes).values(values).returning({ id: classes.id });
    if (!row) throw new Error('Class insert returned no row');
    return row.id;
  },

  async update(ex: Executor, orgId: string, id: string, patch: ClassPatch): Promise<boolean> {
    const rows = await ex
      .update(classes)
      .set(patch)
      .where(and(eq(classes.orgId, orgId), eq(classes.id, id)))
      .returning({ id: classes.id });
    return rows.length > 0;
  },
};
