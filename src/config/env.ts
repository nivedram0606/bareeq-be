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

    /** Supabase project URL (e.g. https://<project>.supabase.co or self-hosted). */
    SUPABASE_URL: url,
    /** Supabase service_role secret key for backend administrative access. */
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    /** Defaults to ${SUPABASE_URL}/auth/v1/.well-known/jwks.json */
    SUPABASE_JWKS_URL: url.optional(),
    /** Defaults to ${SUPABASE_URL}/auth/v1 */
    SUPABASE_JWT_ISSUER: url.optional(),

    /**
     * Enables `POST /setup/admin` (one-time creation of the first admin over HTTP) when set.
     * Leave unset normally; remove it again once the first admin exists.
     */
    SETUP_TOKEN: z.string().min(24, 'SETUP_TOKEN must be at least 24 characters').optional(),

    SEED_ADMIN_EMAIL: z.email().optional(),
    SEED_ADMIN_PASSWORD: z.string().min(8).optional(),
  })
  .transform((data) => {
    const rawSupabaseUrl = data.SUPABASE_URL.replace(/\/+$/, '');
    return {
      ...data,
      DIRECT_DATABASE_URL: data.DIRECT_DATABASE_URL ?? data.DATABASE_URL,
      SUPABASE_JWKS_URL: data.SUPABASE_JWKS_URL ?? `${rawSupabaseUrl}/auth/v1/.well-known/jwks.json`,
      SUPABASE_JWT_ISSUER: data.SUPABASE_JWT_ISSUER ?? `${rawSupabaseUrl}/auth/v1`,
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
