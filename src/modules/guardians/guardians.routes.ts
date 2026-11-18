import { Router } from 'express';

import { requireRole } from '../../middleware/requireRole.js';

import { guardiansController } from './guardians.controller.js';

export const guardiansRoutes = Router();

guardiansRoutes.get('/students/:id/guardians', guardiansController.listForStudent);
guardiansRoutes.post(
  '/students/:id/guardians',
  requireRole('admin', 'staff'),
  guardiansController.create,
);
guardiansRoutes.patch('/guardians/:id', requireRole('admin', 'staff'), guardiansController.update);
guardiansRoutes.delete('/guardians/:id', requireRole('admin', 'staff'), guardiansController.remove);
