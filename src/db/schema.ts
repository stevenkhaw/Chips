import type { Db } from './types';
import { newId, now } from './ids';

const BASE = `
  id TEXT PRIMARY KEY NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER`;

type Migration = string | ((db: Db) => void);

/** Tables that belong to a house and will sync. */
export const LEDGER_TABLES = ['players', 'sessions', 'session_players', 'buyins', 'payments'] as const;

function hasColumn(db: Db, table: string, column: string): boolean {
  return db.all<{ name: string }>(`PRAGMA table_info(${table})`).some((c) => c.name === column);
}

function addColumn(db: Db, table: string, column: string, decl: string): void {
  if (!hasColumn(db, table, column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
}

/** v3: houses. A function (not SQL) so re-running it is safe: ALTER TABLE ADD COLUMN is not idempotent. */
function v3Houses(db: Db): void {
  db.exec(`CREATE TABLE IF NOT EXISTS houses (${BASE},
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'owner',
    join_code TEXT,
    currency_symbol TEXT NOT NULL DEFAULT '$',
    published INTEGER NOT NULL DEFAULT 0,
    pull_cursor TEXT,
    dirty INTEGER NOT NULL DEFAULT 1
  );`);
  for (const t of LEDGER_TABLES) {
    addColumn(db, t, 'house_id', 'TEXT');
    addColumn(db, t, 'dirty', 'INTEGER NOT NULL DEFAULT 1');
    db.exec(`CREATE INDEX IF NOT EXISTS idx_${t}_house ON ${t}(house_id)`);
  }
  addColumn(db, 'settings', 'current_house_id', 'TEXT');

  let houseId = db.first<{ id: string }>(
    'SELECT id FROM houses WHERE deleted_at IS NULL ORDER BY created_at ASC LIMIT 1',
  )?.id;
  if (!houseId) {
    houseId = newId();
    const t = now();
    const currency =
      db.first<{ currency_symbol: string }>("SELECT currency_symbol FROM settings WHERE id = 'default'")?.currency_symbol ?? '$';
    db.run(
      "INSERT INTO houses (id, created_at, updated_at, deleted_at, name, role, currency_symbol) VALUES (?, ?, ?, NULL, 'My House', 'owner', ?)",
      [houseId, t, t, currency],
    );
  }
  for (const t of LEDGER_TABLES) db.run(`UPDATE ${t} SET house_id = ? WHERE house_id IS NULL`, [houseId]);
  db.run("UPDATE settings SET current_house_id = ? WHERE id = 'default' AND current_house_id IS NULL", [houseId]);
}

export const MIGRATIONS: Migration[] = [
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
  // v3
  v3Houses,
];

export function migrate(db: Db): void {
  const row = db.first<{ user_version: number }>('PRAGMA user_version');
  const current = row?.user_version ?? 0;
  for (let v = current; v < MIGRATIONS.length; v++) {
    const m = MIGRATIONS[v];
    db.transaction(() => {
      if (typeof m === 'string') db.exec(m);
      else m(db);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }
}
