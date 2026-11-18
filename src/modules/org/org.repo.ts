import { asc, eq, getTableColumns } from 'drizzle-orm';

import { db } from '../../db/client.js';
import type { Executor } from '../../db/client.js';
import { organizations } from '../../db/schema.js';

/** Every column except the logo bytes, which are only read by `GET /branding/logo`. */
const { logoData: _logoData, ...orgColumns } = getTableColumns(organizations);

export type OrgRow = Omit<typeof organizations.$inferSelect, 'logoData'>;
export type OrgPatch = Partial<
  Pick<
    typeof organizations.$inferInsert,
    'name' | 'nameAr' | 'defaultLocale' | 'brandColor' | 'logoPath' | 'logoMime' | 'logoData'
  >
>;

export const orgRepo = {
  /** The pilot's single school (the oldest organization). */
  async findPrimary(): Promise<OrgRow | undefined> {
    const [row] = await db
      .select(orgColumns)
      .from(organizations)
      .orderBy(asc(organizations.createdAt))
      .limit(1);
    return row;
  },

  async findById(orgId: string, ex: Executor = db): Promise<OrgRow | undefined> {
    const [row] = await ex
      .select(orgColumns)
      .from(organizations)
      .where(eq(organizations.id, orgId));
    return row;
  },

  /** The org's logo bytes and type, if one was uploaded. */
  async logo(orgId: string): Promise<{ data: Buffer; mime: string } | undefined> {
    const [row] = await db
      .select({ data: organizations.logoData, mime: organizations.logoMime })
      .from(organizations)
      .where(eq(organizations.id, orgId));
    return row?.data && row.mime ? { data: row.data, mime: row.mime } : undefined;
  },

  async update(ex: Executor, orgId: string, patch: OrgPatch): Promise<OrgRow | undefined> {
    const [row] = await ex
      .update(organizations)
      .set(patch)
      .where(eq(organizations.id, orgId))
      .returning(orgColumns);
    return row;
  },
};
