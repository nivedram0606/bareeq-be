import { createHash, timingSafeEqual } from 'node:crypto';

import { sql } from 'drizzle-orm';
import type { z } from 'zod';

import type { ProfileDto, setupAdminSchema } from '@bareeq/shared';

import { env } from '../../config/env.js';
import { db } from '../../db/client.js';
import { AppError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { usersRepo } from '../users/users.repo.js';
import { insertUser } from '../users/users.service.js';

import { ensureSchool } from './school.js';

/** Constant-time comparison of the presented token with `SETUP_TOKEN`. */
function tokenMatches(presented: string | undefined): boolean {
  if (!env.SETUP_TOKEN || !presented) return false;
  const digest = (s: string) => createHash('sha256').update(s).digest();
  return timingSafeEqual(digest(presented), digest(env.SETUP_TOKEN));
}

export const setupService = {
  /**
   * One-time bootstrap for hosts where the seed script cannot be run (e.g. no shell access):
   * creates the school (organization, current academic year, starter classes) and the first
   * admin. Disabled unless `SETUP_TOKEN` is configured; refuses once any admin exists.
   */
  async bootstrapFirstAdmin(
    presentedToken: string | undefined,
    input: z.output<typeof setupAdminSchema>,
  ): Promise<ProfileDto> {
    if (!env.SETUP_TOKEN) throw AppError.notFound('Route');
    if (!tokenMatches(presentedToken)) throw AppError.forbidden('Invalid setup token');

    return db.transaction(async (tx) => {
      // Serialise concurrent setup calls; re-check inside the lock.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('bareeq:setup-admin'))`);
      if (await usersRepo.anyAdminExists(tx)) {
        throw AppError.conflict('Setup is already complete: an admin account exists');
      }
      const { orgId } = await ensureSchool(tx);
      const profile = await insertUser(tx, { ...input, orgId, role: 'admin' }, { via: 'setup' });
      logger.info({ username: input.username }, 'First admin created through /setup/admin');
      return profile;
    });
  },
};
