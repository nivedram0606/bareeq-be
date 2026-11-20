import type { RequestHandler } from 'express';

import { AppError } from '../lib/errors.js';
import { InvalidTokenError, verifySessionToken } from '../lib/tokens.js';
import { usersRepo } from '../modules/users/users.repo.js';

function bearerToken(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
}

/**
 * Verifies the session token issued by `POST /auth/login`, loads the caller's profile and sets
 * `req.user`. Tokens issued before a password change (older `session_version`) are rejected;
 * inactive users get 403.
 */
export const authenticate: RequestHandler = async (req, _res, next) => {
  const token = bearerToken(req.headers.authorization);
  if (!token) throw AppError.unauthenticated();

  let claims;
  try {
    claims = await verifySessionToken(token);
  } catch (err) {
    const expired = err instanceof InvalidTokenError && err.expired;
    throw AppError.unauthenticated(expired ? 'Session expired' : 'Invalid access token');
  }

  const profile = await usersRepo.findById(claims.sub);
  if (!profile) throw AppError.unauthenticated('Session is no longer valid');
  if (profile.sessionVersion !== claims.sv) {
    // Signed in elsewhere since, or the password was changed/reset.
    throw AppError.unauthenticated(
      'Signed out because this account signed in again or its password changed',
    );
  }
  if (!profile.isActive) throw AppError.forbidden('This account has been deactivated');

  req.user = {
    id: profile.id,
    orgId: profile.orgId,
    role: profile.role,
    username: profile.username,
  };
  next();
};
