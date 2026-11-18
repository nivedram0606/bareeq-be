import type { RequestHandler } from 'express';

import { hasRole } from '@bareeq/shared';
import type { Role } from '@bareeq/shared';

import { AppError } from '../lib/errors.js';

/** Allows the request only if the authenticated user has one of `roles`. */
export function requireRole(...roles: Role[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) throw AppError.unauthenticated();
    if (!hasRole(req.user.role, roles)) throw AppError.forbidden();
    next();
  };
}
