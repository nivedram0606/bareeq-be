import { Router } from 'express';

import { setupController } from './setup.controller.js';

/** Public (token-guarded) setup routes, mounted before authentication. */
export const setupRoutes = Router();

setupRoutes.post('/setup/admin', ...setupController.createFirstAdmin);
