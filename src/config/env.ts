import { z } from 'zod';

const url = z.url();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
  /** Requests per minute per client IP. Raise it when many staff share one public IP (NAT). */
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(300),

  /** Supavisor pooler, transaction mode (port 6543). Locally: direct 54322. */
  DATABASE_URL: url,
  /** Direct connection (port 5432) used for migrations. Falls back to DATABASE_URL. */
  DIRECT_DATABASE_URL: url.optional(),

  SUPABASE_URL: url,
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_JWKS_URL: url,
  SUPABASE_JWT_ISSUER: url,

  /**
   * Enables `POST /setup/admin` (one-time creation of the first admin over HTTP) when set.
   * Leave unset normally; remove it again once the first admin exists.
   */
  SETUP_TOKEN: z.string().min(24, 'SETUP_TOKEN must be at least 24 characters').optional(),

  SEED_ADMIN_EMAIL: z.email().optional(),
  SEED_ADMIN_PASSWORD: z.string().min(8).optional(),
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
