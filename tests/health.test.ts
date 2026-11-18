import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { brandingSchema, healthResponseSchema } from '@bareeq/shared';

import { createApp } from '../src/app.js';

describe('GET /api/v1/health', () => {
  const app = createApp();

  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(healthResponseSchema.parse(res.body).status).toBe('ok');
  });

  it('returns the standard error envelope for unknown routes', async () => {
    const res = await request(app).get('/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  it('serves public branding without a token, exposing no ids', async () => {
    const res = await request(app).get('/api/v1/branding');
    expect(res.status).toBe(200);
    const branding = brandingSchema.strict().parse(res.body);
    expect(branding.brandColor).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('requires authentication for every other API route', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ error: { code: 'UNAUTHENTICATED' } });
  });
});
