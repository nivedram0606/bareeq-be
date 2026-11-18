import { describe, expect, it } from 'vitest';

import { parseEnv } from '../src/config/env.js';

const base = { DATABASE_URL: 'postgresql://u:p@localhost:5432/db' };

describe('JWT_SECRET', () => {
  it('is required in production', () => {
    expect(() => parseEnv({ ...base, NODE_ENV: 'production' })).toThrow(/JWT_SECRET is required/);
  });

  it('rejects secrets shorter than 32 characters', () => {
    expect(() => parseEnv({ ...base, NODE_ENV: 'production', JWT_SECRET: 'short' })).toThrow(
      /at least 32/,
    );
  });

  it('uses the configured secret when set', () => {
    const secret = 'x'.repeat(40);
    expect(parseEnv({ ...base, NODE_ENV: 'production', JWT_SECRET: secret }).JWT_SECRET).toBe(
      secret,
    );
  });

  it('falls back to a random, unguessable secret outside production', () => {
    const a = parseEnv({ ...base, NODE_ENV: 'test' }).JWT_SECRET;
    const b = parseEnv({ ...base, NODE_ENV: 'test' }).JWT_SECRET;
    expect(a.length).toBeGreaterThanOrEqual(32);
    expect(a).not.toBe(b);
    expect(a).not.toMatch(/dev-only/);
  });
});

describe('CORS_ORIGIN', () => {
  it('ignores trailing slashes and spaces, and accepts a comma-separated list', () => {
    const env = parseEnv({
      ...base,
      NODE_ENV: 'test',
      CORS_ORIGIN: 'https://bareeq.netlify.app/ , http://localhost:5173',
    });
    expect(env.CORS_ORIGINS).toEqual(['https://bareeq.netlify.app', 'http://localhost:5173']);
  });
});
