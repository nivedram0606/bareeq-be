import { stringify } from 'csv-stringify/sync';
import type { Response } from 'express';

/** UTF-8 byte-order mark: makes Excel open the file as UTF-8 so Arabic renders correctly. */
export const BOM = '﻿';

export type CsvValue = string | number | boolean | null | undefined;

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => CsvValue;
}

const NUMERIC = /^-?\d+(\.\d+)?$/;

/**
 * Neutralises spreadsheet formula injection: text cells starting with = + - @ (or tab/CR) are
 * prefixed with an apostrophe. Plain numbers such as "-4.500" are left untouched.
 */
export function safeCell(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/^[=+\-@\t\r]/.test(text) && !NUMERIC.test(text)) return `'${text}`;
  return text;
}

/** Serialises rows to CSV (RFC 4180 quoting, CRLF line endings) with a leading BOM. */
export function toCsv<T>(columns: CsvColumn<T>[], rows: readonly T[]): string {
  const records = [
    columns.map((c) => c.header),
    ...rows.map((row) => columns.map((c) => safeCell(c.value(row)))),
  ];
  return BOM + stringify(records, { record_delimiter: 'windows' });
}

/** CSV from plain objects using their keys as headers (used by the data export). */
export function recordsToCsv(headers: string[], rows: readonly Record<string, unknown>[]): string {
  return toCsv(
    headers.map((h) => ({
      header: h,
      value: (row: Record<string, unknown>) => {
        const v = row[h];
        if (v instanceof Date) return v.toISOString();
        if (v !== null && typeof v === 'object') return JSON.stringify(v);
        return v as CsvValue;
      },
    })),
    rows,
  );
}

export function sendCsv(res: Response, filename: string, csv: string): void {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(csv);
}

/** Today's date (YYYY-MM-DD) in Oman, for file names and month boundaries. */
export const todayInOman = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Muscat' }).format(new Date());
