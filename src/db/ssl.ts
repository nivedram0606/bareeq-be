import type { Options } from 'postgres';

/**
 * Determines the SSL configuration for the PostgreSQL connection.
 * Automatically enables SSL for remote hosts while allowing local dev without SSL.
 */
export function getDatabaseSslOption(
  databaseUrl: string,
  sslEnv?: string,
): Options<{}>['ssl'] {
  if (sslEnv === 'false' || sslEnv === 'disable') {
    return false;
  }
  if (sslEnv === 'true' || sslEnv === 'require') {
    return { rejectUnauthorized: false };
  }
  if (sslEnv === 'prefer') {
    return 'prefer';
  }
  // If connection URL already has sslmode query param, postgres.js parses it directly
  if (databaseUrl.includes('sslmode=')) {
    return undefined;
  }
  // If connecting to local development server, do not force SSL
  const isLocal =
    databaseUrl.includes('localhost') ||
    databaseUrl.includes('127.0.0.1') ||
    databaseUrl.includes('::1');
  if (isLocal) {
    return undefined;
  }
  // For remote database connections (managed Postgres, cloud servers), enable SSL with rejectUnauthorized: false
  // to support cloud certificates and proxies out of the box
  return { rejectUnauthorized: false };
}
