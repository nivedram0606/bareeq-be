import { Router } from 'express';
import type { RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { z } from 'zod';

import { changePasswordSchema, loginSchema } from '@bareeq/shared';

import { env } from '../../config/env.js';
import { handle } from '../../lib/http.js';
import { validate } from '../../middleware/validate.js';

import { authService } from './auth.service.js';

/** Slows down password guessing: 10 failed sign-ins per IP per 15 minutes. */
const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: env.NODE_ENV === 'test' ? 10_000 : 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      error: { code: 'FORBIDDEN', message: 'Too many sign-in attempts, try again later' },
    });
  },
});

const login: RequestHandler = async (_req, res) => {
  const { body } = res.locals.validated as { body: z.output<typeof loginSchema> };
  res.json(await authService.login(body));
};

/** Public: sign-in. Mounted before `authenticate`. */
export const publicAuthRoutes = Router();
publicAuthRoutes.post('/auth/login', loginLimiter, validate({ body: loginSchema }), login);

/** Requires a session. */
export const authRoutes = Router();
authRoutes.post(
  '/auth/change-password',
  ...handle({ body: changePasswordSchema }, ({ user, body }) =>
    authService.changePassword(user, body),
  ),
);
