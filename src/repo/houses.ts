import type { Db } from '@/db/types';
import { newId, now } from '@/db/ids';
import { mapRow } from '@/db/map';
import type { House } from '@/domain/types';

const COLS = 'id, created_at, updated_at, deleted_at, name, role, join_code, currency_symbol, published, last_synced_at, closed';
const HOUSE_TABLES_CHILD_FIRST = ['payments', 'buyins', 'session_players', 'sessions', 'players'] as const;

function toHouse(row: Record<string, unknown>): House {
  const h = mapRow<Omit<House, 'published' | 'closed'> & { published: number; closed: number }>(row);
  return { ...h, published: !!h.published, closed: !!h.closed };
}

/** Server limits (supabase/migrations/20260924120000_houses.sql): name 1–60, currency 1–8. */
const NAME_MAX = 60;
const CURRENCY_MAX = 8;

function cleanName(name: string): string {
  const t = name.trim();
  if (!t) throw new Error('Name required');
  if (t.length > NAME_MAX) throw new Error(`Name too long (${NAME_MAX} max)`);
  return t;
}

function cleanCurrency(symbol: string): string {
  const t = symbol.trim();
  if (!t) throw new Error('Currency required');
  if (t.length > CURRENCY_MAX) throw new Error(`Currency too long (${CURRENCY_MAX} max)`);
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

/**
 * Returns a valid current house id, repairing settings if the stored one is missing or was
 * deleted (e.g. by sync). Falls back to another live house, or creates one if none remain.
 */
export function ensureCurrentHouse(db: Db): string {
  const row = db.first<{ current_house_id: string | null }>("SELECT current_house_id FROM settings WHERE id = 'default'");
  const currentId = row?.current_house_id ?? null;
  if (currentId && getHouse(db, currentId)) return currentId;

  const [live] = listHouses(db);
  if (live) {
    setCurrentHouse(db, live.id);
    return live.id;
  }

  const house = createHouse(db, { name: 'My House', currencySymbol: '$' });
  setCurrentHouse(db, house.id);
  return house.id;
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
  return {
    id, createdAt: t, updatedAt: t, deletedAt: null, name, role: 'owner', joinCode: null, currencySymbol, published: false,
    lastSyncedAt: null, closed: false,
  };
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

/**
 * Soft-deletes the house. If it was current, another house becomes current.
 *
 * A published (shared or joined) house soft-deletes only the house row: friends keep a read-only
 * copy of their players and nights (Steven's decision), and those local ledger rows are hidden
 * anyway since a deleted house is never listed or current. An unpublished house has no one else
 * to keep history for, so it still cascades the delete to its players and sessions.
 */
export function deleteHouse(db: Db, id: string): void {
  const house = getHouse(db, id);
  if (!house) throw new Error('House not found');
  const others = listHouses(db).filter((h) => h.id !== id);
  if (others.length === 0) throw new Error('Cannot delete your only house');
  const t = now();
  db.transaction(() => {
    if (!house.published) {
      for (const table of HOUSE_TABLES_CHILD_FIRST) {
        db.run(`UPDATE ${table} SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE house_id = ? AND deleted_at IS NULL`, [t, t, id]);
      }
    }
    db.run('UPDATE houses SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE id = ?', [t, t, id]);
    if (getCurrentHouseId(db) === id) db.run("UPDATE settings SET current_house_id = ? WHERE id = 'default'", [others[0].id]);
  });
}
