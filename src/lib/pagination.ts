import { asc, desc } from 'drizzle-orm';
import type { AnyColumn, SQL } from 'drizzle-orm';

import type { ListQuery, Paginated } from '@bareeq/shared';

export const offsetOf = (q: Pick<ListQuery, 'page' | 'pageSize'>): number =>
  (q.page - 1) * q.pageSize;

export function paginate<T>(
  data: T[],
  total: number,
  q: Pick<ListQuery, 'page' | 'pageSize'>,
): Paginated<T> {
  return { data, page: q.page, pageSize: q.pageSize, total };
}

/**
 * Resolves `sort` ("name" / "-name") against an allow-list of sortable columns.
 * Unknown fields fall back to `fallback`.
 */
export function orderByOf(
  sort: string | undefined,
  columns: Record<string, AnyColumn | SQL>,
  fallback: SQL,
): SQL {
  if (!sort) return fallback;
  const descending = sort.startsWith('-');
  const column = columns[descending ? sort.slice(1) : sort];
  if (!column) return fallback;
  return descending ? desc(column) : asc(column);
}

/** Escapes LIKE wildcards so user search text matches literally. */
export const likePattern = (search: string): string =>
  `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
