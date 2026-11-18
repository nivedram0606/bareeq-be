/**
 * Applies pending SQL migrations from ./migrations using the direct (non-pooled) connection.
 * Usable in production without drizzle-kit: `node dist/db/migrate.js`.
 */
import { fileURLToPath } from 'node:url';

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

const migrationsFolder = fileURLToPath(new URL('../../src/db/migrations', import.meta.url));

async function main(): Promise<void> {
  const client = postgres(env.DIRECT_DATABASE_URL ?? env.DATABASE_URL, {
    max: 1,
    onnotice: () => undefined,
  });
  try {
    await migrate(drizzle(client), { migrationsFolder });
    logger.info('Migrations applied');
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((err: unknown) => {
  logger.fatal({ err }, 'Migration failed');
  process.exitCode = 1;
});
