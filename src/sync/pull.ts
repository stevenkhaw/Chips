import type { SupabaseClient } from '@supabase/supabase-js';
import type { Db } from '@/db/types';
import { LEDGER_TABLES } from '@/db/schema';
import { applyPulledRows, applyServerHouse, getSyncHouse, pendingCount, setLastSynced, setPullCursor } from '@/repo/sync';
import { overlapStart, parseCursors, serializeCursors } from './cursor';
import { PAGE_SIZE, fetchHouse, fetchPage } from './remote';

export type PullResult = 'ok' | 'removed' | 'closed';

/**
 * Reader pull (spec §3.2): read the house row first (none → removed), then each table in FK order,
 * paging by (server_updated_at, id) from a few seconds before the saved cursor. Saves the cursor after each page.
 * Soft-deleted rows arrive like any other; local `deleted_at IS NULL` filters hide them.
 */
export async function pullHouse(db: Db, client: SupabaseClient, houseId: string): Promise<PullResult> {
  const local = getSyncHouse(db, houseId);
  if (!local) throw new Error('House not on this phone');
  // Owners are the source of truth: this never overwrites unpushed edits, so an owner house with
  // anything still dirty is left completely alone (no network call, no local change) rather than pulled.
  if (local.role === 'owner' && pendingCount(db, houseId) > 0) return 'ok';

  try {
    return await pullOnce(db, client, houseId);
  } catch (e) {
    // A child row can arrive before its parent: the owner stamps a row when written, not when
    // committed, so a parent read earlier in this pass may have been missed. Restart once from the
    // saved cursors; each table starts OVERLAP_MS back, so the parent is re-read before its children.
    if (!isForeignKeyError(e)) throw e;
    return pullOnce(db, client, houseId);
  }
}

function isForeignKeyError(e: unknown): boolean {
  const message = (e as { message?: unknown } | null)?.message;
  return typeof message === 'string' && message.includes('FOREIGN KEY');
}

async function pullOnce(db: Db, client: SupabaseClient, houseId: string): Promise<PullResult> {
  const server = await fetchHouse(client, houseId);
  if (!server) return 'removed';
  applyServerHouse(db, server);

  const cursors = parseCursors(getSyncHouse(db, houseId)?.pullCursor ?? null);
  for (const table of LEDGER_TABLES) {
    let after = overlapStart(cursors[table]);
    for (;;) {
      const page = await fetchPage(client, table, houseId, after);
      if (page.length === 0) break;
      applyPulledRows(db, table, page);
      const last = page[page.length - 1];
      after = { ts: last.server_updated_at, id: String(last.id) };
      cursors[table] = after;
      setPullCursor(db, houseId, serializeCursors(cursors));
      if (page.length < PAGE_SIZE) break;
    }
  }
  setLastSynced(db, houseId);
  return server.deleted_at === null ? 'ok' : 'closed';
}
