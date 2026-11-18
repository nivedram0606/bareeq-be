import type { RequestHandler } from 'express';
import type { z } from 'zod';

import { setupAdminSchema } from '@bareeq/shared';

import { validate } from '../../middleware/validate.js';

import { setupService } from './setup.service.js';

export const SETUP_TOKEN_HEADER = 'x-setup-token';

const createFirstAdmin: RequestHandler = async (req, res) => {
  const { body } = res.locals.validated as { body: z.output<typeof setupAdminSchema> };
  const profile = await setupService.bootstrapFirstAdmin(req.get(SETUP_TOKEN_HEADER), body);
  res.status(201).json(profile);
};

/** Public route (no session exists yet), so it does not use `handle()`, which needs a user. */
export const setupController = {
  createFirstAdmin: [validate({ body: setupAdminSchema }), createFirstAdmin],
};
