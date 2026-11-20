import type { z } from 'zod';

import type { changePasswordSchema, LoginResponse, loginSchema } from '@bareeq/shared';

import { db } from '../../db/client.js';
import { writeAudit } from '../../lib/audit.js';
import { AppError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { hashPassword, needsRehash, verifyPassword } from '../../lib/password.js';
import { signSessionToken } from '../../lib/tokens.js';
import type { AuthUser } from '../../lib/types.js';
import { usersRepo } from '../users/users.repo.js';

const invalidCredentials = () => AppError.unauthenticated('Invalid username or password');

export const authService = {
  /**
   * Checks username and password and issues a session token. Unknown users, wrong passwords
   * and accounts without a password all get the same 401; deactivated accounts get 403.
   * One active session per user: a successful sign-in signs out every other device (BUG-003).
   * Failed attempts change nothing, so guessing a password cannot log the real user out.
   */
  async login(input: z.output<typeof loginSchema>): Promise<LoginResponse> {
    const profile = await usersRepo.findByUsername(input.username);
    const ok = await verifyPassword(input.password, profile?.passwordHash);
    if (!profile || !ok) throw invalidCredentials();
    if (!profile.isActive) throw AppError.forbidden('This account has been deactivated');

    // Hashes made with an older cost are upgraded in the background; sign-in doesn't wait.
    if (profile.passwordHash && needsRehash(profile.passwordHash)) {
      void hashPassword(input.password)
        .then((hash) => usersRepo.replaceHash(profile.id, hash))
        .catch((err: unknown) => logger.warn({ err, id: profile.id }, 'Password rehash failed'));
    }

    const { token, expiresAt } = await signSessionToken({
      sub: profile.id,
      sv: await usersRepo.rotateSession(profile.id),
    });
    return { token, expiresAt: expiresAt.toISOString() };
  },

  /**
   * Changes the caller's own password. All their sessions (including this one) are revoked,
   * so the response carries a fresh token for the current device.
   */
  async changePassword(
    user: AuthUser,
    input: z.output<typeof changePasswordSchema>,
  ): Promise<LoginResponse> {
    const profile = await usersRepo.findById(user.id);
    if (!profile) throw AppError.unauthenticated();
    if (!(await verifyPassword(input.currentPassword, profile.passwordHash))) {
      throw AppError.validation('Current password is incorrect', {
        currentPassword: 'validation.wrong_password',
      });
    }
    const passwordHash = await hashPassword(input.newPassword);
    await db.transaction(async (tx) => {
      await usersRepo.setPassword(tx, user.id, passwordHash);
      await writeAudit(tx, {
        orgId: user.orgId,
        actorId: user.id,
        entity: 'profile',
        entityId: user.id,
        action: 'update',
        diff: { password: 'changed' },
      });
    });
    const { token, expiresAt } = await signSessionToken({
      sub: user.id,
      sv: profile.sessionVersion + 1,
    });
    return { token, expiresAt: expiresAt.toISOString() };
  },
};
