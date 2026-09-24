import type { SupabaseClient } from '@supabase/supabase-js';
import type { Db } from '@/db/types';
import { dirtyAllInHouse, getSyncHouse, markPublished } from '@/repo/sync';
import { ensureSession, rpcCreateHouse } from './remote';
import { pushHouse } from './push';

/**
 * Share house (spec §2.2): sign in if needed, create the server house (safe to retry),
 * mark the local house published, then push every row.
 */
export async function publishHouse(
  db: Db,
  client: SupabaseClient,
  houseId: string,
  password: string,
): Promise<{ joinCode: string; inviteSecret: string }> {
  const h = getSyncHouse(db, houseId);
  if (!h || h.deletedAt !== null) throw new Error('House not found');
  if (h.role !== 'owner') throw new Error('Only the owner can share this house');
  if (password.length < 4) throw new Error('Password needs at least 4 characters');

  await ensureSession(client);
  const created = await rpcCreateHouse(client, { id: h.id, name: h.name, currency: h.currencySymbol, password });
  // markPublished and dirtyAllInHouse are each already atomic (dirtyAllInHouse wraps its own
  // transaction); Db.transaction() (both the expo and in-memory adapters) does not support
  // nesting, so they run sequentially rather than inside a second, outer transaction.
  markPublished(db, houseId, created.join_code);
  dirtyAllInHouse(db, houseId);
  await pushHouse(db, client, houseId);
  return { joinCode: created.join_code, inviteSecret: created.invite_secret };
}
