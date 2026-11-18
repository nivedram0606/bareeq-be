import type { RequestHandler } from 'express';
import { createRemoteJWKSet, errors as joseErrors, jwtVerify } from 'jose';

import { env } from '../config/env.js';
import { AppError } from '../lib/errors.js';
import { usersRepo } from '../modules/users/users.repo.js';

const jwks = createRemoteJWKSet(new URL(env.SUPABASE_JWKS_URL), {
  cooldownDuration: 30_000,
  cacheMaxAge: 10 * 60_000,
});

function bearerToken(header: string | undefined): string | undefined {
  if (!header) return undefined;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
}

/**
 * Verifies the Supabase access token (signature via JWKS, issuer, audience, expiry), loads the
 * caller's profile and sets `req.user`. Inactive or profile-less users are rejected with 403.
 */
export const authenticate: RequestHandler = async (req, _res, next) => {
  const token = bearerToken(req.headers.authorization);
  if (!token) throw AppError.unauthenticated();

  let sub: string;
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: env.SUPABASE_JWT_ISSUER,
      audience: 'authenticated',
    });
    if (!payload.sub) throw new Error('Token has no subject');
    sub = payload.sub;
  } catch (err) {
    const expired = err instanceof joseErrors.JWTExpired;
    throw AppError.unauthenticated(expired ? 'Session expired' : 'Invalid access token');
  }

  const profile = await usersRepo.findById(sub);
  if (!profile) throw AppError.forbidden('No profile is linked to this account');
  if (!profile.isActive) throw AppError.forbidden('This account has been deactivated');

  req.user = { id: profile.id, orgId: profile.orgId, role: profile.role, email: profile.email };
  next();
};
