import { Router } from 'express';

import { requireRole } from '../../middleware/requireRole.js';

import { usersController } from './users.controller.js';

export const usersRoutes = Router();

usersRoutes.get('/me', usersController.me);
usersRoutes.get('/users', requireRole('admin'), usersController.list);
usersRoutes.post('/users', requireRole('admin'), usersController.create);
usersRoutes.post('/users/invite', requireRole('admin'), usersController.invite);
usersRoutes.patch('/users/:id', requireRole('admin'), usersController.update);
