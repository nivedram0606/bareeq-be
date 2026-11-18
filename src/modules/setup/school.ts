import { and, asc, eq } from 'drizzle-orm';

import type { Executor } from '../../db/client.js';
import { academicYears, classes, organizations } from '../../db/schema.js';
import { logger } from '../../lib/logger.js';

/**
 * Building blocks shared by the seed script and the first-admin setup endpoint.
 * All are idempotent.
 */

export const DEFAULT_ORG = { name: 'Bareeq School', nameAr: 'مدرسة بريق' } as const;
export const STARTER_CLASSES = [
  { name: 'Grade 1 - A', grade: 'Grade 1', section: 'A' },
  { name: 'Grade 2 - A', grade: 'Grade 2', section: 'A' },
  { name: 'Grade 3 - A', grade: 'Grade 3', section: 'A' },
] as const;

/** Omani academic year: September → June. Returns the year containing `today`. */
export function currentAcademicYear(today = new Date()): {
  name: string;
  startDate: string;
  endDate: string;
} {
  const y = today.getUTCFullYear();
  const startYear = today.getUTCMonth() >= 7 ? y : y - 1; // Aug onwards → new year
  return {
    name: `${startYear}-${startYear + 1}`,
    startDate: `${startYear}-09-01`,
    endDate: `${startYear + 1}-06-30`,
  };
}

/** The pilot's school: the oldest organization, created if none exists. */
export async function ensureOrg(ex: Executor): Promise<string> {
  const [existing] = await ex
    .select({ id: organizations.id })
    .from(organizations)
    .orderBy(asc(organizations.createdAt))
    .limit(1);
  if (existing) return existing.id;
  const [created] = await ex
    .insert(organizations)
    .values({ name: DEFAULT_ORG.name, nameAr: DEFAULT_ORG.nameAr })
    .returning({ id: organizations.id });
  if (!created) throw new Error('Failed to create organization');
  logger.info('Organization created');
  return created.id;
}

export async function ensureCurrentYear(ex: Executor, orgId: string): Promise<string> {
  const [current] = await ex
    .select({ id: academicYears.id })
    .from(academicYears)
    .where(and(eq(academicYears.orgId, orgId), eq(academicYears.isCurrent, true)));
  if (current) return current.id;
  const year = currentAcademicYear();
  const [created] = await ex
    .insert(academicYears)
    .values({ orgId, ...year, isCurrent: true })
    .onConflictDoUpdate({
      target: [academicYears.orgId, academicYears.name],
      set: { isCurrent: true },
    })
    .returning({ id: academicYears.id });
  if (!created) throw new Error('Failed to create academic year');
  logger.info({ year: year.name }, 'Current academic year created');
  return created.id;
}

/** Adds the starter classes to the year (only those missing) and returns all its class ids. */
export async function ensureClasses(
  ex: Executor,
  orgId: string,
  academicYearId: string,
): Promise<string[]> {
  await ex
    .insert(classes)
    .values(STARTER_CLASSES.map((c) => ({ ...c, orgId, academicYearId })))
    .onConflictDoNothing();
  const rows = await ex
    .select({ id: classes.id })
    .from(classes)
    .where(and(eq(classes.orgId, orgId), eq(classes.academicYearId, academicYearId)))
    .orderBy(classes.name);
  return rows.map((r) => r.id);
}

/** Organization, current academic year and starter classes. */
export async function ensureSchool(
  ex: Executor,
): Promise<{ orgId: string; academicYearId: string; classIds: string[] }> {
  const orgId = await ensureOrg(ex);
  const academicYearId = await ensureCurrentYear(ex, orgId);
  const classIds = await ensureClasses(ex, orgId, academicYearId);
  return { orgId, academicYearId, classIds };
}
