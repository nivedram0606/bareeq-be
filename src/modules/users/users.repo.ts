import { and, count, eq, ilike, or, sql } from 'drizzle-orm';

import type { ListQuery, ProfileDto } from '@bareeq/shared';

import { db } from '../../db/client.js';
import type { Executor } from '../../db/client.js';
import { profiles } from '../../db/schema.js';
import { likePattern, offsetOf, orderByOf } from '../../lib/pagination.js';

type ProfileRow = typeof profiles.$inferSelect;
type ProfileInsert = typeof profiles.$inferInsert;

export const toProfileDto = (r: ProfileRow): ProfileDto => ({
  id: r.id,
  orgId: r.orgId,
  username: r.username,
  fullName: r.fullName,
  email: r.email,
  role: r.role,
  isActive: r.isActive,
  createdAt: r.createdAt.toISOString(),
});

export const usersRepo = {
  /** Unscoped lookup by auth user id — only for authentication, which establishes the org. */
  async findById(id: string, ex: Executor = db): Promise<ProfileRow | undefined> {
    const [row] = await ex.select().from(profiles).where(eq(profiles.id, id));
    return row;
  },

  /** Case-insensitive lookup by login name — only for sign-in. */
  async findByUsername(username: string, ex: Executor = db): Promise<ProfileRow | undefined> {
    const [row] = await ex
      .select()
      .from(profiles)
      .where(sql`lower(${profiles.username}) = ${username.toLowerCase()}`);
    return row;
  },

  async findInOrg(orgId: string, id: string, ex: Executor = db): Promise<ProfileRow | undefined> {
    const [row] = await ex
      .select()
      .from(profiles)
      .where(and(eq(profiles.orgId, orgId), eq(profiles.id, id)));
    return row;
  },

  async list(orgId: string, q: ListQuery): Promise<{ rows: ProfileRow[]; total: number }> {
    const where = and(
      eq(profiles.orgId, orgId),
      q.search
        ? or(
            ilike(profiles.fullName, likePattern(q.search)),
            ilike(profiles.username, likePattern(q.search)),
            ilike(profiles.email, likePattern(q.search)),
          )
        : undefined,
    );
    const orderBy = orderByOf(
      q.sort,
      {
        fullName: profiles.fullName,
        username: profiles.username,
        email: profiles.email,
        role: profiles.role,
      },
      sql`${profiles.fullName} asc`,
    );
    const [rows, [{ total } = { total: 0 }]] = await Promise.all([
      db
        .select()
        .from(profiles)
        .where(where)
        .orderBy(orderBy)
        .limit(q.pageSize)
        .offset(offsetOf(q)),
      db.select({ total: count() }).from(profiles).where(where),
    ]);
    return { rows, total };
  },

  /** True once any admin profile exists (in any organization). */
  async anyAdminExists(ex: Executor = db): Promise<boolean> {
    const [row] = await ex
      .select({ id: profiles.id })
      .from(profiles)
      .where(eq(profiles.role, 'admin'))
      .limit(1);
    return Boolean(row);
  },

  async insert(ex: Executor, values: ProfileInsert): Promise<ProfileRow> {
    const [row] = await ex.insert(profiles).values(values).returning();
    if (!row) throw new Error('Profile insert returned no row');
    return row;
  },

  /** Stores a new password hash and revokes every existing session token of the user. */
  async setPassword(ex: Executor, id: string, passwordHash: string): Promise<boolean> {
    const rows = await ex
      .update(profiles)
      .set({ passwordHash, sessionVersion: sql`${profiles.sessionVersion} + 1` })
      .where(eq(profiles.id, id))
      .returning({ id: profiles.id });
    return rows.length > 0;
  },

  async update(
    ex: Executor,
    orgId: string,
    id: string,
    patch: Partial<Pick<ProfileRow, 'role' | 'isActive' | 'passwordHash'>>,
  ): Promise<ProfileRow | undefined> {
    const [row] = await ex
      .update(profiles)
      .set(patch)
      .where(and(eq(profiles.orgId, orgId), eq(profiles.id, id)))
      .returning();
    return row;
  },
};
