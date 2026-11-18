import cors from 'cors';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';

import type { HealthResponse } from '@bareeq/shared';

import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { authenticate } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFound } from './middleware/notFound.js';
import { academicYearsRoutes } from './modules/academicYears/academicYears.routes.js';
import { authRoutes, publicAuthRoutes } from './modules/auth/auth.routes.js';
import { classesRoutes } from './modules/classes/classes.routes.js';
import { exportRoutes } from './modules/export/export.routes.js';
import { feesRoutes } from './modules/fees/fees.routes.js';
import { guardiansRoutes } from './modules/guardians/guardians.routes.js';
import { orgController } from './modules/org/org.controller.js';
import { orgRoutes } from './modules/org/org.routes.js';
import { orgService } from './modules/org/org.service.js';
import { paymentsRoutes } from './modules/payments/payments.routes.js';
import { reportsRoutes } from './modules/reports/reports.routes.js';
import { setupRoutes } from './modules/setup/setup.routes.js';
import { staffRoutes } from './modules/staff/staff.routes.js';
import { studentsRoutes } from './modules/students/students.routes.js';
import { usersRoutes } from './modules/users/users.routes.js';

export function createApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(',').map((o) => o.trim()),
      exposedHeaders: ['Content-Disposition'],
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(pinoHttp({ logger }));
  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: env.NODE_ENV === 'test' ? 10_000 : env.RATE_LIMIT_PER_MINUTE,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (_req, res) => {
        res
          .status(429)
          .json({ error: { code: 'FORBIDDEN', message: 'Too many requests, slow down' } });
      },
    }),
  );

  const api = express.Router();
  api.get('/health', (_req, res) => {
    const body: HealthResponse = { status: 'ok', time: new Date().toISOString() };
    res.json(body);
  });
  // Public: school name/logo/colour for the login page (single-school pilot).
  api.get('/branding', async (_req, res) => {
    res.json(await orgService.branding());
  });

  api.get('/orgs/:id/logo', orgController.logo);

  // Public sign-in.
  api.use(publicAuthRoutes);

  // Public, token-guarded one-time setup of the first admin (disabled unless SETUP_TOKEN is set).
  api.use(setupRoutes);

  // Everything below requires a valid session token.
  api.use(authenticate);
  api.use(authRoutes);
  api.use(usersRoutes);
  api.use(orgRoutes);
  api.use(academicYearsRoutes);
  api.use(classesRoutes);
  api.use(studentsRoutes);
  api.use(guardiansRoutes);
  api.use(feesRoutes);
  api.use(paymentsRoutes);
  api.use(staffRoutes);
  api.use(reportsRoutes);
  api.use(exportRoutes);

  app.use('/api/v1', api);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
