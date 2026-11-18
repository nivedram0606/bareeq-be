import { Router } from 'express';

import { reportsController } from './reports.controller.js';

/** All report endpoints are readable by every role (viewer+). */
export const reportsRoutes = Router();

reportsRoutes.get('/dashboard', reportsController.dashboard);
reportsRoutes.get('/reports/students', reportsController.students);
reportsRoutes.get('/reports/students.csv', reportsController.studentsCsv);
reportsRoutes.get('/reports/fee-collection', reportsController.feeCollection);
reportsRoutes.get('/reports/fee-collection.csv', reportsController.feeCollectionCsv);
reportsRoutes.get('/reports/outstanding', reportsController.outstanding);
reportsRoutes.get('/reports/outstanding.csv', reportsController.outstandingCsv);
