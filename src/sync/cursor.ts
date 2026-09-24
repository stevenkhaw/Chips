import type { SyncTable } from '@/repo/sync';

export interface TableCursor {
  /** `server_updated_at` exactly as PostgREST returned it (microseconds included). */
  ts: string;
  id: string;
}
export type PullCursors = Partial<Record<SyncTable, TableCursor>>;

export const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
/** Rows are stamped when written, not when committed; re-reading a few seconds is harmless because pull is idempotent. */
export const OVERLAP_MS = 5000;

const EPOCH = new Date(0).toISOString();

export function parseCursors(raw: string | null): PullCursors {
  if (!raw) return {};
  try {
    const v: unknown = JSON.parse(raw);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as PullCursors) : {};
  } catch {
    return {};
  }
}

export function serializeCursors(c: PullCursors): string {
  return JSON.stringify(c);
}

/**
 * `YYYY-MM-DDTHH:MM:SS[.f…](Z|±HH:MM)` with the fraction forced to exactly 3 digits (padded, or
 * truncated to milliseconds, or `.000` when absent) and the offset kept. That is the strict ECMAScript
 * date-time format, so parsing doesn't depend on how lenient an engine's Date.parse is (Hermes vs V8).
 * Returns null for anything else.
 */
export function normalizeTimestamp(ts: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/.exec(ts.trim());
  if (!m) return null;
  const frac = (m[2] ?? '').slice(0, 3).padEnd(3, '0');
  return `${m[1]}.${frac}${m[3]}`;
}

/** Where the next pull of a table starts: OVERLAP_MS before the saved cursor, or the beginning. */
export function overlapStart(c: TableCursor | undefined): TableCursor {
  if (!c) return { ts: EPOCH, id: ZERO_UUID };
  const norm = normalizeTimestamp(c.ts);
  const ms = norm === null ? NaN : Date.parse(norm);
  if (Number.isNaN(ms)) return { ts: EPOCH, id: ZERO_UUID };
  return { ts: new Date(ms - OVERLAP_MS).toISOString(), id: ZERO_UUID };
}
