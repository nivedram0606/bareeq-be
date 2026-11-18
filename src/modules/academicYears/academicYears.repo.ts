import { and, count, eq, ilike, ne, sql } from 'drizzle-orm';

import type { AcademicYearDto, ListQuery } from '@bareeq/shared';

import { db } from '../../db/client.js';
import type { Executor } from '../../db/client.js';
import { academicYears } from '../../db/schema.js';
import { likePattern, offsetOf, orderByOf } from '../../lib/pagination.js';

type YearRow = typeof academicYears.$inferSelect;
type YearInsert = typeof academicYears.$inferInsert;
export type YearPatch = Partial<Pick<YearRow, 'name' | 'startDate' | 'endDate' | 'isCurrent'>>;

export const toYearDto = (r: YearRow): AcademicYearDto => ({
  id: r.id,
  name: r.name,
  startDate: r.startDate,
  endDate: r.endDate,
  isCurrent: r.isCurrent,
});

export const academicYearsRepo = {
  async list(orgId: string, q: ListQuery): Promise<{ rows: YearRow[]; total: number }> {
    const where = and(
      eq(academicYears.orgId, orgId),
      q.search ? ilike(academicYears.name, likePattern(q.search)) : undefined,
    );
    const orderBy = orderByOf(
      q.sort,
      { name: academicYears.name, startDate: academicYears.startDate },
      sql`${academicYears.startDate} desc`,
    );
    const [rows, [{ total } = { total: 0 }]] = await Promise.all([
      db
        .select()
        .from(academicYears)
        .where(where)
        .orderBy(orderBy)
        .limit(q.pageSize)
        .offset(offsetOf(q)),
      db.select({ total: count() }).from(academicYears).where(where),
    ]);
    return { rows, total };
  },

  async findInOrg(orgId: string, id: string, ex: Executor = db): Promise<YearRow | undefined> {
    const [row] = await ex
      .select()
      .from(academicYears)
      .where(and(eq(academicYears.orgId, orgId), eq(academicYears.id, id)));
    return row;
  },

  /** Clears `is_current` on every other year of the org (only one may be current). */
  async clearCurrent(ex: Executor, orgId: string, exceptId?: string): Promise<void> {
    await ex
      .update(academicYears)
      .set({ isCurrent: false })
      .where(
        and(
          eq(academicYears.orgId, orgId),
          eq(academicYears.isCurrent, true),
          exceptId ? ne(academicYears.id, exceptId) : undefined,
        ),
      );
  },

  async insert(ex: Executor, values: YearInsert): Promise<YearRow> {
    const [row] = await ex.insert(academicYears).values(values).returning();
    if (!row) throw new Error('Academic year insert returned no row');
    return row;
  },

  async update(
    ex: Executor,
    orgId: string,
    id: string,
    patch: YearPatch,
  ): Promise<YearRow | undefined> {
    const [row] = await ex
      .update(academicYears)
      .set(patch)
      .where(and(eq(academicYears.orgId, orgId), eq(academicYears.id, id)))
      .returning();
    return row;
  },
};
