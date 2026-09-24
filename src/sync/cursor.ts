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

/** Where the next pull of a table starts: OVERLAP_MS before the saved cursor, or the beginning. */
export function overlapStart(c: TableCursor | undefined): TableCursor {
  if (!c) return { ts: EPOCH, id: ZERO_UUID };
  // JS dates hold milliseconds; drop extra fractional digits before parsing.
  const ms = Date.parse(c.ts.replace(/(\.\d{3})\d+/, '$1'));
  if (Number.isNaN(ms)) return { ts: EPOCH, id: ZERO_UUID };
  return { ts: new Date(ms - OVERLAP_MS).toISOString(), id: ZERO_UUID };
}
