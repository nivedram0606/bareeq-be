import type { z } from 'zod';

import type {
  createUserSchema,
  ListQuery,
  MeDto,
  Paginated,
  ProfileDto,
  resetUserPasswordSchema,
  Role,
  updateUserSchema,
} from '@bareeq/shared';

import { db } from '../../db/client.js';
import type { Executor } from '../../db/client.js';
import { diffOf, writeAudit } from '../../lib/audit.js';
import { AppError, findPgError } from '../../lib/errors.js';
import { paginate } from '../../lib/pagination.js';
import { hashPassword } from '../../lib/password.js';
import type { AuthUser } from '../../lib/types.js';
import { orgService } from '../org/org.service.js';

import { toProfileDto, usersRepo } from './users.repo.js';

const usernameTaken = () =>
  AppError.conflict('A user with this username already exists', {
    username: 'validation.username_taken',
  });

/**
 * Inserts a profile with a hashed password and an audit row, inside `ex`. Shared by admin user
 * creation, the first-admin setup endpoint and the seed script.
 */
export async function insertUser(
  ex: Executor,
  input: {
    orgId: string;
    username: string;
    password: string;
    fullName: string;
    email?: string | null;
    role: Role;
  },
  audit: { actorId?: string; via: 'admin' | 'setup' | 'seed' },
): Promise<ProfileDto> {
  if (await usersRepo.findByUsername(input.username, ex)) throw usernameTaken();
  let row;
  try {
    row = await usersRepo.insert(ex, {
      orgId: input.orgId,
      username: input.username,
      passwordHash: await hashPassword(input.password),
      fullName: input.fullName,
      email: input.email ?? null,
      role: input.role,
    });
  } catch (err) {
    // Lost a race with a concurrent insert of the same username.
    if (findPgError(err)?.constraint_name === 'profiles_username_key') throw usernameTaken();
    throw err;
  }
  await writeAudit(ex, {
    orgId: input.orgId,
    actorId: audit.actorId ?? row.id,
    entity: 'profile',
    entityId: row.id,
    action: 'create',
    diff: { username: input.username, role: input.role, via: audit.via },
  });
  return toProfileDto(row);
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

  /** Creates an account with a username and initial password. Any role, including admin. */
  async create(user: AuthUser, input: z.output<typeof createUserSchema>): Promise<ProfileDto> {
    return db.transaction((tx) =>
      insertUser(tx, { ...input, orgId: user.orgId }, { actorId: user.id, via: 'admin' }),
    );
  },

  /** Admin sets a new password for a user in their org; the user's sessions are signed out. */
  async resetPassword(
    user: AuthUser,
    id: string,
    input: z.output<typeof resetUserPasswordSchema>,
  ): Promise<void> {
    const passwordHash = await hashPassword(input.password);
    await db.transaction(async (tx) => {
      const target = await usersRepo.findInOrg(user.orgId, id, tx);
      if (!target) throw AppError.notFound('User');
      await usersRepo.setPassword(tx, id, passwordHash);
      await writeAudit(tx, {
        orgId: user.orgId,
        actorId: user.id,
        entity: 'profile',
        entityId: id,
        action: 'update',
        diff: { password: 'reset' },
      });
    });
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
