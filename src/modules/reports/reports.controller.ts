import {
  feeCollectionQuerySchema,
  outstandingQuerySchema,
  studentReportQuerySchema,
} from '@bareeq/shared';

import { sendCsv } from '../../lib/csv.js';
import { handle } from '../../lib/http.js';

import { reportsService } from './reports.service.js';

export const reportsController = {
  dashboard: handle({}, ({ user }) => reportsService.dashboard(user)),

  students: handle({ query: studentReportQuerySchema }, ({ user, query }) =>
    reportsService.students(user, query),
  ),
  studentsCsv: handle({ query: studentReportQuerySchema }, async ({ user, query }, _req, res) => {
    const file = await reportsService.studentsCsv(user, query);
    sendCsv(res, file.filename, file.content);
  }),

  feeCollection: handle({ query: feeCollectionQuerySchema }, ({ user, query }) =>
    reportsService.feeCollection(user, query),
  ),
  feeCollectionCsv: handle(
    { query: feeCollectionQuerySchema },
    async ({ user, query }, _req, res) => {
      const file = await reportsService.feeCollectionCsv(user, query);
      sendCsv(res, file.filename, file.content);
    },
  ),

  outstanding: handle({ query: outstandingQuerySchema }, ({ user, query }) =>
    reportsService.outstanding(user, query),
  ),
  outstandingCsv: handle({ query: outstandingQuerySchema }, async ({ user, query }, _req, res) => {
    const file = await reportsService.outstandingCsv(user, query);
    sendCsv(res, file.filename, file.content);
  }),
};
