import { errors as joseErrors, jwtVerify, SignJWT } from 'jose';

import { env } from '../config/env.js';

const ISSUER = 'bareeq-api';
const AUDIENCE = 'bareeq-web';
const key = new TextEncoder().encode(env.JWT_SECRET);

export interface SessionClaims {
  /** Profile id. */
  sub: string;
  /** The profile's `session_version` when the token was issued; bumping it revokes the token. */
  sv: number;
}

/** Signs a session token for the profile. */
export async function signSessionToken(
  claims: SessionClaims,
): Promise<{ token: string; expiresAt: Date }> {
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_HOURS * 3_600_000);
  const token = await new SignJWT({ sv: claims.sv })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(expiresAt)
    .sign(key);
  return { token, expiresAt };
}

export class InvalidTokenError extends Error {
  constructor(readonly expired: boolean) {
    super(expired ? 'Session expired' : 'Invalid access token');
  }
}

/** Verifies signature, issuer, audience and expiry; throws `InvalidTokenError` otherwise. */
export async function verifySessionToken(token: string): Promise<SessionClaims> {
  try {
    const { payload } = await jwtVerify(token, key, {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
    });
    if (typeof payload.sub !== 'string' || typeof payload.sv !== 'number') {
      throw new Error('Token is missing claims');
    }
    return { sub: payload.sub, sv: payload.sv };
  } catch (err) {
    throw new InvalidTokenError(err instanceof joseErrors.JWTExpired);
  }
}
