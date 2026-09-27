import type { SupabaseClient } from '@supabase/supabase-js';
import type { Db } from '@/db/types';
import type { Invite } from '@/domain/invite';
import type { HouseRole } from '@/domain/types';
import { hasPublishedHouses, insertJoinedHouse } from '@/repo/sync';
import { ensureSession, rpcJoinHouse, rpcJoinHouseByLink, type JoinResponse } from './remote';
import { pullHouse } from './pull';

export type JoinOutcome =
  | { ok: true; houseId: string; role: HouseRole }
  | { ok: false; error: 'invalid' }
  | { ok: false; error: 'locked'; minutes: number };

/** `added` is false when the house was already on this phone (the owner's own, or joined before). */
export type LinkJoinOutcome =
  | { ok: true; houseId: string; role: HouseRole; added: boolean }
  | { ok: false; error: 'invalid' };

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
  await ensureSession(client, { allowNewUser: !hasPublishedHouses(db) });
  const r = await rpcJoinHouse(client, code, password, displayName);
  if (!r.ok) return r;
  await finishJoin(db, client, r);
  return { ok: true, houseId: r.house.id, role: r.role };
}

/** Join by invite link (spec §2.4). The server answers `invalid` for a wrong or rotated secret and a deleted house. */
export async function joinByLink(
  db: Db,
  client: SupabaseClient,
  invite: Invite,
  displayName?: string | null,
): Promise<LinkJoinOutcome> {
  await ensureSession(client, { allowNewUser: !hasPublishedHouses(db) });
  const r = await rpcJoinHouseByLink(client, invite.houseId, invite.secret, displayName);
  if (!r.ok) return { ok: false, error: 'invalid' };
  const added = await finishJoin(db, client, r);
  return { ok: true, houseId: r.house.id, role: r.role, added };
}

/** Adds a newly joined house and pulls it. Returns whether the house was new on this phone. */
async function finishJoin(db: Db, client: SupabaseClient, r: Extract<JoinResponse, { ok: true }>): Promise<boolean> {
  if (!insertJoinedHouse(db, r.house, r.role)) return false;
  try {
    await pullHouse(db, client, r.house.id);
  } catch {
    // The house is already inserted (so already in listSyncHouses); swallow so the join still
    // reports success, and let the next sync pass retry the pull.
  }
  return true;
}
