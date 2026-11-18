import { asc, eq } from 'drizzle-orm';

import { db } from '../../db/client.js';
import type { Executor } from '../../db/client.js';
import { organizations } from '../../db/schema.js';

export type OrgRow = typeof organizations.$inferSelect;
export type OrgPatch = Partial<
  Pick<OrgRow, 'name' | 'nameAr' | 'defaultLocale' | 'brandColor' | 'logoPath'>
>;

export const orgRepo = {
  /** The pilot's single school (the oldest organization). */
  async findPrimary(): Promise<OrgRow | undefined> {
    const [row] = await db
      .select()
      .from(organizations)
      .orderBy(asc(organizations.createdAt))
      .limit(1);
    return row;
  },

  async findById(orgId: string, ex: Executor = db): Promise<OrgRow | undefined> {
    const [row] = await ex.select().from(organizations).where(eq(organizations.id, orgId));
    return row;
  },

  async update(ex: Executor, orgId: string, patch: OrgPatch): Promise<OrgRow | undefined> {
    const [row] = await ex
      .update(organizations)
      .set(patch)
      .where(eq(organizations.id, orgId))
      .returning();
    return row;
  },
};
