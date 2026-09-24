import type { SupabaseClient } from '@supabase/supabase-js';
import type { HouseRole } from '@/domain/types';
import type { ServerHouse, SyncRow, SyncTable } from '@/repo/sync';
import type { TableCursor } from './cursor';

export const PAGE_SIZE = 500;
const HOUSE_COLS = 'id, name, currency_symbol, join_code, created_at, updated_at, deleted_at';

/**
 * PostgREST errors don't carry the HTTP status; attach it so errors.ts can treat a paused or down
 * project (5xx, 540 and gateway HTML pages) as offline.
 */
function withStatus<E extends object>(error: E, status: number): E & { status: number } {
  return Object.assign(error, { status });
}

export const signedOutError = () => Object.assign(new Error('signed_out'), { code: 'signed_out' as const });

/**
 * Returns the auth user id, signing in anonymously only when `allowNewUser` is set.
 *
 * A phone that has already shared or joined a house must keep its first anonymous user: a new
 * one owns nothing and belongs to nothing, so readers would be wiped as "removed" and owner pushes
 * refused. Callers pass `allowNewUser: true` only when the local db has no published houses (the
 * first share or join creates the account); otherwise a lost session throws `signed_out`.
 * Stopgap until phase 5's account linking lets a lost session be recovered.
 */
export async function ensureSession(client: SupabaseClient, opts?: { allowNewUser?: boolean }): Promise<string> {
  const { data, error } = await client.auth.getSession();
  // A failed token refresh (e.g. offline) comes back as `{ session: null, error }`, not a throw.
  // Surface that error instead of treating it as signed out, so we never sign in a new anonymous
  // user just because the device is offline.
  if (error) throw error;
  if (data.session) return data.session.user.id;
  if (!opts?.allowNewUser) throw signedOutError();
  const { data: signed, error: signInError } = await client.auth.signInAnonymously();
  if (signInError || !signed.user) throw signInError ?? new Error('Sign-in failed');
  return signed.user.id;
}

/** The signed-in user id, without ever signing in. Throws `signed_out` when there's no session. */
export async function currentUserId(client: SupabaseClient): Promise<string> {
  const { data, error } = await client.auth.getSession();
  // Same as ensureSession: a failed refresh (offline) returns `{ session: null, error }` rather
  // than throwing, so describeSyncError would otherwise misclassify it as signed out.
  if (error) throw error;
  if (!data.session) throw signedOutError();
  return data.session.user.id;
}

export async function rpcCreateHouse(
  client: SupabaseClient,
  a: { id: string; name: string; currency: string; password: string },
): Promise<{ join_code: string; invite_secret: string }> {
  const { data, error, status } = await client.rpc('create_house', {
    p_id: a.id, p_name: a.name, p_currency: a.currency, p_password: a.password,
  });
  if (error) throw withStatus(error, status);
  const row = (Array.isArray(data) ? data[0] : data) as { join_code: string; invite_secret: string } | undefined;
  if (!row) throw new Error('create_house returned nothing');
  return row;
}

export type JoinResponse =
  | { ok: true; house: ServerHouse; role: HouseRole }
  | { ok: false; error: 'invalid' }
  | { ok: false; error: 'locked'; minutes: number };

export async function rpcJoinHouse(
  client: SupabaseClient,
  code: string,
  password: string,
  displayName?: string | null,
): Promise<JoinResponse> {
  const { data, error, status } = await client.rpc('join_house', {
    p_code: code, p_password: password, p_display_name: displayName ?? null,
  });
  if (error) throw withStatus(error, status);
  return data as JoinResponse;
}

/** The house row, or null when the caller is not a member (RLS hides it). */
export async function fetchHouse(client: SupabaseClient, id: string): Promise<ServerHouse | null> {
  const { data, error, status } = await client.from('houses').select(HOUSE_COLS).eq('id', id).maybeSingle();
  if (error) throw withStatus(error, status);
  return (data as ServerHouse | null) ?? null;
}

/** Owner only; the server grants update on exactly these four columns. */
export async function updateHouseRow(
  client: SupabaseClient,
  id: string,
  patch: { name: string; currency_symbol: string; updated_at: number; deleted_at: number | null },
): Promise<void> {
  const { data, error, status } = await client.from('houses').update(patch).eq('id', id).select('id');
  if (error) throw withStatus(error, status);
  if (!data || data.length === 0) throw new Error('The server refused the house update');
}

export async function upsertRows(client: SupabaseClient, table: SyncTable, rows: SyncRow[]): Promise<void> {
  if (rows.length === 0) return;
  const { error, status } = await client.from(table).upsert(rows, { onConflict: 'id' });
  if (error) throw withStatus(error, status);
}

/** One page of rows after `after`, ordered by (server_updated_at, id). Values are quoted for PostgREST. */
export async function fetchPage(
  client: SupabaseClient,
  table: SyncTable,
  houseId: string,
  after: TableCursor,
  limit: number = PAGE_SIZE,
): Promise<(SyncRow & { server_updated_at: string })[]> {
  const ts = `"${after.ts}"`;
  const { data, error, status } = await client
    .from(table)
    .select('*')
    .eq('house_id', houseId)
    .or(`server_updated_at.gt.${ts},and(server_updated_at.eq.${ts},id.gt.${after.id})`)
    .order('server_updated_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(limit);
  if (error) throw withStatus(error, status);
  return (data ?? []) as (SyncRow & { server_updated_at: string })[];
}

export async function rpcLeaveHouse(client: SupabaseClient, houseId: string): Promise<void> {
  const { error, status } = await client.rpc('leave_house', { p_house_id: houseId });
  if (error) throw withStatus(error, status);
}

export async function rpcResetPassword(client: SupabaseClient, houseId: string, password: string): Promise<void> {
  const { error, status } = await client.rpc('reset_house_password', { p_house_id: houseId, p_password: password });
  if (error) throw withStatus(error, status);
}

export interface Member {
  user_id: string;
  role: HouseRole;
  display_name: string | null;
  joined_at: string;
}

/** Owner sees every member; a reader sees only their own row (RLS). */
export async function listMembers(client: SupabaseClient, houseId: string): Promise<Member[]> {
  const { data, error, status } = await client
    .from('house_members')
    .select('user_id, role, display_name, joined_at')
    .eq('house_id', houseId)
    .order('joined_at', { ascending: true });
  if (error) throw withStatus(error, status);
  return (data ?? []) as Member[];
}

/** Returns the new invite secret (the old link stops working). */
export async function rpcRemoveMember(client: SupabaseClient, houseId: string, userId: string): Promise<string> {
  const { data, error, status } = await client.rpc('remove_member', { p_house_id: houseId, p_user_id: userId });
  if (error) throw withStatus(error, status);
  return data as string;
}
