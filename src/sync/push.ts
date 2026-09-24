import type { SupabaseClient } from '@supabase/supabase-js';
import type { Db } from '@/db/types';
import { LEDGER_TABLES } from '@/db/schema';
import { dirtyRows, getSyncHouse, markClean } from '@/repo/sync';
import { updateHouseRow, upsertRows } from './remote';

export const PUSH_CHUNK = 500;

/**
 * Pushes a published, owned house: the house row (4 columns) if dirty, then dirty ledger rows in FK order.
 * Clears `dirty` only on rows unchanged since they were read. Returns how many rows were pushed.
 * A failure throws and leaves the remaining rows dirty for the next try.
 */
export async function pushHouse(db: Db, client: SupabaseClient, houseId: string): Promise<number> {
  // Read the house row and every table's dirty rows synchronously, before the first await. JS is
  // single-threaded, so this is a consistent snapshot: a row created mid-push (e.g. a buy-in added
  // between two awaits, during a live night) can't slip into this push ahead of, or without, its
  // parent — which would otherwise fail with a transient FK violation (23503) that the next push
  // would silently heal, but which the UI would show as a raw error in the meantime.
  const h = getSyncHouse(db, houseId);
  if (!h || !h.published || h.role !== 'owner') return 0;
  const rowsByTable = LEDGER_TABLES.map((table) => ({ table, rows: dirtyRows(db, table, houseId) }));
  let pushed = 0;

  if (h.dirty) {
    await updateHouseRow(client, houseId, {
      name: h.name, currency_symbol: h.currencySymbol, updated_at: h.updatedAt, deleted_at: h.deletedAt,
    });
    markClean(db, 'houses', [{ id: houseId, updated_at: h.updatedAt }]);
    pushed += 1;
  }

  for (const { table, rows } of rowsByTable) {
    for (let i = 0; i < rows.length; i += PUSH_CHUNK) {
      const chunk = rows.slice(i, i + PUSH_CHUNK);
      await upsertRows(client, table, chunk);
      markClean(db, table, chunk as { id: string; updated_at: number }[]);
      pushed += chunk.length;
    }
  }
  return pushed;
}
