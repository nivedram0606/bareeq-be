import type { Request, RequestHandler, Response } from 'express';

import { validate } from '../middleware/validate.js';
import type { Schemas, Validated } from '../middleware/validate.js';

import { AppError } from './errors.js';
import type { AuthUser } from './types.js';

export type HandlerInput<S extends Schemas> = Validated<S> & { user: AuthUser };

export function requireUser(req: Request): AuthUser {
  if (!req.user) throw AppError.unauthenticated();
  return req.user;
}

/**
 * Builds a typed route: `validate(schemas)` followed by a controller function that receives
 * the parsed input and the authenticated user. Whatever it returns is sent as JSON with
 * `status` (default 200); return nothing after writing the response yourself (e.g. CSV).
 * Express 5 forwards rejected promises to the error handler.
 */
export function handle<S extends Schemas>(
  schemas: S,
  controller: (input: HandlerInput<S>, req: Request, res: Response) => unknown,
  options: { status?: number } = {},
): RequestHandler[] {
  const run: RequestHandler = async (req, res) => {
    const validated = res.locals.validated as Validated<S>;
    const result: unknown = await controller({ ...validated, user: requireUser(req) }, req, res);
    if (res.headersSent) return;
    if (result === undefined) {
      res.status(options.status ?? 204).end();
    } else {
      res.status(options.status ?? 200).json(result);
    }
  };
  return [validate(schemas), run];
}
