import type { User } from '@supabase/supabase-js';
import type { z } from 'zod';

import type {
  createUserSchema,
  inviteUserSchema,
  ListQuery,
  MeDto,
  Paginated,
  ProfileDto,
  Role,
  updateUserSchema,
} from '@bareeq/shared';

import { env } from '../../config/env.js';
import { db } from '../../db/client.js';
import { diffOf, writeAudit } from '../../lib/audit.js';
import {
  createAuthUserWithPassword,
  deleteAuthUserQuietly,
  inviteAuthUser,
} from '../../lib/authAdmin.js';
import { AppError } from '../../lib/errors.js';
import { paginate } from '../../lib/pagination.js';
import type { AuthUser } from '../../lib/types.js';
import { orgService } from '../org/org.service.js';

import { toProfileDto, usersRepo } from './users.repo.js';

/** Where invite e-mails send the user to set their password: the web app's reset page. */
const inviteRedirect = (): string => {
  const webOrigin = env.CORS_ORIGIN.split(',')[0]?.trim() ?? 'http://localhost:5173';
  return `${webOrigin.replace(/\/$/, '')}/reset-password`;
};

/**
 * Saves the profile for a just-created auth user (plus an audit row). If that fails the auth
 * user is deleted again, so Auth and `profiles` never drift apart.
 */
async function attachProfile(
  actor: AuthUser,
  authUser: User,
  input: { email: string; fullName: string; role: Role },
  how: 'invite' | 'password',
): Promise<ProfileDto> {
  try {
    return await db.transaction(async (tx) => {
      const row = await usersRepo.insert(tx, {
        id: authUser.id,
        orgId: actor.orgId,
        email: input.email,
        fullName: input.fullName,
        role: input.role,
      });
      await writeAudit(tx, {
        orgId: actor.orgId,
        actorId: actor.id,
        entity: 'profile',
        entityId: row.id,
        action: 'create',
        diff: { email: input.email, role: input.role, via: how },
      });
      return toProfileDto(row);
    });
  } catch (err) {
    await deleteAuthUserQuietly(authUser.id);
    throw err;
  }
}

export const usersService = {
  async me(user: AuthUser): Promise<MeDto> {
    const [profile, org] = await Promise.all([
      usersRepo.findInOrg(user.orgId, user.id),
      orgService.get(user.orgId),
    ]);
    if (!profile) throw AppError.notFound('Profile');
    return { profile: toProfileDto(profile), org };
  },

  async list(user: AuthUser, q: ListQuery): Promise<Paginated<ProfileDto>> {
    const { rows, total } = await usersRepo.list(user.orgId, q);
    return paginate(rows.map(toProfileDto), total, q);
  },

  /** Invite by e-mail: the user sets their own password from the link (needs SMTP). */
  async invite(user: AuthUser, input: z.output<typeof inviteUserSchema>): Promise<ProfileDto> {
    const authUser = await inviteAuthUser({
      email: input.email,
      fullName: input.fullName,
      redirectTo: inviteRedirect(),
    });
    return attachProfile(user, authUser, input, 'invite');
  },

  /** Create directly with an initial password (no e-mail). Any role, including admin. */
  async create(user: AuthUser, input: z.output<typeof createUserSchema>): Promise<ProfileDto> {
    const authUser = await createAuthUserWithPassword(input);
    return attachProfile(user, authUser, input, 'password');
  },

  async update(
    user: AuthUser,
    id: string,
    input: z.output<typeof updateUserSchema>,
  ): Promise<ProfileDto> {
    if (id === user.id && (input.isActive === false || (input.role && input.role !== 'admin'))) {
      throw AppError.conflict('You cannot deactivate yourself or remove your own admin role');
    }
    return db.transaction(async (tx) => {
      const before = await usersRepo.findInOrg(user.orgId, id, tx);
      if (!before) throw AppError.notFound('User');
      const after = await usersRepo.update(tx, user.orgId, id, input);
      if (!after) throw AppError.notFound('User');
      const diff = diffOf(before, input);
      if (Object.keys(diff).length > 0) {
        await writeAudit(tx, {
          orgId: user.orgId,
          actorId: user.id,
          entity: 'profile',
          entityId: id,
          action: 'isActive' in diff ? 'status_change' : 'update',
          diff,
        });
      }
      return toProfileDto(after);
    });
  },
};
