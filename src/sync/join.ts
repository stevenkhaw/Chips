import type { SupabaseClient } from '@supabase/supabase-js';
import type { Db } from '@/db/types';
import type { HouseRole } from '@/domain/types';
import { insertJoinedHouse } from '@/repo/sync';
import { ensureSession, rpcJoinHouse } from './remote';
import { pullHouse } from './pull';

export type JoinOutcome =
  | { ok: true; houseId: string; role: HouseRole }
  | { ok: false; error: 'invalid' }
  | { ok: false; error: 'locked'; minutes: number };

/**
 * Join by code and password (spec §2.3). A house already on this phone (the owner's own) is left as is;
 * a new one is added with the role the server reports, then pulled.
 */
export async function joinByCode(
  db: Db,
  client: SupabaseClient,
  code: string,
  password: string,
  displayName?: string | null,
): Promise<JoinOutcome> {
  await ensureSession(client);
  const r = await rpcJoinHouse(client, code, password, displayName);
  if (!r.ok) return r;
  if (insertJoinedHouse(db, r.house, r.role)) await pullHouse(db, client, r.house.id);
  return { ok: true, houseId: r.house.id, role: r.role };
}
