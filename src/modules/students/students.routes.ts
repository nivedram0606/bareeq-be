import { Router } from 'express';

import { requireRole } from '../../middleware/requireRole.js';

import { studentsController } from './students.controller.js';

export const studentsRoutes = Router();

studentsRoutes.get('/students', studentsController.list);
studentsRoutes.post('/students', requireRole('admin', 'staff'), studentsController.create);
studentsRoutes.get('/students/:id', studentsController.get);
studentsRoutes.patch('/students/:id', requireRole('admin', 'staff'), studentsController.update);
