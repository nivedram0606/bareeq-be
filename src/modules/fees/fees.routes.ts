import { Router } from 'express';

import { requireRole } from '../../middleware/requireRole.js';

import { feesController } from './fees.controller.js';

export const feesRoutes = Router();

feesRoutes.get('/students/:id/fees', feesController.studentFees);
feesRoutes.post('/fees', requireRole('admin', 'staff'), feesController.create);
feesRoutes.patch('/fees/:id', requireRole('admin', 'staff'), feesController.update);
