import { Router } from 'express';

import { requireRole } from '../../middleware/requireRole.js';

import { exportController } from './export.controller.js';

export const exportRoutes = Router();

exportRoutes.get('/export', requireRole('admin'), exportController.download);
