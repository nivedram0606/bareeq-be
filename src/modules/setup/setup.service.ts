import { createHash, timingSafeEqual } from 'node:crypto';

import type { User } from '@supabase/supabase-js';
import { sql } from 'drizzle-orm';
import type { z } from 'zod';

import type { ProfileDto, setupAdminSchema } from '@bareeq/shared';

import { env } from '../../config/env.js';
import { db } from '../../db/client.js';
import { writeAudit } from '../../lib/audit.js';
import { createAuthUserWithPassword, deleteAuthUserQuietly } from '../../lib/authAdmin.js';
import { AppError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { toProfileDto, usersRepo } from '../users/users.repo.js';

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

    let authUser: User | undefined;
    try {
      return await db.transaction(async (tx) => {
        // Serialise concurrent setup calls; re-check inside the lock.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext('bareeq:setup-admin'))`);
        if (await usersRepo.anyAdminExists(tx)) {
          throw AppError.conflict('Setup is already complete: an admin account exists');
        }

        const { orgId } = await ensureSchool(tx);
        authUser = await createAuthUserWithPassword(input);
        const row = await usersRepo.insert(tx, {
          id: authUser.id,
          orgId,
          email: input.email,
          fullName: input.fullName,
          role: 'admin',
        });
        await writeAudit(tx, {
          orgId,
          actorId: row.id,
          entity: 'profile',
          entityId: row.id,
          action: 'create',
          diff: { email: input.email, role: 'admin', via: 'setup' },
        });
        logger.info({ email: input.email }, 'First admin created through /setup/admin');
        return toProfileDto(row);
      });
    } catch (err) {
      if (authUser) await deleteAuthUserQuietly(authUser.id);
      throw err;
    }
  },
};
