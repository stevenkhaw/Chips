import { createTestDb } from '../../test/nodeDb';
import { migrate, MIGRATIONS } from './schema';

describe('migrate', () => {
  it('creates all tables and sets user_version', () => {
    const db = createTestDb();
    const tables = db
      .all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .map((r) => r.name);
    expect(tables).toEqual(expect.arrayContaining(['players', 'sessions', 'session_players', 'buyins', 'chip_denoms', 'settings']));
    expect(db.first<{ user_version: number }>('PRAGMA user_version')?.user_version).toBe(MIGRATIONS.length);
  });

  it('seeds default settings', () => {
    const db = createTestDb();
    const s = db.first<{ default_buyin_cents: number; currency_symbol: string }>('SELECT * FROM settings WHERE id = ?', ['default']);
    expect(s).toEqual({ id: 'default', default_buyin_cents: 2000, currency_symbol: '$' });
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
