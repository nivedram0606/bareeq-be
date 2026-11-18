import { Router } from 'express';
import type { RequestHandler } from 'express';
import swaggerUi from 'swagger-ui-express';

import { buildOpenApiDocument } from './openapi.js';

/**
 * Swagger UI's assets are same-origin; this CSP replaces helmet's default for the docs pages,
 * mainly to drop `upgrade-insecure-requests`, which breaks the UI on plain-http localhost.
 */
const docsCsp: RequestHandler = (_req, res, next) => {
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'",
  );
  next();
};

/** `GET /api/v1/openapi.json` (the spec) and `GET /api/docs` (Swagger UI). Mount before `/api/v1`. */
export function docsRoutes(): Router {
  const document = buildOpenApiDocument('/api/v1');
  const router = Router();
  router.get('/api/v1/openapi.json', (_req, res) => {
    res.json(document);
  });
  router.use(
    '/api/docs',
    docsCsp,
    swaggerUi.serve,
    swaggerUi.setup(document, {
      customSiteTitle: 'Bareeq Cloud API',
      swaggerOptions: { persistAuthorization: true, displayRequestDuration: true },
    }),
  );
  return router;
}
