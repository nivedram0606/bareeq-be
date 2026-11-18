import { asc, eq, getTableColumns, getTableName } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';

import { db } from '../../db/client.js';
import {
  academicYears,
  auditLog,
  classes,
  feeItems,
  guardians,
  organizations,
  payments,
  profiles,
  staff,
  students,
} from '../../db/schema.js';

export interface TableDump {
  /** SQL table name, used as the CSV file name. */
  name: string;
  /** SQL column names, in schema order. */
  headers: string[];
  /** Rows keyed by SQL column name. */
  rows: Record<string, unknown>[];
}

/** Every business table of the org, each with the column that scopes it to the org. */
const TABLES: [PgTable, PgColumn][] = [
  [organizations, organizations.id],
  [profiles, profiles.orgId],
  [academicYears, academicYears.orgId],
  [classes, classes.orgId],
  [students, students.orgId],
  [guardians, guardians.orgId],
  [staff, staff.orgId],
  [feeItems, feeItems.orgId],
  [payments, payments.orgId],
  [auditLog, auditLog.orgId],
];

/** Never exported: secrets and binary blobs. */
const EXCLUDED_COLUMNS = new Set([
  'profiles.password_hash',
  'profiles.session_version',
  'organizations.logo_data',
]);

async function dump(table: PgTable, scope: PgColumn, orgId: string): Promise<TableDump> {
  const tableName = getTableName(table);
  const columns = Object.entries(getTableColumns(table)).filter(
    ([, c]) => !EXCLUDED_COLUMNS.has(`${tableName}.${c.name}`),
  );
  const idColumn = columns.find(([, c]) => c.name === 'id')?.[1] ?? scope;
  const rows = (await db
    .select(Object.fromEntries(columns))
    .from(table)
    .where(eq(scope, orgId))
    .orderBy(asc(idColumn))) as Record<string, unknown>[];
  return {
    name: tableName,
    headers: columns.map(([, c]) => c.name),
    rows: rows.map((row) => Object.fromEntries(columns.map(([key, c]) => [c.name, row[key]]))),
  };
}

export const exportRepo = {
  async *tables(orgId: string): AsyncGenerator<TableDump> {
    for (const [table, scope] of TABLES) yield dump(table, scope, orgId);
  },
};
