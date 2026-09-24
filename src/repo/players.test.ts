import { createTestDb } from '../../test/nodeDb';
import { createHouse, getCurrentHouseId } from './houses';
import {
  createPlayer, listPlayers, getPlayer, renamePlayer, setPlayerArchived, deletePlayer, playerSessionCount,
} from './players';

describe('players repo', () => {
  it('creates and lists sorted by name', () => {
    const db = createTestDb(); const h = getCurrentHouseId(db);
    createPlayer(db, h, 'zed');
    createPlayer(db, h, 'Amy');
    expect(listPlayers(db, h).map((p) => p.name)).toEqual(['Amy', 'zed']);
  });

  it('trims name and rejects empty', () => {
    const db = createTestDb(); const h = getCurrentHouseId(db);
    expect(createPlayer(db, h, '  Bo ').name).toBe('Bo');
    expect(() => createPlayer(db, h, '   ')).toThrow('Name required');
  });

  it('rejects duplicate names case-insensitively', () => {
    const db = createTestDb(); const h = getCurrentHouseId(db);
    createPlayer(db, h, 'Amy');
    expect(() => createPlayer(db, h, 'amy')).toThrow('Name already exists');
  });

  it('getPlayer returns typed row with boolean archived', () => {
    const db = createTestDb(); const h = getCurrentHouseId(db);
    const p = createPlayer(db, h, 'Amy');
    const got = getPlayer(db, p.id);
    expect(got).toEqual(expect.objectContaining({ id: p.id, name: 'Amy', archived: false, deletedAt: null }));
    expect(typeof got!.colorSeed).toBe('number');
  });

  it('rename validates and updates updatedAt', () => {
    const db = createTestDb(); const h = getCurrentHouseId(db);
    const p = createPlayer(db, h, 'Amy');
    createPlayer(db, h, 'Bob');
    expect(() => renamePlayer(db, p.id, 'bob')).toThrow('Name already exists');
    renamePlayer(db, p.id, 'Amelia');
    expect(getPlayer(db, p.id)!.name).toBe('Amelia');
  });

  it('archived players hidden by default', () => {
    const db = createTestDb(); const h = getCurrentHouseId(db);
    const p = createPlayer(db, h, 'Amy');
    setPlayerArchived(db, p.id, true);
    expect(listPlayers(db, h)).toHaveLength(0);
    expect(listPlayers(db, h, { includeArchived: true })).toHaveLength(1);
  });

  it('soft delete hides player', () => {
    const db = createTestDb(); const h = getCurrentHouseId(db);
    const p = createPlayer(db, h, 'Amy');
    deletePlayer(db, p.id);
    expect(getPlayer(db, p.id)).toBeNull();
    expect(db.first('SELECT id FROM players WHERE id = ?', [p.id])).not.toBeNull();
  });

  it('refuses to delete a player with sessions', () => {
    const db = createTestDb(); const h = getCurrentHouseId(db);
    const p = createPlayer(db, h, 'Amy');
    db.run("INSERT INTO sessions (id, created_at, updated_at, date, default_buyin_cents) VALUES ('s1', 0, 0, '2026-01-01', 2000)");
    db.run("INSERT INTO session_players (id, created_at, updated_at, session_id, player_id) VALUES ('sp1', 0, 0, 's1', ?)", [p.id]);
    expect(playerSessionCount(db, p.id)).toBe(1);
    expect(() => deletePlayer(db, p.id)).toThrow('Player has sessions');
  });

  it('rename and archive throw for unknown or deleted ids', () => {
    const db = createTestDb(); const h = getCurrentHouseId(db);
    const p = createPlayer(db, h, 'Amy');
    deletePlayer(db, p.id);
    expect(() => renamePlayer(db, p.id, 'Amelia')).toThrow('Player not found');
    expect(() => setPlayerArchived(db, p.id, true)).toThrow('Player not found');
    expect(() => renamePlayer(db, 'nope', 'X')).toThrow('Player not found');
    // the soft-deleted row was not mutated
    expect(db.first<{ name: string; archived: number }>('SELECT name, archived FROM players WHERE id = ?', [p.id])).toEqual({ name: 'Amy', archived: 0 });
  });
});

describe('players per house', () => {
  it('lists only the given house and allows the same name in two houses', () => {
    const db = createTestDb();
    const h = getCurrentHouseId(db);
    const other = createHouse(db, { name: 'Work', currencySymbol: '$' });
    createPlayer(db, h, 'Amy');
    expect(() => createPlayer(db, other.id, 'amy')).not.toThrow();
    expect(listPlayers(db, h).map((p) => p.name)).toEqual(['Amy']);
    expect(listPlayers(db, other.id).map((p) => p.name)).toEqual(['amy']);
  });

  it('rename checks duplicates inside the player house only', () => {
    const db = createTestDb();
    const h = getCurrentHouseId(db);
    const other = createHouse(db, { name: 'Work', currencySymbol: '$' });
    createPlayer(db, other.id, 'Bob');
    const amy = createPlayer(db, h, 'Amy');
    expect(() => renamePlayer(db, amy.id, 'Bob')).not.toThrow();
  });

  it('stamps house_id and marks every write dirty', () => {
    const db = createTestDb();
    const h = getCurrentHouseId(db);
    const p = createPlayer(db, h, 'Amy');
    const row = () => db.first<{ house_id: string; dirty: number }>('SELECT house_id, dirty FROM players WHERE id = ?', [p.id]);
    expect(row()).toEqual({ house_id: h, dirty: 1 });
    for (const write of [
      () => renamePlayer(db, p.id, 'Amelia'),
      () => setPlayerArchived(db, p.id, true),
      () => deletePlayer(db, p.id),
    ]) {
      db.run('UPDATE players SET dirty = 0');
      write();
      expect(row()?.dirty).toBe(1);
    }
  });
});
