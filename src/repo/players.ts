import type { Db } from '@/db/types';
import { newId, now } from '@/db/ids';
import { mapRow } from '@/db/map';
import type { Player } from '@/domain/types';

const COLS = 'id, created_at, updated_at, deleted_at, name, color_seed, archived';

function toPlayer(row: Record<string, unknown>): Player {
  const p = mapRow<Omit<Player, 'archived'> & { archived: number }>(row);
  return { ...p, archived: !!p.archived };
}

function normalizeName(db: Db, houseId: string, name: string, excludeId?: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Name required');
  const dup = db.first<{ id: string }>(
    'SELECT id FROM players WHERE deleted_at IS NULL AND house_id = ? AND lower(name) = lower(?) AND id != ?',
    [houseId, trimmed, excludeId ?? ''],
  );
  if (dup) throw new Error('Name already exists');
  return trimmed;
}

export function listPlayers(db: Db, houseId: string, opts: { includeArchived?: boolean } = {}): Player[] {
  const where = opts.includeArchived ? '' : 'AND archived = 0';
  return db
    .all<Record<string, unknown>>(
      `SELECT ${COLS} FROM players WHERE deleted_at IS NULL AND house_id = ? ${where} ORDER BY lower(name) ASC`,
      [houseId],
    )
    .map(toPlayer);
}

export function getPlayer(db: Db, id: string): Player | null {
  const row = db.first<Record<string, unknown>>(`SELECT ${COLS} FROM players WHERE id = ? AND deleted_at IS NULL`, [id]);
  return row ? toPlayer(row) : null;
}

export function createPlayer(db: Db, houseId: string, name: string): Player {
  const clean = normalizeName(db, houseId, name);
  const id = newId();
  const t = now();
  const colorSeed = Math.floor(Math.random() * 1000);
  db.run(
    'INSERT INTO players (id, created_at, updated_at, deleted_at, name, color_seed, archived, house_id, dirty) VALUES (?, ?, ?, NULL, ?, ?, 0, ?, 1)',
    [id, t, t, clean, colorSeed, houseId],
  );
  return { id, createdAt: t, updatedAt: t, deletedAt: null, name: clean, colorSeed, archived: false };
}

export function renamePlayer(db: Db, id: string, name: string): void {
  const cur = db.first<{ house_id: string }>('SELECT house_id FROM players WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!cur) throw new Error('Player not found');
  const clean = normalizeName(db, cur.house_id, name, id);
  db.run('UPDATE players SET name = ?, updated_at = ?, dirty = 1 WHERE id = ? AND deleted_at IS NULL', [clean, now(), id]);
}

export function setPlayerArchived(db: Db, id: string, archived: boolean): void {
  const r = db.run('UPDATE players SET archived = ?, updated_at = ?, dirty = 1 WHERE id = ? AND deleted_at IS NULL', [
    archived ? 1 : 0, now(), id,
  ]);
  if (r.changes === 0) throw new Error('Player not found');
}

export function playerSessionCount(db: Db, id: string): number {
  const r = db.first<{ c: number }>(
    'SELECT COUNT(*) AS c FROM session_players WHERE player_id = ? AND deleted_at IS NULL',
    [id],
  );
  return r?.c ?? 0;
}

export function deletePlayer(db: Db, id: string): void {
  if (playerSessionCount(db, id) > 0) throw new Error('Player has sessions');
  const t = now();
  db.run('UPDATE players SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE id = ? AND deleted_at IS NULL', [t, t, id]);
}
