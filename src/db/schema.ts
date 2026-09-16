import type { Db } from './types';

const BASE = `
  id TEXT PRIMARY KEY NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER`;

export const MIGRATIONS: string[] = [
  // v1
  `
  CREATE TABLE IF NOT EXISTS players (${BASE},
    name TEXT NOT NULL,
    color_seed INTEGER NOT NULL DEFAULT 0,
    archived INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS sessions (${BASE},
    date TEXT NOT NULL,
    title TEXT,
    default_buyin_cents INTEGER NOT NULL,
    notes TEXT
  );
  CREATE TABLE IF NOT EXISTS session_players (${BASE},
    session_id TEXT NOT NULL REFERENCES sessions(id),
    player_id TEXT NOT NULL REFERENCES players(id),
    cashout_cents INTEGER,
    sort_order INTEGER NOT NULL DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_sp_session ON session_players(session_id);
  CREATE TABLE IF NOT EXISTS buyins (${BASE},
    session_player_id TEXT NOT NULL REFERENCES session_players(id),
    amount_cents INTEGER NOT NULL,
    at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_buyins_sp ON buyins(session_player_id);
  CREATE TABLE IF NOT EXISTS chip_denoms (${BASE},
    label TEXT NOT NULL,
    color_hex TEXT NOT NULL,
    value_cents INTEGER NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS settings (
    id TEXT PRIMARY KEY NOT NULL,
    default_buyin_cents INTEGER NOT NULL,
    currency_symbol TEXT NOT NULL
  );
  INSERT OR IGNORE INTO settings (id, default_buyin_cents, currency_symbol) VALUES ('default', 2000, '$');
  `,
  // v2
  `
  CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    from_player_id TEXT NOT NULL REFERENCES players(id),
    to_player_id TEXT NOT NULL REFERENCES players(id),
    amount_cents INTEGER NOT NULL,
    note TEXT,
    at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_payments_session ON payments(session_id);
  `,
];

export function migrate(db: Db): void {
  const row = db.first<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  for (let v = current; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      db.exec(MIGRATIONS[v]);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }
}
