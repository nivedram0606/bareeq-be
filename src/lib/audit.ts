import type { AuditAction } from '@bareeq/shared';

import type { Executor } from '../db/client.js';
import { auditLog } from '../db/schema.js';

export interface AuditEntry {
  orgId: string;
  actorId: string;
  entity: string;
  entityId: string;
  action: AuditAction;
  diff?: Record<string, unknown> | null;
}

/** Writes an audit row. Pass the transaction handle so it commits with the change itself. */
export async function writeAudit(executor: Executor, entry: AuditEntry): Promise<void> {
  await executor.insert(auditLog).values({ ...entry, diff: entry.diff ?? null });
}

/** `{ field: { from, to } }` for fields whose value changed. */
export function diffOf<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): Record<string, { from: unknown; to: unknown }> {
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, to] of Object.entries(after)) {
    if (to === undefined) continue;
    const from = before[key];
    if (String(from) !== String(to)) diff[key] = { from, to };
  }
  return diff;
}
