import { createTestDb } from '../../test/nodeDb';
import {
  createPlayer, listPlayers, getPlayer, renamePlayer, setPlayerArchived, setPlayerColor, deletePlayer, playerSessionCount,
} from './players';

describe('players repo', () => {
  it('creates and lists sorted by name', () => {
    const db = createTestDb();
    createPlayer(db, 'zed');
    createPlayer(db, 'Amy');
    expect(listPlayers(db).map((p) => p.name)).toEqual(['Amy', 'zed']);
  });

  it('trims name and rejects empty', () => {
    const db = createTestDb();
    expect(createPlayer(db, '  Bo ').name).toBe('Bo');
    expect(() => createPlayer(db, '   ')).toThrow('Name required');
  });

  it('rejects duplicate names case-insensitively', () => {
    const db = createTestDb();
    createPlayer(db, 'Amy');
    expect(() => createPlayer(db, 'amy')).toThrow('Name already exists');
  });

  it('getPlayer returns typed row with boolean archived', () => {
    const db = createTestDb();
    const p = createPlayer(db, 'Amy');
    const got = getPlayer(db, p.id);
    expect(got).toEqual(expect.objectContaining({ id: p.id, name: 'Amy', archived: false, deletedAt: null }));
    expect(typeof got!.colorSeed).toBe('number');
  });

  it('rename validates and updates updatedAt', () => {
    const db = createTestDb();
    const p = createPlayer(db, 'Amy');
    createPlayer(db, 'Bob');
    expect(() => renamePlayer(db, p.id, 'bob')).toThrow('Name already exists');
    renamePlayer(db, p.id, 'Amelia');
    expect(getPlayer(db, p.id)!.name).toBe('Amelia');
  });

  it('archived players hidden by default', () => {
    const db = createTestDb();
    const p = createPlayer(db, 'Amy');
    setPlayerArchived(db, p.id, true);
    expect(listPlayers(db)).toHaveLength(0);
    expect(listPlayers(db, { includeArchived: true })).toHaveLength(1);
  });

  it('soft delete hides player', () => {
    const db = createTestDb();
    const p = createPlayer(db, 'Amy');
    deletePlayer(db, p.id);
    expect(getPlayer(db, p.id)).toBeNull();
    expect(db.first('SELECT id FROM players WHERE id = ?', [p.id])).not.toBeNull();
  });

  it('refuses to delete a player with sessions', () => {
    const db = createTestDb();
    const p = createPlayer(db, 'Amy');
    db.run("INSERT INTO sessions (id, created_at, updated_at, date, default_buyin_cents) VALUES ('s1', 0, 0, '2026-01-01', 2000)");
    db.run("INSERT INTO session_players (id, created_at, updated_at, session_id, player_id) VALUES ('sp1', 0, 0, 's1', ?)", [p.id]);
    expect(playerSessionCount(db, p.id)).toBe(1);
    expect(() => deletePlayer(db, p.id)).toThrow('Player has sessions');
  });

  it('rename and archive throw for unknown or deleted ids', () => {
    const db = createTestDb();
    const p = createPlayer(db, 'Amy');
    deletePlayer(db, p.id);
    expect(() => renamePlayer(db, p.id, 'Amelia')).toThrow('Player not found');
    expect(() => setPlayerArchived(db, p.id, true)).toThrow('Player not found');
    expect(() => renamePlayer(db, 'nope', 'X')).toThrow('Player not found');
    // the soft-deleted row was not mutated
    expect(db.first<{ name: string; archived: number }>('SELECT name, archived FROM players WHERE id = ?', [p.id])).toEqual({ name: 'Amy', archived: 0 });
  });

  it('setPlayerColor stores the palette index and rejects bad input', () => {
    const db = createTestDb();
    const p = createPlayer(db, 'Amy');
    setPlayerColor(db, p.id, 5);
    expect(getPlayer(db, p.id)!.colorSeed).toBe(5);
    expect(() => setPlayerColor(db, p.id, -1)).toThrow('Invalid colour');
    expect(() => setPlayerColor(db, p.id, 1.5)).toThrow('Invalid colour');
    expect(() => setPlayerColor(db, 'nope', 2)).toThrow('Player not found');
    deletePlayer(db, p.id);
    expect(() => setPlayerColor(db, p.id, 2)).toThrow('Player not found');
  });
});
