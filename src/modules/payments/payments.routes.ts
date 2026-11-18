import { Router } from 'express';

import { requireRole } from '../../middleware/requireRole.js';

import { paymentsController } from './payments.controller.js';

export const paymentsRoutes = Router();

paymentsRoutes.post('/payments', requireRole('admin', 'staff'), paymentsController.create);
paymentsRoutes.post('/payments/:id/void', requireRole('admin'), paymentsController.void);
