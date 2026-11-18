import { Router } from 'express';

import { requireRole } from '../../middleware/requireRole.js';

import { academicYearsController } from './academicYears.controller.js';

export const academicYearsRoutes = Router();

academicYearsRoutes.get('/academic-years', academicYearsController.list);
academicYearsRoutes.post('/academic-years', requireRole('admin'), academicYearsController.create);
academicYearsRoutes.patch(
  '/academic-years/:id',
  requireRole('admin'),
  academicYearsController.update,
);
