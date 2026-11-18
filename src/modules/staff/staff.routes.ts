import { Router } from 'express';

import { requireRole } from '../../middleware/requireRole.js';

import { staffController } from './staff.controller.js';

export const staffRoutes = Router();

staffRoutes.get('/staff', staffController.list);
staffRoutes.post('/staff', requireRole('admin'), staffController.create);
staffRoutes.patch('/staff/:id', requireRole('admin'), staffController.update);
