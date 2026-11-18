import { and, count, eq, ilike, or, sql } from 'drizzle-orm';

import type { StaffDto, StaffListQuery } from '@bareeq/shared';

import { db } from '../../db/client.js';
import type { Executor } from '../../db/client.js';
import { staff } from '../../db/schema.js';
import { likePattern, offsetOf, orderByOf } from '../../lib/pagination.js';

type StaffRow = typeof staff.$inferSelect;
type StaffInsert = typeof staff.$inferInsert;
export type StaffPatch = Partial<
  Pick<StaffRow, 'fullName' | 'designation' | 'phone' | 'email' | 'status'>
>;

export const toStaffDto = (r: StaffRow): StaffDto => ({
  id: r.id,
  fullName: r.fullName,
  designation: r.designation,
  phone: r.phone,
  email: r.email,
  status: r.status,
});

export const staffRepo = {
  async list(orgId: string, q: StaffListQuery): Promise<{ rows: StaffRow[]; total: number }> {
    const pattern = q.search ? likePattern(q.search) : undefined;
    const where = and(
      eq(staff.orgId, orgId),
      q.status ? eq(staff.status, q.status) : undefined,
      pattern
        ? or(
            ilike(staff.fullName, pattern),
            ilike(staff.designation, pattern),
            ilike(staff.email, pattern),
            ilike(staff.phone, pattern),
          )
        : undefined,
    );
    const orderBy = orderByOf(
      q.sort,
      { fullName: staff.fullName, designation: staff.designation, status: staff.status },
      sql`lower(${staff.fullName}) asc`,
    );
    const [rows, [{ total } = { total: 0 }]] = await Promise.all([
      db.select().from(staff).where(where).orderBy(orderBy).limit(q.pageSize).offset(offsetOf(q)),
      db.select({ total: count() }).from(staff).where(where),
    ]);
    return { rows, total };
  },

  async insert(ex: Executor, values: StaffInsert): Promise<StaffRow> {
    const [row] = await ex.insert(staff).values(values).returning();
    if (!row) throw new Error('Staff insert returned no row');
    return row;
  },

  async update(
    ex: Executor,
    orgId: string,
    id: string,
    patch: StaffPatch,
  ): Promise<StaffRow | undefined> {
    const [row] = await ex
      .update(staff)
      .set(patch)
      .where(and(eq(staff.orgId, orgId), eq(staff.id, id)))
      .returning();
    return row;
  },
};
