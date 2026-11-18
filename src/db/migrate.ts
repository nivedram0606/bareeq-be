/**
 * Applies pending SQL migrations from ./migrations using the direct (non-pooled) connection.
 * Usable in production without drizzle-kit: `node dist/db/migrate.js`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { getDatabaseSslOption } from './ssl.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultFolder = path.resolve(__dirname, '../../src/db/migrations');
const candidatePaths: string[] = [
  path.resolve(__dirname, 'migrations'),
  defaultFolder,
  path.resolve(__dirname, '../src/db/migrations'),
];
const migrationsFolder: string = candidatePaths.find((p) => fs.existsSync(p)) ?? defaultFolder;

async function main(): Promise<void> {
  const connectionUrl = env.DIRECT_DATABASE_URL ?? env.DATABASE_URL;
  const ssl = getDatabaseSslOption(connectionUrl, env.DATABASE_SSL);
  const client = postgres(connectionUrl, {
    max: 1,
    onnotice: () => undefined,
    ...(ssl !== undefined ? { ssl } : {}),
  });
  try {
    logger.info({ migrationsFolder }, 'Applying database migrations...');
    await migrate(drizzle(client), { migrationsFolder });
    logger.info('Migrations applied successfully');
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((err: unknown) => {
  logger.fatal({ err }, 'Migration failed');
  process.exitCode = 1;
});
