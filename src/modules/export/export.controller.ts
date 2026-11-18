import { handle } from '../../lib/http.js';

import { exportService } from './export.service.js';

export const exportController = {
  download: handle({}, async ({ user }, _req, res) => {
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${exportService.filename()}"`);
    res.setHeader('Cache-Control', 'no-store');
    await exportService.writeZip(user, res);
  }),
};
