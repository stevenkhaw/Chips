import type { SupabaseClient } from '@supabase/supabase-js';
import type { HouseRole } from '@/domain/types';
import type { ServerHouse, SyncRow, SyncTable } from '@/repo/sync';
import type { TableCursor } from './cursor';

export const PAGE_SIZE = 500;
const HOUSE_COLS = 'id, name, currency_symbol, join_code, created_at, updated_at, deleted_at';

/** Signs in anonymously the first time; returns the auth user id. */
export async function ensureSession(client: SupabaseClient): Promise<string> {
  const { data } = await client.auth.getSession();
  if (data.session) return data.session.user.id;
  const { data: signed, error } = await client.auth.signInAnonymously();
  if (error || !signed.user) throw error ?? new Error('Sign-in failed');
  return signed.user.id;
}

export async function rpcCreateHouse(
  client: SupabaseClient,
  a: { id: string; name: string; currency: string; password: string },
): Promise<{ join_code: string; invite_secret: string }> {
  const { data, error } = await client.rpc('create_house', {
    p_id: a.id, p_name: a.name, p_currency: a.currency, p_password: a.password,
  });
  if (error) throw error;
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
  const { data, error } = await client.rpc('join_house', {
    p_code: code, p_password: password, p_display_name: displayName ?? null,
  });
  if (error) throw error;
  return data as JoinResponse;
}

/** The house row, or null when the caller is not a member (RLS hides it). */
export async function fetchHouse(client: SupabaseClient, id: string): Promise<ServerHouse | null> {
  const { data, error } = await client.from('houses').select(HOUSE_COLS).eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as ServerHouse | null) ?? null;
}

/** Owner only; the server grants update on exactly these four columns. */
export async function updateHouseRow(
  client: SupabaseClient,
  id: string,
  patch: { name: string; currency_symbol: string; updated_at: number; deleted_at: number | null },
): Promise<void> {
  const { data, error } = await client.from('houses').update(patch).eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('The server refused the house update');
}

export async function upsertRows(client: SupabaseClient, table: SyncTable, rows: SyncRow[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await client.from(table).upsert(rows, { onConflict: 'id' });
  if (error) throw error;
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
  const { data, error } = await client
    .from(table)
    .select('*')
    .eq('house_id', houseId)
    .or(`server_updated_at.gt.${ts},and(server_updated_at.eq.${ts},id.gt.${after.id})`)
    .order('server_updated_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as (SyncRow & { server_updated_at: string })[];
}

export async function rpcLeaveHouse(client: SupabaseClient, houseId: string): Promise<void> {
  const { error } = await client.rpc('leave_house', { p_house_id: houseId });
  if (error) throw error;
}

export async function rpcResetPassword(client: SupabaseClient, houseId: string, password: string): Promise<void> {
  const { error } = await client.rpc('reset_house_password', { p_house_id: houseId, p_password: password });
  if (error) throw error;
}

export interface Member {
  user_id: string;
  role: HouseRole;
  display_name: string | null;
  joined_at: string;
}

/** Owner sees every member; a reader sees only their own row (RLS). */
export async function listMembers(client: SupabaseClient, houseId: string): Promise<Member[]> {
  const { data, error } = await client
    .from('house_members')
    .select('user_id, role, display_name, joined_at')
    .eq('house_id', houseId)
    .order('joined_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Member[];
}

/** Returns the new invite secret (the old link stops working). */
export async function rpcRemoveMember(client: SupabaseClient, houseId: string, userId: string): Promise<string> {
  const { data, error } = await client.rpc('remove_member', { p_house_id: houseId, p_user_id: userId });
  if (error) throw error;
  return data as string;
}
