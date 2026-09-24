import { createTestDb } from '../../test/nodeDb';
import type { Db } from '@/db/types';
import { createHouse, getCurrentHouseId, getHouse, listHouses } from './houses';
import { createPlayer, renamePlayer } from './players';
import { addBuyin, createSession } from './sessions';
import {
  SYNC_COLUMNS, applyPulledRows, applyServerHouse, dirtyAllInHouse, dirtyRows, getSyncHouse, hasPublishedHouses, insertJoinedHouse,
  listSyncHouses, markClean, markPublished, pendingCount, purgeHouse, setLastSynced, setPullCursor, type ServerHouse,
} from './sync';

function seed(db: Db) {
  const houseId = getCurrentHouseId(db);
  const ann = createPlayer(db, houseId, 'Ann');
  const bo = createPlayer(db, houseId, 'Bo');
  const s = createSession(db, houseId, { date: '2026-09-24', title: null, defaultBuyinCents: 2000, playerIds: [ann.id, bo.id] });
  const sp = db.first<{ id: string }>('SELECT id FROM session_players WHERE session_id = ? ORDER BY sort_order', [s.id])!;
  addBuyin(db, sp.id, 2000);
  return { houseId, ann, bo, s, spId: sp.id };
}

const server = (over: Partial<ServerHouse> = {}): ServerHouse => ({
  id: '0f0f0f0f-0000-4000-8000-000000000001',
  name: 'Tuesday Crew',
  currency_symbol: '£',
  join_code: 'K7QXM2PA',
  created_at: 100,
  updated_at: 200,
  deleted_at: null,
  ...over,
});

describe('sync repo', () => {
  it('lists dirty rows with exactly the server columns', () => {
    const db = createTestDb();
    const { houseId } = seed(db);
    const rows = dirtyRows(db, 'players', houseId);
    expect(rows).toHaveLength(2);
    expect(Object.keys(rows[0]).sort()).toEqual([...SYNC_COLUMNS.players].sort());
    expect(rows[0]).not.toHaveProperty('dirty');
    expect(dirtyRows(db, 'buyins', houseId)).toHaveLength(1);
  });

  it('markClean keeps a row dirty if it changed after it was read', () => {
    const db = createTestDb();
    const { houseId, ann } = seed(db);
    const pushed = dirtyRows(db, 'players', houseId) as { id: string; updated_at: number }[];
    db.run('UPDATE players SET updated_at = updated_at + 1 WHERE id = ?', [ann.id]); // edited mid-push
    markClean(db, 'players', pushed);
    expect(dirtyRows(db, 'players', houseId).map((r) => r.id)).toEqual([ann.id]);
  });

  it('counts pending rows across the house row and ledger tables', () => {
    const db = createTestDb();
    const { houseId } = seed(db);
    // My House (1) + 2 players + 1 session + 2 session players + 1 buy-in
    expect(pendingCount(db, houseId)).toBe(7);
    for (const t of ['players', 'sessions', 'session_players', 'buyins', 'payments'] as const) {
      markClean(db, t, dirtyRows(db, t, houseId) as { id: string; updated_at: number }[]);
    }
    db.run('UPDATE houses SET dirty = 0 WHERE id = ?', [houseId]);
    expect(pendingCount(db, houseId)).toBe(0);
    renamePlayer(db, dirtyRowsAll(db, houseId)[0], 'Annie');
    expect(pendingCount(db, houseId)).toBe(1);
  });

  it('dirtyAllInHouse re-marks every row, and publishing sets code and flag', () => {
    const db = createTestDb();
    const { houseId } = seed(db);
    db.run('UPDATE players SET dirty = 0');
    dirtyAllInHouse(db, houseId);
    expect(dirtyRows(db, 'players', houseId)).toHaveLength(2);
    markPublished(db, houseId, 'K7QXM2PA');
    expect(getHouse(db, houseId)).toEqual(expect.objectContaining({ published: true, joinCode: 'K7QXM2PA' }));
    expect(listSyncHouses(db).map((h) => h.id)).toEqual([houseId]);
  });

  it('hasPublishedHouses is true once any house is shared or joined', () => {
    const db = createTestDb();
    expect(hasPublishedHouses(db)).toBe(false);
    insertJoinedHouse(db, server(), 'reader');
    expect(hasPublishedHouses(db)).toBe(true);
    const db2 = createTestDb();
    markPublished(db2, getCurrentHouseId(db2), 'ABCDEFGH');
    expect(hasPublishedHouses(db2)).toBe(true);
  });

  it('lists deleted published houses only while they still need a push', () => {
    const db = createTestDb();
    const other = createHouse(db, { name: 'Other', currencySymbol: '$' });
    markPublished(db, other.id, 'AAAAAAAA');
    db.run('UPDATE houses SET deleted_at = 5, dirty = 1 WHERE id = ?', [other.id]);
    expect(listSyncHouses(db).map((h) => h.id)).toEqual([other.id]);
    markClean(db, 'houses', [{ id: other.id, updated_at: getSyncHouse(db, other.id)!.updatedAt }]);
    expect(listSyncHouses(db)).toEqual([]);
  });

  it('applies pulled rows as clean, parents first, and updates on conflict', () => {
    const db = createTestDb();
    const h = server();
    expect(insertJoinedHouse(db, h, 'reader')).toBe(true);
    expect(insertJoinedHouse(db, h, 'reader')).toBe(false);
    const p = { id: 'aaaaaaaa-0000-4000-8000-000000000001', house_id: h.id, created_at: 1, updated_at: 1, deleted_at: null, name: 'Ann', color_seed: 3, archived: 0 };
    applyPulledRows(db, 'players', [{ ...p, server_updated_at: 'x' } as never]);
    applyPulledRows(db, 'players', [{ ...p, name: 'Annie', updated_at: 2 }]);
    expect(db.all('SELECT name, dirty FROM players WHERE house_id = ?', [h.id])).toEqual([{ name: 'Annie', dirty: 0 }]);
    expect(getHouse(db, h.id)).toEqual(
      expect.objectContaining({ role: 'reader', published: true, joinCode: 'K7QXM2PA', name: 'Tuesday Crew', currencySymbol: '£' }),
    );
    expect(pendingCount(db, h.id)).toBe(0);
  });

  it('applyServerHouse updates fields and marks a deleted house closed', () => {
    const db = createTestDb();
    insertJoinedHouse(db, server(), 'reader');
    applyServerHouse(db, server({ name: 'Renamed', deleted_at: 999 }));
    expect(getHouse(db, server().id)).toEqual(expect.objectContaining({ name: 'Renamed', closed: true }));
  });

  it('stores cursor and last-synced time', () => {
    const db = createTestDb();
    const id = getCurrentHouseId(db);
    setPullCursor(db, id, '{"players":{"ts":"t","id":"i"}}');
    setLastSynced(db, id, 1234);
    expect(getSyncHouse(db, id)).toEqual(expect.objectContaining({ pullCursor: '{"players":{"ts":"t","id":"i"}}', lastSyncedAt: 1234 }));
  });

  it('purgeHouse hard-deletes the house and its rows and repairs the current house', () => {
    const db = createTestDb();
    const h = server();
    insertJoinedHouse(db, h, 'reader');
    applyPulledRows(db, 'players', [
      { id: 'aaaaaaaa-0000-4000-8000-000000000001', house_id: h.id, created_at: 1, updated_at: 1, deleted_at: null, name: 'Ann', color_seed: 0, archived: 0 },
    ]);
    db.run("UPDATE settings SET current_house_id = ? WHERE id = 'default'", [h.id]);
    purgeHouse(db, h.id);
    expect(db.first('SELECT id FROM houses WHERE id = ?', [h.id])).toBeNull();
    expect(db.all('SELECT id FROM players WHERE house_id = ?', [h.id])).toEqual([]);
    expect(listHouses(db).map((x) => x.name)).toEqual(['My House']);
    expect(getCurrentHouseId(db)).toBe(listHouses(db)[0].id);
  });
});

function dirtyRowsAll(db: Db, houseId: string): string[] {
  return db.all<{ id: string }>('SELECT id FROM players WHERE house_id = ? ORDER BY name', [houseId]).map((r) => r.id);
}
