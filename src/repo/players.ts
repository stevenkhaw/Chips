import type { Db } from '@/db/types';
import { newId, now } from '@/db/ids';
import { mapRow } from '@/db/map';
import type { Player } from '@/domain/types';

const COLS = 'id, created_at, updated_at, deleted_at, name, color_seed, archived';

function toPlayer(row: Record<string, unknown>): Player {
  const p = mapRow<Omit<Player, 'archived'> & { archived: number }>(row);
  return { ...p, archived: !!p.archived };
}

function normalizeName(db: Db, name: string, excludeId?: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Name required');
  const dup = db.first<{ id: string }>(
    'SELECT id FROM players WHERE deleted_at IS NULL AND lower(name) = lower(?) AND id != ?',
    [trimmed, excludeId ?? ''],
  );
  if (dup) throw new Error('Name already exists');
  return trimmed;
}

export function listPlayers(db: Db, opts: { includeArchived?: boolean } = {}): Player[] {
  const where = opts.includeArchived ? '' : 'AND archived = 0';
  return db
    .all<Record<string, unknown>>(`SELECT ${COLS} FROM players WHERE deleted_at IS NULL ${where} ORDER BY lower(name) ASC`)
    .map(toPlayer);
}

export function getPlayer(db: Db, id: string): Player | null {
  const row = db.first<Record<string, unknown>>(`SELECT ${COLS} FROM players WHERE id = ? AND deleted_at IS NULL`, [id]);
  return row ? toPlayer(row) : null;
}

export function createPlayer(db: Db, name: string): Player {
  const clean = normalizeName(db, name);
  const id = newId();
  const t = now();
  const colorSeed = Math.floor(Math.random() * 1000);
  db.run(
    'INSERT INTO players (id, created_at, updated_at, deleted_at, name, color_seed, archived) VALUES (?, ?, ?, NULL, ?, ?, 0)',
    [id, t, t, clean, colorSeed],
  );
  return { id, createdAt: t, updatedAt: t, deletedAt: null, name: clean, colorSeed, archived: false };
}

export function renamePlayer(db: Db, id: string, name: string): void {
  const clean = normalizeName(db, name, id);
  db.run('UPDATE players SET name = ?, updated_at = ? WHERE id = ?', [clean, now(), id]);
}

export function setPlayerArchived(db: Db, id: string, archived: boolean): void {
  db.run('UPDATE players SET archived = ?, updated_at = ? WHERE id = ?', [archived ? 1 : 0, now(), id]);
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
  db.run('UPDATE players SET deleted_at = ?, updated_at = ? WHERE id = ?', [t, t, id]);
}
