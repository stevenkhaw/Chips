import type { Db, SqlParam } from '@/db/types';
import { LEDGER_TABLES } from '@/db/schema';
import { now } from '@/db/ids';
import type { HouseRole } from '@/domain/types';
import { ensureCurrentHouse } from './houses';

export type SyncTable = (typeof LEDGER_TABLES)[number];
export type SyncRow = Record<string, string | number | null>;

const BASE = ['id', 'house_id', 'created_at', 'updated_at', 'deleted_at'] as const;

/** Columns shared by the local table and the server table (supabase/migrations/20260924120100_ledger.sql). */
export const SYNC_COLUMNS: Record<SyncTable, readonly string[]> = {
  players: [...BASE, 'name', 'color_seed', 'archived'],
  sessions: [...BASE, 'date', 'title', 'default_buyin_cents', 'notes'],
  session_players: [...BASE, 'session_id', 'player_id', 'cashout_cents', 'sort_order'],
  buyins: [...BASE, 'session_player_id', 'amount_cents', 'at'],
  payments: [...BASE, 'session_id', 'from_player_id', 'to_player_id', 'amount_cents', 'note', 'at'],
};

/** Dirty rows of one table in one house, shaped for an upsert (no `dirty`). */
export function dirtyRows(db: Db, table: SyncTable, houseId: string): SyncRow[] {
  return db.all<SyncRow>(`SELECT ${SYNC_COLUMNS[table].join(', ')} FROM ${table} WHERE house_id = ? AND dirty = 1`, [houseId]);
}

/** Clears `dirty` only where `updated_at` still equals the pushed value, so an edit made during a push is not lost. */
export function markClean(db: Db, table: SyncTable | 'houses', rows: { id: string; updated_at: number }[]): void {
  db.transaction(() => {
    for (const r of rows) db.run(`UPDATE ${table} SET dirty = 0 WHERE id = ? AND updated_at = ?`, [r.id, r.updated_at]);
  });
}

export function pendingCount(db: Db, houseId: string): number {
  let n = db.first<{ c: number }>('SELECT COUNT(*) AS c FROM houses WHERE id = ? AND dirty = 1', [houseId])?.c ?? 0;
  for (const t of LEDGER_TABLES) {
    n += db.first<{ c: number }>(`SELECT COUNT(*) AS c FROM ${t} WHERE house_id = ? AND dirty = 1`, [houseId])?.c ?? 0;
  }
  return n;
}

/** Upserts pulled rows as clean. Keys outside SYNC_COLUMNS (e.g. `server_updated_at`) are ignored. */
export function applyPulledRows(db: Db, table: SyncTable, rows: SyncRow[]): void {
  if (rows.length === 0) return;
  const cols = SYNC_COLUMNS[table];
  const updates = cols.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`).join(', ');
  const sql = `INSERT INTO ${table} (${cols.join(', ')}, dirty) VALUES (${cols.map(() => '?').join(', ')}, 0)
    ON CONFLICT(id) DO UPDATE SET ${updates}, dirty = 0`;
  db.transaction(() => {
    for (const r of rows) db.run(sql, cols.map((c) => (r[c] ?? null) as SqlParam));
  });
}

export interface SyncHouse {
  id: string;
  name: string;
  role: HouseRole;
  published: boolean;
  dirty: boolean;
  currencySymbol: string;
  updatedAt: number;
  deletedAt: number | null;
  joinCode: string | null;
  pullCursor: string | null;
  lastSyncedAt: number | null;
  closed: boolean;
}

const SYNC_HOUSE_COLS =
  'id, name, role, published, dirty, currency_symbol, updated_at, deleted_at, join_code, pull_cursor, last_synced_at, closed';

function toSyncHouse(r: Record<string, unknown>): SyncHouse {
  return {
    id: r.id as string,
    name: r.name as string,
    role: r.role as HouseRole,
    published: !!r.published,
    dirty: !!r.dirty,
    currencySymbol: r.currency_symbol as string,
    updatedAt: r.updated_at as number,
    deletedAt: (r.deleted_at as number | null) ?? null,
    joinCode: (r.join_code as string | null) ?? null,
    pullCursor: (r.pull_cursor as string | null) ?? null,
    lastSyncedAt: (r.last_synced_at as number | null) ?? null,
    closed: !!r.closed,
  };
}

/** Published houses that sync: live ones, plus deleted ones whose deletion has not been pushed yet. */
export function listSyncHouses(db: Db): SyncHouse[] {
  return db
    .all<Record<string, unknown>>(
      `SELECT ${SYNC_HOUSE_COLS} FROM houses WHERE published = 1 AND (deleted_at IS NULL OR dirty = 1) ORDER BY created_at ASC`,
    )
    .map(toSyncHouse);
}

/** Includes deleted houses. */
export function getSyncHouse(db: Db, id: string): SyncHouse | null {
  const r = db.first<Record<string, unknown>>(`SELECT ${SYNC_HOUSE_COLS} FROM houses WHERE id = ?`, [id]);
  return r ? toSyncHouse(r) : null;
}

/** True once any house on this phone is shared or joined (the anonymous account already exists). */
export function hasPublishedHouses(db: Db): boolean {
  return db.first('SELECT 1 FROM houses WHERE published = 1 LIMIT 1') != null;
}

export function markPublished(db: Db, id: string, joinCode: string): void {
  db.run('UPDATE houses SET published = 1, join_code = ? WHERE id = ?', [joinCode, id]);
}

/** At publish time every row must reach the server, whatever its dirty state. */
export function dirtyAllInHouse(db: Db, houseId: string): void {
  db.transaction(() => {
    for (const t of LEDGER_TABLES) db.run(`UPDATE ${t} SET dirty = 1 WHERE house_id = ?`, [houseId]);
    db.run('UPDATE houses SET dirty = 1 WHERE id = ?', [houseId]);
  });
}

export function setPullCursor(db: Db, id: string, raw: string): void {
  db.run('UPDATE houses SET pull_cursor = ? WHERE id = ?', [raw, id]);
}

export function setLastSynced(db: Db, id: string, t: number = now()): void {
  db.run('UPDATE houses SET last_synced_at = ? WHERE id = ?', [t, id]);
}

/** The house row as the server returns it (houses select / join RPC `house`). */
export interface ServerHouse {
  id: string;
  name: string;
  currency_symbol: string;
  join_code: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

/** Adds a house joined from the server. Returns false if it is already on this phone (e.g. the owner's own). */
export function insertJoinedHouse(db: Db, h: ServerHouse, role: HouseRole): boolean {
  if (db.first('SELECT id FROM houses WHERE id = ?', [h.id])) return false;
  db.run(
    `INSERT INTO houses (id, created_at, updated_at, deleted_at, name, role, join_code, currency_symbol, published, dirty, closed)
     VALUES (?, ?, ?, NULL, ?, ?, ?, ?, 1, 0, ?)`,
    [h.id, h.created_at, h.updated_at, h.name, role, h.join_code, h.currency_symbol, h.deleted_at === null ? 0 : 1],
  );
  return true;
}

/** Reader side: take the server's name, currency, code and closed state. Never marks the row dirty. */
export function applyServerHouse(db: Db, h: ServerHouse): void {
  db.run('UPDATE houses SET name = ?, currency_symbol = ?, join_code = ?, updated_at = ?, closed = ?, dirty = 0 WHERE id = ?', [
    h.name, h.currency_symbol, h.join_code, h.updated_at, h.deleted_at === null ? 0 : 1, h.id,
  ]);
}

const CHILD_FIRST = [...LEDGER_TABLES].reverse();

/** Hard-deletes a house and everything in it from this phone (leave / removed). Repairs the current house. */
export function purgeHouse(db: Db, id: string): void {
  db.transaction(() => {
    for (const t of CHILD_FIRST) db.run(`DELETE FROM ${t} WHERE house_id = ?`, [id]);
    db.run('DELETE FROM houses WHERE id = ?', [id]);
    db.run("UPDATE settings SET current_house_id = NULL WHERE id = 'default' AND current_house_id = ?", [id]);
  });
  ensureCurrentHouse(db);
}
