import { createTestDb } from '../../test/nodeDb';
import {
  createHouse, deleteHouse, ensureCurrentHouse, getCurrentHouseId, getHouse, listHouses, renameHouse, setCurrentHouse,
  setHouseCurrency,
} from './houses';

describe('houses repo', () => {
  it('starts with My House as current', () => {
    const db = createTestDb();
    const [h] = listHouses(db);
    expect(h).toEqual(
      expect.objectContaining({ name: 'My House', role: 'owner', currencySymbol: '$', published: false, joinCode: null }),
    );
    expect(getCurrentHouseId(db)).toBe(h.id);
  });

  it('creates, trims, validates', () => {
    const db = createTestDb();
    const h = createHouse(db, { name: '  Tuesday Crew ', currencySymbol: ' £ ' });
    expect(h).toEqual(expect.objectContaining({ name: 'Tuesday Crew', currencySymbol: '£', role: 'owner', published: false }));
    expect(getHouse(db, h.id)).toEqual(h);
    expect(() => createHouse(db, { name: ' ', currencySymbol: '$' })).toThrow('Name required');
    expect(() => createHouse(db, { name: 'X', currencySymbol: ' ' })).toThrow('Currency required');
  });

  it('lists owned houses first, then by name', () => {
    const db = createTestDb();
    createHouse(db, { name: 'zeta', currencySymbol: '$' });
    const r = createHouse(db, { name: 'Alpha', currencySymbol: '$' });
    db.run("UPDATE houses SET role = 'reader' WHERE id = ?", [r.id]);
    expect(listHouses(db).map((h) => h.name)).toEqual(['My House', 'zeta', 'Alpha']);
  });

  it('switches current house and rejects unknown ids', () => {
    const db = createTestDb();
    const h = createHouse(db, { name: 'Work', currencySymbol: '$' });
    setCurrentHouse(db, h.id);
    expect(getCurrentHouseId(db)).toBe(h.id);
    expect(() => setCurrentHouse(db, 'nope')).toThrow('House not found');
  });

  it('renames and changes currency, marking the row dirty', () => {
    const db = createTestDb();
    const h = createHouse(db, { name: 'Work', currencySymbol: '$' });
    db.run('UPDATE houses SET dirty = 0');
    renameHouse(db, h.id, ' Office ');
    setHouseCurrency(db, h.id, '€');
    expect(getHouse(db, h.id)).toEqual(expect.objectContaining({ name: 'Office', currencySymbol: '€' }));
    expect(db.first<{ dirty: number }>('SELECT dirty FROM houses WHERE id = ?', [h.id])?.dirty).toBe(1);
    expect(() => renameHouse(db, 'nope', 'X')).toThrow('House not found');
    expect(() => setHouseCurrency(db, h.id, '')).toThrow('Currency required');
  });

  it('delete soft-deletes the house and its rows, and moves current to another house', () => {
    const db = createTestDb();
    const home = getCurrentHouseId(db);
    const work = createHouse(db, { name: 'Work', currencySymbol: '$' });
    setCurrentHouse(db, work.id);
    db.run("INSERT INTO players (id, created_at, updated_at, name, house_id) VALUES ('p1', 1, 1, 'Ann', ?)", [work.id]);
    db.run("INSERT INTO sessions (id, created_at, updated_at, date, default_buyin_cents, house_id) VALUES ('s1', 1, 1, '2026-09-01', 2000, ?)", [work.id]);

    deleteHouse(db, work.id);

    expect(getHouse(db, work.id)).toBeNull();
    expect(listHouses(db).map((h) => h.id)).toEqual([home]);
    expect(getCurrentHouseId(db)).toBe(home);
    expect(db.first<{ deleted_at: number | null }>("SELECT deleted_at FROM players WHERE id = 'p1'")?.deleted_at).not.toBeNull();
    expect(db.first<{ deleted_at: number | null }>("SELECT deleted_at FROM sessions WHERE id = 's1'")?.deleted_at).not.toBeNull();
  });

  it('refuses to delete the only house', () => {
    const db = createTestDb();
    expect(() => deleteHouse(db, getCurrentHouseId(db))).toThrow('Cannot delete your only house');
    expect(() => deleteHouse(db, 'nope')).toThrow('House not found');
  });

  describe('ensureCurrentHouse', () => {
    it('returns the current id unchanged when valid', () => {
      const db = createTestDb();
      const home = getCurrentHouseId(db);
      expect(ensureCurrentHouse(db)).toBe(home);
      expect(getCurrentHouseId(db)).toBe(home);
    });

    it('falls back to another house when the current one was soft-deleted', () => {
      const db = createTestDb();
      const home = getCurrentHouseId(db);
      const work = createHouse(db, { name: 'Work', currencySymbol: '$' });
      setCurrentHouse(db, work.id);
      db.run('UPDATE houses SET deleted_at = 1 WHERE id = ?', [work.id]);

      const id = ensureCurrentHouse(db);

      expect(id).toBe(home);
      expect(getCurrentHouseId(db)).toBe(home);
    });

    it('creates My House when every house was soft-deleted', () => {
      const db = createTestDb();
      const home = getCurrentHouseId(db);
      db.run('UPDATE houses SET deleted_at = 1 WHERE id = ?', [home]);

      const id = ensureCurrentHouse(db);

      const house = getHouse(db, id);
      expect(house).toEqual(expect.objectContaining({ name: 'My House', role: 'owner', currencySymbol: '$' }));
      expect(getCurrentHouseId(db)).toBe(id);
    });
  });

  it('caps name and currency length to what the server accepts', () => {
    const db = createTestDb();
    expect(() => createHouse(db, { name: 'x'.repeat(61), currencySymbol: '$' })).toThrow('Name too long (60 max)');
    expect(() => createHouse(db, { name: 'Ok', currencySymbol: '123456789' })).toThrow('Currency too long (8 max)');
    const h = createHouse(db, { name: 'x'.repeat(60), currencySymbol: '12345678' });
    expect(h).toEqual(expect.objectContaining({ lastSyncedAt: null, closed: false }));
    expect(() => renameHouse(db, h.id, 'y'.repeat(61))).toThrow('Name too long (60 max)');
  });
});
