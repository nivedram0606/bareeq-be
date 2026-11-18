import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { env } from '../config/env.js';

import * as schema from './schema.js';

/** `prepare: false` is required by the Supavisor transaction-mode pooler. */
export const sqlClient = postgres(env.DATABASE_URL, {
  prepare: false,
  max: env.NODE_ENV === 'test' ? 4 : 10,
  onnotice: () => undefined,
});

export const db = drizzle(sqlClient, { schema });

export type Db = typeof db;
/** A transaction handle; services pass this to repos so writes share one transaction. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
/** Anything repos can query through: the root db or a transaction. */
export type Executor = Db | Tx;

export async function closeDb(): Promise<void> {
  await sqlClient.end({ timeout: 5 });
}
