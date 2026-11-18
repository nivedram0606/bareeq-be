import { Router } from 'express';

import { requireRole } from '../../middleware/requireRole.js';

import { orgController } from './org.controller.js';

export const orgRoutes = Router();

orgRoutes.get('/org', orgController.get);
orgRoutes.patch('/org', requireRole('admin'), orgController.update);
orgRoutes.post('/org/logo', requireRole('admin'), orgController.uploadLogo);
