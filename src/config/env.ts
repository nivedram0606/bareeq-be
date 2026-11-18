import { randomBytes } from 'node:crypto';

import { z } from 'zod';

const url = z.url();

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(4000),
    CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
    /** Requests per minute per client IP. Raise it when many staff share one public IP (NAT). */
    RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(300),

    /** Main database connection URL (pooler or direct). */
    DATABASE_URL: url,
    /** Direct connection (port 5432) used for migrations. Defaults to DATABASE_URL. */
    DIRECT_DATABASE_URL: url.optional(),
    /** Database SSL mode: 'require', 'prefer', 'disable', or boolean. Auto-detected for remote hosts. */
    DATABASE_SSL: z.enum(['true', 'false', 'require', 'prefer', 'allow', 'disable']).optional(),

    /**
     * Secret used to sign session tokens (HS256). Use 32+ random characters, e.g.
     * `openssl rand -base64 48`. Changing it signs everyone out.
     */
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters').optional(),
    /** How long a sign-in lasts before the user has to sign in again. */
    SESSION_TTL_HOURS: z.coerce.number().int().positive().max(720).default(12),

    /**
     * Enables `POST /setup/admin` (one-time creation of the first admin over HTTP) when set.
     * Leave unset normally; remove it again once the first admin exists.
     */
    SETUP_TOKEN: z.string().min(24, 'SETUP_TOKEN must be at least 24 characters').optional(),

    /** Serve Swagger UI at /api/docs and the OpenAPI spec at /api/v1/openapi.json. */
    API_DOCS: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),

    SEED_ADMIN_USERNAME: z.string().min(3).optional(),
    SEED_ADMIN_PASSWORD: z.string().min(8).optional(),
  })
  .transform((data) => {
    let jwtSecret = data.JWT_SECRET;
    if (!jwtSecret) {
      if (data.NODE_ENV === 'production') {
        throw new Error('JWT_SECRET is required in production (32+ random characters).');
      }
      // Never a fixed fallback: a known secret would let anyone forge tokens if a server ever
      // runs without NODE_ENV=production. A random one is safe; restarts just sign users out.
      jwtSecret = randomBytes(48).toString('base64');
      if (data.NODE_ENV !== 'test') {
        console.warn(
          'JWT_SECRET is not set: using a random secret for this process. ' +
            'Sessions end when the API restarts. Set JWT_SECRET in .env to keep them.',
        );
      }
    }
    return {
      ...data,
      /**
       * Allowed web origins. Browsers send `Origin` without a path or trailing slash, so
       * `https://app.example.com/` is normalised to `https://app.example.com`.
       */
      CORS_ORIGINS: data.CORS_ORIGIN.split(',')
        .map((o) => o.trim().replace(/\/+$/, ''))
        .filter(Boolean),
      JWT_SECRET: jwtSecret,
      DIRECT_DATABASE_URL: data.DIRECT_DATABASE_URL ?? data.DATABASE_URL,
    };
  });

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: NodeJS.ProcessEnv): Env {
  // Treat empty strings (e.g. `KEY=` copied from .env.example) as unset.
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, v]) => v !== ''));
  const parsed = envSchema.safeParse(cleaned);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment variables:\n${issues.join('\n')}`);
  }
  return parsed.data;
}

export const env = parseEnv(process.env);
