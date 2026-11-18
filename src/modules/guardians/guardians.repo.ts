import { and, asc, desc, eq, ne } from 'drizzle-orm';

import type { GuardianDto } from '@bareeq/shared';

import { db } from '../../db/client.js';
import type { Executor } from '../../db/client.js';
import { guardians } from '../../db/schema.js';

type GuardianRow = typeof guardians.$inferSelect;
type GuardianInsert = typeof guardians.$inferInsert;
export type GuardianPatch = Partial<
  Pick<GuardianRow, 'name' | 'relation' | 'phone' | 'email' | 'isPrimary'>
>;

export const toGuardianDto = (r: GuardianRow): GuardianDto => ({
  id: r.id,
  studentId: r.studentId,
  name: r.name,
  relation: r.relation,
  phone: r.phone,
  email: r.email,
  isPrimary: r.isPrimary,
});

export const guardiansRepo = {
  async listForStudent(orgId: string, studentId: string): Promise<GuardianRow[]> {
    return db
      .select()
      .from(guardians)
      .where(and(eq(guardians.orgId, orgId), eq(guardians.studentId, studentId)))
      .orderBy(desc(guardians.isPrimary), asc(guardians.createdAt));
  },

  async findInOrg(orgId: string, id: string, ex: Executor = db): Promise<GuardianRow | undefined> {
    const [row] = await ex
      .select()
      .from(guardians)
      .where(and(eq(guardians.orgId, orgId), eq(guardians.id, id)));
    return row;
  },

  async countForStudent(ex: Executor, studentId: string): Promise<number> {
    const rows = await ex
      .select({ id: guardians.id })
      .from(guardians)
      .where(eq(guardians.studentId, studentId));
    return rows.length;
  },

  /** Clears the primary flag on the student's other guardians. */
  async clearPrimary(ex: Executor, studentId: string, exceptId?: string): Promise<void> {
    await ex
      .update(guardians)
      .set({ isPrimary: false })
      .where(
        and(
          eq(guardians.studentId, studentId),
          eq(guardians.isPrimary, true),
          exceptId ? ne(guardians.id, exceptId) : undefined,
        ),
      );
  },

  /** Makes the oldest remaining guardian primary (after the primary one was removed). */
  async promoteOldest(ex: Executor, studentId: string): Promise<void> {
    const [oldest] = await ex
      .select({ id: guardians.id })
      .from(guardians)
      .where(eq(guardians.studentId, studentId))
      .orderBy(asc(guardians.createdAt))
      .limit(1);
    if (oldest)
      await ex.update(guardians).set({ isPrimary: true }).where(eq(guardians.id, oldest.id));
  },

  async insert(ex: Executor, values: GuardianInsert): Promise<GuardianRow> {
    const [row] = await ex.insert(guardians).values(values).returning();
    if (!row) throw new Error('Guardian insert returned no row');
    return row;
  },

  async update(ex: Executor, id: string, patch: GuardianPatch): Promise<GuardianRow | undefined> {
    const [row] = await ex.update(guardians).set(patch).where(eq(guardians.id, id)).returning();
    return row;
  },

  async delete(ex: Executor, id: string): Promise<void> {
    await ex.delete(guardians).where(eq(guardians.id, id));
  },
};
