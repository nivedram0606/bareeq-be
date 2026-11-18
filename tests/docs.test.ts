import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { createApp } from '../src/app.js';
import { ROUTES } from '../src/docs/openapi.js';

const app = createApp();

interface Layer {
  route?: { path: string; methods: Record<string, boolean> };
  handle?: { stack?: Layer[] };
}

/** Every `METHOD /path` registered on the API routers (all sub-routers mount without a prefix). */
function registeredRoutes(): string[] {
  const out: string[] = [];
  const walk = (stack: Layer[]) => {
    for (const layer of stack) {
      if (layer.route) {
        for (const [method, on] of Object.entries(layer.route.methods)) {
          if (on && method !== '_all') out.push(`${method.toUpperCase()} ${layer.route.path}`);
        }
      } else if (layer.handle?.stack) {
        walk(layer.handle.stack);
      }
    }
  };
  walk((app as unknown as { router: { stack: Layer[] } }).router.stack);
  return out.filter((r) => !r.includes('openapi.json')).sort();
}

describe('API docs', () => {
  it('documents exactly the routes the app serves', () => {
    const documented = ROUTES.map((r) => `${r.method.toUpperCase()} ${r.path}`).sort();
    expect(documented).toEqual(registeredRoutes());
  });

  it('serves the OpenAPI spec publicly', async () => {
    const res = await request(app).get('/api/v1/openapi.json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toBe('3.1.0');
    expect(res.body.paths['/auth/login'].post.security).toEqual([]);
    expect(res.body.paths['/students/{id}'].get.parameters[0]).toMatchObject({
      name: 'id',
      in: 'path',
    });
    const createUser = res.body.paths['/users'].post.requestBody.content['application/json'].schema;
    expect(createUser.required).toEqual(
      expect.arrayContaining(['username', 'fullName', 'role', 'password']),
    );
  });

  it('serves Swagger UI', async () => {
    const res = await request(app).get('/api/docs/').redirects(1);
    expect(res.status).toBe(200);
    expect(res.text).toContain('swagger-ui');
    expect(res.headers['content-security-policy']).not.toContain('upgrade-insecure-requests');
  });
});
