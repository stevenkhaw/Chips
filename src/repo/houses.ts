import type { Db } from '@/db/types';
import { newId, now } from '@/db/ids';
import { mapRow } from '@/db/map';
import type { House } from '@/domain/types';

const COLS = 'id, created_at, updated_at, deleted_at, name, role, join_code, currency_symbol, published';
const HOUSE_TABLES_CHILD_FIRST = ['payments', 'buyins', 'session_players', 'sessions', 'players'] as const;

function toHouse(row: Record<string, unknown>): House {
  const h = mapRow<Omit<House, 'published'> & { published: number }>(row);
  return { ...h, published: !!h.published };
}

function cleanName(name: string): string {
  const t = name.trim();
  if (!t) throw new Error('Name required');
  return t;
}

function cleanCurrency(symbol: string): string {
  const t = symbol.trim();
  if (!t) throw new Error('Currency required');
  return t;
}

export function listHouses(db: Db): House[] {
  return db
    .all<Record<string, unknown>>(
      `SELECT ${COLS} FROM houses WHERE deleted_at IS NULL ORDER BY CASE role WHEN 'owner' THEN 0 ELSE 1 END, lower(name) ASC`,
    )
    .map(toHouse);
}

export function getHouse(db: Db, id: string): House | null {
  const row = db.first<Record<string, unknown>>(`SELECT ${COLS} FROM houses WHERE id = ? AND deleted_at IS NULL`, [id]);
  return row ? toHouse(row) : null;
}

export function getCurrentHouseId(db: Db): string {
  const row = db.first<{ current_house_id: string | null }>("SELECT current_house_id FROM settings WHERE id = 'default'");
  if (!row?.current_house_id) throw new Error('No current house');
  return row.current_house_id;
}

export function setCurrentHouse(db: Db, id: string): void {
  if (!getHouse(db, id)) throw new Error('House not found');
  db.run("UPDATE settings SET current_house_id = ? WHERE id = 'default'", [id]);
}

export function createHouse(db: Db, input: { name: string; currencySymbol: string }): House {
  const name = cleanName(input.name);
  const currencySymbol = cleanCurrency(input.currencySymbol);
  const id = newId();
  const t = now();
  db.run(
    "INSERT INTO houses (id, created_at, updated_at, deleted_at, name, role, join_code, currency_symbol, published, dirty) VALUES (?, ?, ?, NULL, ?, 'owner', NULL, ?, 0, 1)",
    [id, t, t, name, currencySymbol],
  );
  return { id, createdAt: t, updatedAt: t, deletedAt: null, name, role: 'owner', joinCode: null, currencySymbol, published: false };
}

export function renameHouse(db: Db, id: string, name: string): void {
  const clean = cleanName(name);
  const r = db.run('UPDATE houses SET name = ?, updated_at = ?, dirty = 1 WHERE id = ? AND deleted_at IS NULL', [clean, now(), id]);
  if (r.changes === 0) throw new Error('House not found');
}

export function setHouseCurrency(db: Db, id: string, symbol: string): void {
  const clean = cleanCurrency(symbol);
  const r = db.run('UPDATE houses SET currency_symbol = ?, updated_at = ?, dirty = 1 WHERE id = ? AND deleted_at IS NULL', [
    clean, now(), id,
  ]);
  if (r.changes === 0) throw new Error('House not found');
}

/** Soft-deletes the house and everything in it. If it was current, another house becomes current. */
export function deleteHouse(db: Db, id: string): void {
  if (!getHouse(db, id)) throw new Error('House not found');
  const others = listHouses(db).filter((h) => h.id !== id);
  if (others.length === 0) throw new Error('Cannot delete your only house');
  const t = now();
  db.transaction(() => {
    for (const table of HOUSE_TABLES_CHILD_FIRST) {
      db.run(`UPDATE ${table} SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE house_id = ? AND deleted_at IS NULL`, [t, t, id]);
    }
    db.run('UPDATE houses SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE id = ?', [t, t, id]);
    if (getCurrentHouseId(db) === id) db.run("UPDATE settings SET current_house_id = ? WHERE id = 'default'", [others[0].id]);
  });
}
