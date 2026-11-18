import { Router } from 'express';

import { requireRole } from '../../middleware/requireRole.js';

import { classesController } from './classes.controller.js';

export const classesRoutes = Router();

classesRoutes.get('/classes', classesController.list);
classesRoutes.post('/classes', requireRole('admin', 'staff'), classesController.create);
classesRoutes.patch('/classes/:id', requireRole('admin', 'staff'), classesController.update);
