import { createRawTestDb, createTestDb } from '../../test/nodeDb';
import { migrate, MIGRATIONS } from './schema';
import { getSessionDetail } from '@/repo/sessions';
import { computeRows } from '@/domain/nets';

describe('migrate', () => {
  it('creates all tables and sets user_version', () => {
    const db = createTestDb();
    const tables = db
      .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .map((r) => r.name);
    expect(tables).toEqual(
      expect.arrayContaining(['players', 'sessions', 'session_players', 'buyins', 'chip_denoms', 'settings', 'payments', 'houses']),
    );
    expect(db.first<{ user_version: number }>('PRAGMA user_version')?.user_version).toBe(MIGRATIONS.length);
  });

  it('seeds default settings', () => {
    const db = createTestDb();
    const s = db.first<{ default_buyin_cents: number; currency_symbol: string; current_house_id: string }>('SELECT * FROM settings WHERE id = ?', ['default']);
    expect(s).toEqual({ id: 'default', default_buyin_cents: 2000, currency_symbol: '$', current_house_id: expect.any(String) });
  });

  it('is idempotent: repeat call is a no-op and re-applying v1 SQL is safe', () => {
    const db = createTestDb();
    migrate(db); // no-op: version already current
    expect(db.first<{ user_version: number }>('PRAGMA user_version')?.user_version).toBe(MIGRATIONS.length);

    // Force the migration SQL to run again against an already-populated schema.
    db.exec('PRAGMA user_version = 0');
    expect(() => migrate(db)).not.toThrow();
    expect(db.first<{ user_version: number }>('PRAGMA user_version')?.user_version).toBe(MIGRATIONS.length);
    expect(db.first<{ c: number }>('SELECT COUNT(*) AS c FROM settings')?.c).toBe(1);
  });
});

describe('migration v3 (houses)', () => {
  function v2Db() {
    const db = createRawTestDb();
    db.exec(MIGRATIONS[0] as string);
    db.exec(MIGRATIONS[1] as string);
    db.exec('PRAGMA user_version = 2');
    db.run("UPDATE settings SET currency_symbol = '£' WHERE id = 'default'");
    db.run("INSERT INTO players (id, created_at, updated_at, name) VALUES ('p1', 1, 1, 'Ann'), ('p2', 1, 1, 'Bob')");
    db.run("INSERT INTO sessions (id, created_at, updated_at, date, default_buyin_cents) VALUES ('s1', 1, 1, '2026-09-01', 2000)");
    db.run(
      "INSERT INTO session_players (id, created_at, updated_at, session_id, player_id, cashout_cents, sort_order) VALUES ('sp1', 1, 1, 's1', 'p1', 3000, 0), ('sp2', 1, 1, 's1', 'p2', 1000, 1)",
    );
    db.run(
      "INSERT INTO buyins (id, created_at, updated_at, session_player_id, amount_cents, at) VALUES ('b1', 1, 1, 'sp1', 2000, 1), ('b2', 1, 1, 'sp2', 2000, 1)",
    );
    db.run(
      "INSERT INTO payments (id, created_at, updated_at, session_id, from_player_id, to_player_id, amount_cents, at) VALUES ('pay1', 1, 1, 's1', 'p2', 'p1', 1000, 1)",
    );
    return db;
  }

  it('creates My House with the old currency and stamps every existing row', () => {
    const db = v2Db();
    migrate(db);
    const houses = db.all<{ id: string; name: string; role: string; currency_symbol: string; published: number }>(
      'SELECT id, name, role, currency_symbol, published FROM houses',
    );
    expect(houses).toHaveLength(1);
    expect(houses[0]).toEqual(expect.objectContaining({ name: 'My House', role: 'owner', currency_symbol: '£', published: 0 }));
    const hid = houses[0].id;
    for (const t of ['players', 'sessions', 'session_players', 'buyins', 'payments']) {
      const rows = db.all<{ house_id: string | null; dirty: number }>(`SELECT house_id, dirty FROM ${t}`);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.house_id === hid && r.dirty === 1)).toBe(true);
    }
    expect(db.first<{ current_house_id: string }>("SELECT current_house_id FROM settings WHERE id = 'default'")?.current_house_id).toBe(hid);
  });

  it('leaves balances unchanged', () => {
    const db = v2Db();
    migrate(db);
    const nets = computeRows(getSessionDetail(db, 's1')!).map((r) => [r.name, r.netCents]);
    expect(nets).toEqual([
      ['Ann', 1000],
      ['Bob', -1000],
    ]);
  });

  it('re-running from version 0 keeps one house and the same id', () => {
    const db = v2Db();
    migrate(db);
    const before = db.first<{ id: string }>('SELECT id FROM houses')!.id;
    db.exec('PRAGMA user_version = 0');
    migrate(db);
    expect(db.all('SELECT id FROM houses')).toEqual([{ id: before }]);
  });

  it('a fresh install gets one empty My House', () => {
    const db = createTestDb();
    expect(db.all<{ name: string }>('SELECT name FROM houses').map((h) => h.name)).toEqual(['My House']);
  });
});
