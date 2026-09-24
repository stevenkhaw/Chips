# Shared Houses, Phase 1: Local Houses Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group players and nights into houses on the device, let the user create and switch houses, and hide editing UI for a read-only house, all with no network.

**Architecture:** Local SQLite gains a `houses` table plus `house_id` and `dirty` columns on the five ledger tables (migration v3, written as an idempotent function). Repos take an explicit `houseId`; stores read the current house id from the DB. A small `houseActions` module switches houses and reloads every store. Reader mode is one selector, `selectCanEdit`, used by an `EditorOnly` route guard and a few conditional renders.

**Tech Stack:** Expo SDK 57, expo-router, expo-sqlite (app) / node:sqlite (Jest), zustand 5, TypeScript, Jest (`jest-expo` preset).

**Spec:** `docs/superpowers/specs/2026-09-23-shared-houses-sync-design.md` (this plan covers build-order phase 1; §1.3, §4 minus network parts, §6.1 migration and `useCanEdit` tests).

**Deferred to later phases:** Share house, Join house, invite links, sync status line, reader "Leave house", the fresh-install "Join a house / Start my own" prompt (a fresh install gets an empty "My House" for now), Account section in Settings.

## Global Constraints

- Read the versioned Expo docs at https://docs.expo.dev/versions/v57.0.0/ before writing code that touches an Expo API (project rule in `AGENTS.md`).
- No network, no Supabase, no new dependencies in this phase.
- Every read keeps filtering `deleted_at IS NULL`; deletes stay soft.
- Every insert or update to `players`, `sessions`, `session_players`, `buyins`, `payments`, `houses` leaves the row with `dirty = 1` (the future push outbox). `chip_denoms` and `settings` are device-local and get no `dirty` column.
- `chip_denoms` and the default buy-in stay device-wide. Currency comes from the current house.
- Migration v3 must be idempotent: the existing test re-runs every migration from `user_version = 0`.
- Role values are exactly `'owner'` and `'reader'`. UI labels are exactly `Owner` and `Viewing`.
- `expo lint` is not set up: running it scaffolds `eslint.config.js`. Do not run it; if that file appears, delete it before committing.
- No simulator on this Mac. Verification is `npx tsc --noEmit`, `npx jest`, `npx expo export --platform ios`, then Steven checks on a device via Expo Go.
- Commit messages end with the line `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `src/db/schema.ts` | modify | Migrations may be SQL strings or functions; add v3 |
| `test/nodeDb.ts` | modify | Export `createRawTestDb()` (unmigrated) for migration tests |
| `src/db/schema.test.ts` | modify | v3 tests from a v2 fixture |
| `src/domain/types.ts` | modify | `House`, `HouseRole` |
| `src/repo/houses.ts` | create | House CRUD, current house |
| `src/repo/houses.test.ts` | create | Tests for the above |
| `src/repo/players.ts` | modify | Scope by `houseId`, set `dirty` |
| `src/repo/players.test.ts` | modify | Pass house id; per-house and dirty tests |
| `src/repo/sessions.ts` | modify | Scope by `houseId`, stamp children, set `dirty` |
| `src/repo/sessions.test.ts` | modify | Pass house id; scoping and dirty tests |
| `src/repo/settings.ts` | modify | Currency read/written on the current house |
| `src/repo/settings.test.ts` | modify | Currency follows house |
| `src/store/useHousesStore.ts` | create | Houses state, `selectCanEdit`, `useCanEdit`, `useCurrentHouse` |
| `src/store/houseActions.ts` | create | `reloadAll`, `switchHouse`, `createHouse`, `renameHouse`, `setHouseCurrency`, `deleteHouse` |
| `src/store/usePlayersStore.ts` | modify | Use current house |
| `src/store/useSessionsStore.ts` | modify | Use current house |
| `src/store/stores.test.ts` | modify | House switching and `selectCanEdit` tests |
| `src/app/_layout.tsx` | modify | Boot with `reloadAll()` |
| `src/components/HouseSwitcherSheet.tsx` | create | Bottom sheet listing houses |
| `src/components/HouseBar.tsx` | create | Tappable house name + role pill |
| `src/app/houses/new.tsx` | create | Create house screen |
| `src/app/houses/[id].tsx` | create | House settings screen |
| `src/components/EditorOnly.tsx` | create | Redirects readers away from edit screens |
| `src/app/(tabs)/index.tsx` | modify | HouseBar; hide edit entry points for readers |
| `src/app/(tabs)/history.tsx` | modify | HouseBar; hide Start button for readers |
| `src/app/session/[id]/index.tsx` | modify | Wrap editor in `EditorOnly` |
| `src/app/new-session/index.tsx` | modify | Wrap in `EditorOnly` |
| `src/app/players.tsx` | modify | Wrap in `EditorOnly` |
| `src/app/session/[id]/settle.tsx` | modify | Hide payment logging for readers |
| `src/components/PaymentRow.tsx` | modify | `onDelete` optional |

---

### Task 0: Start from a branch that includes player stats

The player page (`src/app/player/[id].tsx`) lives on `feat/player-stats`, which Steven is still checking on his phone. Phase 1 touches screens that link to it, so this branch must contain it.

**Files:** none edited.

- [ ] **Step 1: Check whether player stats reached main**

Run: `git fetch origin 2>/dev/null; git branch --contains feat/player-stats | grep -w main`
Expected: prints `main` if merged.

- [ ] **Step 2: Bring it in**

If Step 1 printed `main`: run `git merge main` on `feat/shared-houses`.
If it did not: stop and ask Steven whether to merge `feat/player-stats` into `main` first or to merge it straight into `feat/shared-houses` (`git merge feat/player-stats`). Do not pick for him.

- [ ] **Step 3: Confirm a clean baseline**

Run: `npx jest && npx tsc --noEmit`
Expected: all suites pass, no type errors. Record the passing test count; later tasks must not reduce it.

---

### Task 1: Migration v3 (houses table, house_id and dirty columns)

**Files:**
- Modify: `src/db/schema.ts`
- Modify: `test/nodeDb.ts`
- Test: `src/db/schema.test.ts`

**Interfaces:**
- Produces: `MIGRATIONS: Migration[]` where `type Migration = string | ((db: Db) => void)`; `LEDGER_TABLES` (`readonly ['players','sessions','session_players','buyins','payments']`); `createRawTestDb(): Db` in `test/nodeDb.ts`. After migration, `settings.current_house_id` holds the id of house "My House".

- [ ] **Step 1: Split the test DB helper**

Replace the body of `test/nodeDb.ts` with:

```ts
import { DatabaseSync } from 'node:sqlite';
import type { Db, SqlParam } from '@/db/types';
import { migrate } from '@/db/schema';

/** In-memory DB with no migrations applied. */
export function createRawTestDb(): Db {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON;');
  return {
    exec: (sql) => sqlite.exec(sql),
    run: (sql, params: SqlParam[] = []) => {
      const r = sqlite.prepare(sql).run(...params);
      return { changes: Number(r.changes) };
    },
    all: <T>(sql: string, params: SqlParam[] = []) => sqlite.prepare(sql).all(...params) as T[],
    first: <T>(sql: string, params: SqlParam[] = []) => (sqlite.prepare(sql).get(...params) as T | undefined) ?? null,
    transaction: <T>(fn: () => T): T => {
      sqlite.exec('BEGIN');
      try {
        const r = fn();
        sqlite.exec('COMMIT');
        return r;
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
    },
  };
}

export function createTestDb(): Db {
  const db = createRawTestDb();
  migrate(db);
  return db;
}
```

- [ ] **Step 2: Write the failing tests**

In `src/db/schema.test.ts`, change the import line to:

```ts
import { createRawTestDb, createTestDb } from '../../test/nodeDb';
import { migrate, MIGRATIONS } from './schema';
import { getSessionDetail } from '@/repo/sessions';
import { computeRows } from '@/domain/nets';
```

Add `'houses'` to the `arrayContaining` list in the first test, then append:

```ts
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx jest src/db/schema.test.ts`
Expected: FAIL (`no such table: houses`).

- [ ] **Step 4: Implement v3**

In `src/db/schema.ts`:

1. Add `import { newId, now } from './ids';` below the existing import.
2. Change `export const MIGRATIONS: string[] = [` to `export const MIGRATIONS: Migration[] = [` and add `v3Houses,` as the last element (after the v2 template string, with a `// v3` comment above it).
3. Above `MIGRATIONS`, add:

```ts
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
```

`BASE` is declared above `MIGRATIONS` already; keep `v3Houses` below `BASE`.

4. Replace the loop body in `migrate` with:

```ts
  for (let v = current; v < MIGRATIONS.length; v++) {
    const m = MIGRATIONS[v];
    db.transaction(() => {
      if (typeof m === 'string') db.exec(m);
      else m(db);
      db.exec(`PRAGMA user_version = ${v + 1}`);
    });
  }
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest src/db`
Expected: PASS, including the existing idempotency test.

- [ ] **Step 6: Run the whole suite**

Run: `npx jest`
Expected: PASS. Nothing else reads the new columns yet.

- [ ] **Step 7: Commit**

```bash
git add src/db/schema.ts src/db/schema.test.ts test/nodeDb.ts
git commit -m "feat(db): migration v3 adds houses and stamps existing rows into My House

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Houses repo

**Files:**
- Modify: `src/domain/types.ts`
- Create: `src/repo/houses.ts`
- Test: `src/repo/houses.test.ts`

**Interfaces:**
- Consumes: v3 schema from Task 1.
- Produces (all in `src/repo/houses.ts`):
  - `listHouses(db: Db): House[]` (owned first, then name A→Z, case-insensitive)
  - `getHouse(db: Db, id: string): House | null`
  - `getCurrentHouseId(db: Db): string` (throws `'No current house'`)
  - `setCurrentHouse(db: Db, id: string): void` (throws `'House not found'`)
  - `createHouse(db: Db, input: { name: string; currencySymbol: string }): House`
  - `renameHouse(db: Db, id: string, name: string): void`
  - `setHouseCurrency(db: Db, id: string, symbol: string): void`
  - `deleteHouse(db: Db, id: string): void` (throws `'Cannot delete your only house'`)
  - Errors: `'Name required'`, `'Currency required'`, `'House not found'`.
- Produces (in `src/domain/types.ts`): `HouseRole`, `House`.

- [ ] **Step 1: Add the types**

Append to `src/domain/types.ts`:

```ts
export type HouseRole = 'owner' | 'reader';

export interface House extends BaseRow {
  name: string;
  role: HouseRole;
  joinCode: string | null;
  currencySymbol: string;
  published: boolean;
}
```

- [ ] **Step 2: Write the failing tests**

Create `src/repo/houses.test.ts`:

```ts
import { createTestDb } from '../../test/nodeDb';
import {
  createHouse, deleteHouse, getCurrentHouseId, getHouse, listHouses, renameHouse, setCurrentHouse, setHouseCurrency,
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
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx jest src/repo/houses.test.ts`
Expected: FAIL (`Cannot find module './houses'`).

- [ ] **Step 4: Implement**

Create `src/repo/houses.ts`:

```ts
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest src/repo/houses.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/domain/types.ts src/repo/houses.ts src/repo/houses.test.ts
git commit -m "feat(repo): houses repo with current-house tracking

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Scope the players repo by house

**Files:**
- Modify: `src/repo/players.ts`
- Test: `src/repo/players.test.ts`

**Interfaces:**
- Consumes: `getCurrentHouseId`, `createHouse` from Task 2.
- Produces (changed signatures):
  - `listPlayers(db: Db, houseId: string, opts?: { includeArchived?: boolean }): Player[]`
  - `createPlayer(db: Db, houseId: string, name: string): Player`
  - `renamePlayer`, `setPlayerArchived`, `deletePlayer`, `getPlayer`, `playerSessionCount`: unchanged signatures.
  - Duplicate-name check is per house.

- [ ] **Step 1: Update existing tests to pass a house id**

Run from the repo root:

(`perl` rather than BSD `sed`, because the replacement needs a newline.)

```bash
perl -pi \
  -e "s|^import \{ createTestDb \} from '../../test/nodeDb';|import { createTestDb } from '../../test/nodeDb';\nimport { createHouse, getCurrentHouseId } from './houses';|;" \
  -e 's/const db = createTestDb\(\);/const db = createTestDb(); const h = getCurrentHouseId(db);/;' \
  -e 's/createPlayer\(db, /createPlayer(db, h, /g;' \
  -e 's/listPlayers\(db([,)])/listPlayers(db, h$1/g;' \
  src/repo/players.test.ts
```

Open the file and check: every `createPlayer(` and `listPlayers(` call has `h` as its second argument, and the import line for `./houses` is present on its own line.

- [ ] **Step 2: Add the new failing tests**

Append to `src/repo/players.test.ts`:

```ts
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx jest src/repo/players.test.ts`
Expected: FAIL (wrong argument types / duplicates across houses rejected / dirty stays 0).

- [ ] **Step 4: Implement**

In `src/repo/players.ts` replace `normalizeName`, `listPlayers`, `createPlayer`, `renamePlayer`, `setPlayerArchived` and `deletePlayer` with:

```ts
function normalizeName(db: Db, houseId: string, name: string, excludeId?: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Name required');
  const dup = db.first<{ id: string }>(
    'SELECT id FROM players WHERE deleted_at IS NULL AND house_id = ? AND lower(name) = lower(?) AND id != ?',
    [houseId, trimmed, excludeId ?? ''],
  );
  if (dup) throw new Error('Name already exists');
  return trimmed;
}

export function listPlayers(db: Db, houseId: string, opts: { includeArchived?: boolean } = {}): Player[] {
  const where = opts.includeArchived ? '' : 'AND archived = 0';
  return db
    .all<Record<string, unknown>>(
      `SELECT ${COLS} FROM players WHERE deleted_at IS NULL AND house_id = ? ${where} ORDER BY lower(name) ASC`,
      [houseId],
    )
    .map(toPlayer);
}

export function createPlayer(db: Db, houseId: string, name: string): Player {
  const clean = normalizeName(db, houseId, name);
  const id = newId();
  const t = now();
  const colorSeed = Math.floor(Math.random() * 1000);
  db.run(
    'INSERT INTO players (id, created_at, updated_at, deleted_at, name, color_seed, archived, house_id, dirty) VALUES (?, ?, ?, NULL, ?, ?, 0, ?, 1)',
    [id, t, t, clean, colorSeed, houseId],
  );
  return { id, createdAt: t, updatedAt: t, deletedAt: null, name: clean, colorSeed, archived: false };
}

export function renamePlayer(db: Db, id: string, name: string): void {
  const cur = db.first<{ house_id: string }>('SELECT house_id FROM players WHERE id = ? AND deleted_at IS NULL', [id]);
  if (!cur) throw new Error('Player not found');
  const clean = normalizeName(db, cur.house_id, name, id);
  db.run('UPDATE players SET name = ?, updated_at = ?, dirty = 1 WHERE id = ? AND deleted_at IS NULL', [clean, now(), id]);
}

export function setPlayerArchived(db: Db, id: string, archived: boolean): void {
  const r = db.run('UPDATE players SET archived = ?, updated_at = ?, dirty = 1 WHERE id = ? AND deleted_at IS NULL', [
    archived ? 1 : 0, now(), id,
  ]);
  if (r.changes === 0) throw new Error('Player not found');
}

export function deletePlayer(db: Db, id: string): void {
  if (playerSessionCount(db, id) > 0) throw new Error('Player has sessions');
  const t = now();
  db.run('UPDATE players SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE id = ? AND deleted_at IS NULL', [t, t, id]);
}
```

Keep `playerSessionCount` above `deletePlayer` as it is today (move `deletePlayer` below it if needed).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest src/repo/players.test.ts`
Expected: PASS. (`usePlayersStore` now has type errors; Task 6 fixes them. Jest does not type-check, so the store tests still run.)

- [ ] **Step 6: Commit**

```bash
git add src/repo/players.ts src/repo/players.test.ts
git commit -m "feat(repo): scope players to a house and mark writes dirty

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Scope the sessions repo by house

**Files:**
- Modify: `src/repo/sessions.ts`
- Test: `src/repo/sessions.test.ts`

**Interfaces:**
- Consumes: `getCurrentHouseId`, `createHouse` (Task 2); `createPlayer(db, houseId, name)` (Task 3).
- Produces (changed signatures):
  - `createSession(db: Db, houseId: string, input: CreateSessionInput): Session`
  - `listSessionDetails(db: Db, houseId: string): SessionDetail[]`
  - `listSessionSummaries(db: Db, houseId: string): SessionSummary[]`
  - `lastSessionPlayerIds(db: Db, houseId: string): string[]`
  - Child rows (`session_players`, `buyins`, `payments`) copy `house_id` from their parent in SQL; their function signatures do not change.

- [ ] **Step 1: Update existing tests to pass a house id**

```bash
perl -pi \
  -e "s|^import \{ createPlayer \} from './players';|import { createPlayer } from './players';\nimport { createHouse, getCurrentHouseId } from './houses';|;" \
  -e 's/^  const db = createTestDb\(\);/  const db = createTestDb();\n  const h = getCurrentHouseId(db);/;' \
  -e 's/return \{ db, ann, bob, cat \};/return { db, h, ann, bob, cat };/;' \
  -e 's/const \{ db, /const { db, h, /g;' \
  -e 's/createPlayer\(db, /createPlayer(db, h, /g;' \
  -e 's/createSession\(db, \{/createSession(db, h, {/g;' \
  -e 's/listSessionSummaries\(db\)/listSessionSummaries(db, h)/g;' \
  -e 's/listSessionDetails\(db\)/listSessionDetails(db, h)/g;' \
  -e 's/lastSessionPlayerIds\(db\)/lastSessionPlayerIds(db, h)/g;' \
  src/repo/sessions.test.ts
```

Open the file and check `setup()` now declares `h` and returns it, and no call to the five functions above is missing `h`. (The tsconfig does not enable `noUnusedLocals`, so tests that destructure `h` without using it are fine.)

- [ ] **Step 2: Add the new failing tests**

Append to `src/repo/sessions.test.ts`:

```ts
describe('sessions per house', () => {
  it('lists only the given house', () => {
    const { db, h, ann } = setup();
    const other = createHouse(db, { name: 'Work', currencySymbol: '$' });
    const zed = createPlayer(db, other.id, 'Zed');
    createSession(db, h, { date: '2026-09-01', title: 'Home', defaultBuyinCents: 2000, playerIds: [ann.id] });
    createSession(db, other.id, { date: '2026-09-02', title: 'Work', defaultBuyinCents: 2000, playerIds: [zed.id] });
    expect(listSessionSummaries(db, h).map((s) => s.session.title)).toEqual(['Home']);
    expect(listSessionDetails(db, other.id).map((d) => d.session.title)).toEqual(['Work']);
    expect(lastSessionPlayerIds(db, h)).toEqual([ann.id]);
    expect(lastSessionPlayerIds(db, other.id)).toEqual([zed.id]);
  });

  it('children inherit the session house_id', () => {
    const { db, ann, bob } = setup();
    const other = createHouse(db, { name: 'Work', currencySymbol: '$' });
    const s = createSession(db, other.id, { date: '2026-09-01', title: null, defaultBuyinCents: 2000, playerIds: [ann.id] });
    const sp = addPlayerToSession(db, s.id, bob.id);
    const b = addBuyin(db, sp.id, 2000);
    const pay = addPayment(db, s.id, { fromPlayerId: bob.id, toPlayerId: ann.id, amountCents: 500 });
    const house = (table: string, id: string) =>
      db.first<{ house_id: string }>(`SELECT house_id FROM ${table} WHERE id = ?`, [id])?.house_id;
    expect(house('sessions', s.id)).toBe(other.id);
    expect(house('session_players', sp.id)).toBe(other.id);
    expect(house('buyins', b.id)).toBe(other.id);
    expect(house('payments', pay.id)).toBe(other.id);
    const firstSp = getSessionDetail(db, s.id)!.players[0].sp.id;
    expect(house('session_players', firstSp)).toBe(other.id);
  });

  it('every update marks the row dirty', () => {
    const { db, h, ann, bob } = setup();
    const s = createSession(db, h, { date: '2026-09-01', title: null, defaultBuyinCents: 2000, playerIds: [ann.id, bob.id] });
    const sp = getSessionDetail(db, s.id)!.players[0].sp;
    const b = addBuyin(db, sp.id, 2000);
    const pay = addPayment(db, s.id, { fromPlayerId: bob.id, toPlayerId: ann.id, amountCents: 500 });
    const clean = () => {
      for (const t of ['sessions', 'session_players', 'buyins', 'payments']) db.run(`UPDATE ${t} SET dirty = 0`);
    };
    const dirty = (table: string, id: string) =>
      db.first<{ dirty: number }>(`SELECT dirty FROM ${table} WHERE id = ?`, [id])?.dirty;

    clean(); updateSession(db, s.id, { title: 'X' }); expect(dirty('sessions', s.id)).toBe(1);
    clean(); setCashout(db, sp.id, 1000); expect(dirty('session_players', sp.id)).toBe(1);
    clean(); updateBuyin(db, b.id, 2500); expect(dirty('buyins', b.id)).toBe(1);
    clean(); removeBuyin(db, b.id); expect(dirty('buyins', b.id)).toBe(1);
    clean(); removePayment(db, pay.id); expect(dirty('payments', pay.id)).toBe(1);
    clean(); removePlayerFromSession(db, sp.id); expect(dirty('session_players', sp.id)).toBe(1);
    clean(); deleteSession(db, s.id); expect(dirty('sessions', s.id)).toBe(1);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx jest src/repo/sessions.test.ts`
Expected: FAIL.

- [ ] **Step 4: Implement**

In `src/repo/sessions.ts`, replace these functions entirely:

```ts
export function createSession(db: Db, houseId: string, input: CreateSessionInput): Session {
  const id = newId();
  const t = now();
  db.transaction(() => {
    db.run(
      'INSERT INTO sessions (id, created_at, updated_at, deleted_at, date, title, default_buyin_cents, notes, house_id, dirty) VALUES (?, ?, ?, NULL, ?, ?, ?, NULL, ?, 1)',
      [id, t, t, input.date, input.title, input.defaultBuyinCents, houseId],
    );
    input.playerIds.forEach((pid, i) => insertSessionPlayer(db, id, pid, i, t));
  });
  return { id, createdAt: t, updatedAt: t, deletedAt: null, date: input.date, title: input.title, defaultBuyinCents: input.defaultBuyinCents, notes: null };
}

function insertSessionPlayer(db: Db, sessionId: string, playerId: string, sortOrder: number, t: number): SessionPlayer {
  const id = newId();
  db.run(
    'INSERT INTO session_players (id, created_at, updated_at, deleted_at, session_id, player_id, cashout_cents, sort_order, house_id, dirty) VALUES (?, ?, ?, NULL, ?, ?, NULL, ?, (SELECT house_id FROM sessions WHERE id = ?), 1)',
    [id, t, t, sessionId, playerId, sortOrder, sessionId],
  );
  return { id, createdAt: t, updatedAt: t, deletedAt: null, sessionId, playerId, cashoutCents: null, sortOrder };
}

export function updateSession(
  db: Db,
  id: string,
  patch: Partial<Pick<Session, 'date' | 'title' | 'defaultBuyinCents' | 'notes'>>,
): void {
  const cur = getSession(db, id);
  if (!cur) throw new Error('Session not found');
  const next = { ...cur, ...patch };
  db.run(
    'UPDATE sessions SET date = ?, title = ?, default_buyin_cents = ?, notes = ?, updated_at = ?, dirty = 1 WHERE id = ? AND deleted_at IS NULL',
    [next.date, next.title, next.defaultBuyinCents, next.notes, now(), id],
  );
}

export function deleteSession(db: Db, id: string): void {
  const t = now();
  db.transaction(() => {
    db.run(
      'UPDATE buyins SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE deleted_at IS NULL AND session_player_id IN (SELECT id FROM session_players WHERE session_id = ?)',
      [t, t, id],
    );
    db.run('UPDATE session_players SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE deleted_at IS NULL AND session_id = ?', [t, t, id]);
    db.run('UPDATE payments SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE deleted_at IS NULL AND session_id = ?', [t, t, id]);
    db.run('UPDATE sessions SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE id = ? AND deleted_at IS NULL', [t, t, id]);
  });
}

/** Every non-deleted session in the house with full detail, oldest first (history/graphs). */
export function listSessionDetails(db: Db, houseId: string): SessionDetail[] {
  return db
    .all<Record<string, unknown>>(
      `SELECT ${S_COLS} FROM sessions WHERE deleted_at IS NULL AND house_id = ? ORDER BY date ASC, created_at ASC`,
      [houseId],
    )
    .map((r) => mapRow<Session>(r))
    .map((session) => getSessionDetail(db, session.id)!);
}

export function listSessionSummaries(db: Db, houseId: string): SessionSummary[] {
  const sessions = db
    .all<Record<string, unknown>>(
      `SELECT ${S_COLS} FROM sessions WHERE deleted_at IS NULL AND house_id = ? ORDER BY date DESC, created_at DESC`,
      [houseId],
    )
    .map((r) => mapRow<Session>(r));
  return sessions.map((session) => {
    const detail = getSessionDetail(db, session.id)!;
    const rows = computeRows(detail);
    let topWinner: SessionSummary['topWinner'] = null;
    let totalBuyinCents = 0;
    for (const r of rows) {
      totalBuyinCents += r.buyinCents;
      if (r.netCents !== null && r.netCents > 0 && (!topWinner || r.netCents > topWinner.netCents)) {
        topWinner = { name: r.name, netCents: r.netCents };
      }
    }
    return { session, playerCount: rows.length, totalBuyinCents, topWinner };
  });
}

export function removePlayerFromSession(db: Db, sessionPlayerId: string): void {
  const t = now();
  db.transaction(() => {
    db.run('UPDATE buyins SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE deleted_at IS NULL AND session_player_id = ?', [t, t, sessionPlayerId]);
    db.run('UPDATE session_players SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE id = ? AND deleted_at IS NULL', [t, t, sessionPlayerId]);
  });
}

export function setCashout(db: Db, sessionPlayerId: string, cents: number | null): void {
  if (cents !== null && (!Number.isInteger(cents) || cents < 0)) throw new Error('Amount must be non-negative');
  db.run('UPDATE session_players SET cashout_cents = ?, updated_at = ?, dirty = 1 WHERE id = ? AND deleted_at IS NULL', [cents, now(), sessionPlayerId]);
}

export function addBuyin(db: Db, sessionPlayerId: string, amountCents: number): Buyin {
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error('Amount must be positive');
  const id = newId();
  const t = now();
  db.run(
    'INSERT INTO buyins (id, created_at, updated_at, deleted_at, session_player_id, amount_cents, at, house_id, dirty) VALUES (?, ?, ?, NULL, ?, ?, ?, (SELECT house_id FROM session_players WHERE id = ?), 1)',
    [id, t, t, sessionPlayerId, amountCents, t, sessionPlayerId],
  );
  return { id, createdAt: t, updatedAt: t, deletedAt: null, sessionPlayerId, amountCents, at: t };
}

export function updateBuyin(db: Db, buyinId: string, amountCents: number): void {
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error('Amount must be positive');
  db.run('UPDATE buyins SET amount_cents = ?, updated_at = ?, dirty = 1 WHERE id = ? AND deleted_at IS NULL', [amountCents, now(), buyinId]);
}

export function removeBuyin(db: Db, buyinId: string): void {
  const t = now();
  db.run('UPDATE buyins SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE id = ? AND deleted_at IS NULL', [t, t, buyinId]);
}

export function removePayment(db: Db, paymentId: string): void {
  const t = now();
  db.run('UPDATE payments SET deleted_at = ?, updated_at = ?, dirty = 1 WHERE id = ? AND deleted_at IS NULL', [t, t, paymentId]);
}

export function lastSessionPlayerIds(db: Db, houseId: string): string[] {
  const last = db.first<{ id: string }>(
    'SELECT id FROM sessions WHERE deleted_at IS NULL AND house_id = ? ORDER BY date DESC, created_at DESC LIMIT 1',
    [houseId],
  );
  if (!last) return [];
  return db
    .all<{ player_id: string }>('SELECT player_id FROM session_players WHERE session_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC', [last.id])
    .map((r) => r.player_id);
}
```

In `addPayment`, change only the SQL and params:

```ts
  db.run(
    'INSERT INTO payments (id, created_at, updated_at, deleted_at, session_id, from_player_id, to_player_id, amount_cents, note, at, house_id, dirty) VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, (SELECT house_id FROM sessions WHERE id = ?), 1)',
    [id, t, t, sessionId, input.fromPlayerId, input.toPlayerId, input.amountCents, note, t, sessionId],
  );
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx jest src/repo`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/repo/sessions.ts src/repo/sessions.test.ts
git commit -m "feat(repo): scope sessions to a house; children inherit house_id; writes dirty

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Currency comes from the current house

**Files:**
- Modify: `src/repo/settings.ts`
- Test: `src/repo/settings.test.ts`

**Interfaces:**
- Consumes: `getCurrentHouseId`, `setHouseCurrency`, `setCurrentHouse`, `createHouse` (Task 2).
- Produces: `getSettings(db)` returns `{ defaultBuyinCents, currencySymbol }` with `currencySymbol` from the current house; `updateSettings(db, { currencySymbol })` writes to the current house. Signatures unchanged, so every screen that reads `settings.currencySymbol` keeps working.

- [ ] **Step 1: Write the failing test**

Add to the `describe('settings', ...)` block in `src/repo/settings.test.ts`, and add `import { createHouse, setCurrentHouse } from './houses';` to the imports:

```ts
  it('currency follows the current house', () => {
    const db = createTestDb();
    const work = createHouse(db, { name: 'Work', currencySymbol: '€' });
    expect(getSettings(db).currencySymbol).toBe('$');
    setCurrentHouse(db, work.id);
    expect(getSettings(db)).toEqual({ defaultBuyinCents: 2000, currencySymbol: '€' });
    updateSettings(db, { currencySymbol: '¥' });
    expect(db.first<{ currency_symbol: string }>('SELECT currency_symbol FROM houses WHERE id = ?', [work.id])?.currency_symbol).toBe('¥');
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx jest src/repo/settings.test.ts`
Expected: FAIL (currency stays `$`).

- [ ] **Step 3: Implement**

In `src/repo/settings.ts`, add `import { getCurrentHouseId, setHouseCurrency } from './houses';` and replace `getSettings` and `updateSettings`:

```ts
export function getSettings(db: Db): Settings {
  const row = db.first<{ default_buyin_cents: number; currency_symbol: string }>(
    "SELECT s.default_buyin_cents, h.currency_symbol FROM settings s JOIN houses h ON h.id = s.current_house_id WHERE s.id = 'default'",
  );
  if (!row) throw new Error('Settings row missing');
  return { defaultBuyinCents: row.default_buyin_cents, currencySymbol: row.currency_symbol };
}

/** Default buy-in is device-wide; currency belongs to the current house. */
export function updateSettings(db: Db, patch: Partial<Settings>): Settings {
  db.transaction(() => {
    if (patch.defaultBuyinCents !== undefined) {
      db.run("UPDATE settings SET default_buyin_cents = ? WHERE id = 'default'", [patch.defaultBuyinCents]);
    }
    if (patch.currencySymbol !== undefined) setHouseCurrency(db, getCurrentHouseId(db), patch.currencySymbol);
  });
  return getSettings(db);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest src/repo`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/repo/settings.ts src/repo/settings.test.ts
git commit -m "feat(repo): currency comes from the current house

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Stores: houses state, house actions, reader selector

**Files:**
- Create: `src/store/useHousesStore.ts`
- Create: `src/store/houseActions.ts`
- Modify: `src/store/usePlayersStore.ts`
- Modify: `src/store/useSessionsStore.ts`
- Modify: `src/app/_layout.tsx`
- Test: `src/store/stores.test.ts`

**Interfaces:**
- Consumes: everything in Tasks 2–5.
- Produces:
  - `useHousesStore` with state `{ houses: House[]; currentHouseId: string | null; previewAsReader: boolean; load(): void; setPreviewAsReader(on: boolean): void }`
  - `selectCurrentHouse(s: HousesState): House | null`, `selectCanEdit(s: HousesState): boolean`
  - hooks `useCurrentHouse(): House | null`, `useCanEdit(): boolean`
  - `src/store/houseActions.ts`: `reloadAll(): void`, `switchHouse(id: string): void`, `createHouse(input: { name: string; currencySymbol: string }): House` (also makes it current), `renameHouse(id: string, name: string): void`, `setHouseCurrency(id: string, symbol: string): void`, `deleteHouse(id: string): void`.

- [ ] **Step 1: Write the failing tests**

In `src/store/stores.test.ts`, add imports:

```ts
import { useHousesStore, selectCanEdit } from './useHousesStore';
import { createHouse, deleteHouse, reloadAll, switchHouse } from './houseActions';
```

Add at the end of `beforeEach` (after the existing `setState` resets, so they do not wipe what `reloadAll` loads):

```ts
  useHousesStore.setState({ houses: [], currentHouseId: null, previewAsReader: false });
  reloadAll();
```

Append:

```ts
describe('houses', () => {
  it('reloadAll loads My House as current', () => {
    const s = useHousesStore.getState();
    expect(s.houses.map((h) => h.name)).toEqual(['My House']);
    expect(s.currentHouseId).toBe(s.houses[0].id);
  });

  it('createHouse makes the new house current and scopes players, nights and currency', () => {
    usePlayersStore.getState().add('Ann');
    const ann = usePlayersStore.getState().players[0];
    useSessionsStore.getState().create({ date: '2026-09-16', title: null, defaultBuyinCents: 2000, playerIds: [ann.id] });
    const home = useHousesStore.getState().currentHouseId!;

    const work = createHouse({ name: 'Work', currencySymbol: '€' });
    expect(useHousesStore.getState().currentHouseId).toBe(work.id);
    expect(usePlayersStore.getState().players).toEqual([]);
    expect(useSessionsStore.getState().summaries).toEqual([]);
    expect(useSettingsStore.getState().settings.currencySymbol).toBe('€');

    switchHouse(home);
    expect(usePlayersStore.getState().players.map((p) => p.name)).toEqual(['Ann']);
    expect(useSessionsStore.getState().summaries).toHaveLength(1);
    expect(useSettingsStore.getState().settings.currencySymbol).toBe('$');
  });

  it('switching closes any open night', () => {
    const ann = usePlayersStore.getState().add('Ann');
    const s = useSessionsStore.getState().create({ date: '2026-09-16', title: null, defaultBuyinCents: 2000, playerIds: [ann.id] });
    useSessionsStore.getState().open(s.id);
    createHouse({ name: 'Work', currencySymbol: '$' });
    expect(useSessionsStore.getState().detail).toBeNull();
  });

  it('deleteHouse falls back to another house', () => {
    const home = useHousesStore.getState().currentHouseId!;
    const work = createHouse({ name: 'Work', currencySymbol: '$' });
    deleteHouse(work.id);
    expect(useHousesStore.getState().currentHouseId).toBe(home);
    expect(useHousesStore.getState().houses).toHaveLength(1);
  });

  it('selectCanEdit: owners edit, readers and reader-preview do not', () => {
    const owner = useHousesStore.getState();
    expect(selectCanEdit(owner)).toBe(true);
    expect(selectCanEdit({ ...owner, previewAsReader: true })).toBe(false);
    const readerHouses = owner.houses.map((h) => ({ ...h, role: 'reader' as const }));
    expect(selectCanEdit({ ...owner, houses: readerHouses })).toBe(false);
    expect(selectCanEdit({ ...owner, currentHouseId: null })).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest src/store`
Expected: FAIL (`Cannot find module './useHousesStore'`).

- [ ] **Step 3: Create the houses store**

`src/store/useHousesStore.ts`:

```ts
import { create } from 'zustand';
import { getDb } from '@/db/connection';
import type { House } from '@/domain/types';
import * as repo from '@/repo/houses';

export interface HousesState {
  houses: House[];
  currentHouseId: string | null;
  /** Dev aid: show the current house the way a reader sees it. Never persisted. */
  previewAsReader: boolean;
  load(): void;
  setPreviewAsReader(on: boolean): void;
}

export const useHousesStore = create<HousesState>((set) => ({
  houses: [],
  currentHouseId: null,
  previewAsReader: false,
  load: () => {
    const db = getDb();
    set({ houses: repo.listHouses(db), currentHouseId: repo.getCurrentHouseId(db) });
  },
  setPreviewAsReader: (on) => set({ previewAsReader: on }),
}));

export function selectCurrentHouse(s: HousesState): House | null {
  return s.houses.find((h) => h.id === s.currentHouseId) ?? null;
}

/** UX gate only. Once houses sync, the server enforces who may write. */
export function selectCanEdit(s: HousesState): boolean {
  return selectCurrentHouse(s)?.role === 'owner' && !s.previewAsReader;
}

export const useCurrentHouse = () => useHousesStore(selectCurrentHouse);
export const useCanEdit = () => useHousesStore(selectCanEdit);
```

- [ ] **Step 4: Scope the players and sessions stores**

In `src/store/usePlayersStore.ts` add `import { getCurrentHouseId } from '@/repo/houses';` and change the two house-aware calls:

```ts
  const reload = () => {
    const db = getDb();
    set({ players: repo.listPlayers(db, getCurrentHouseId(db), { includeArchived: true }) });
  };
```

```ts
    add: (name) => {
      const db = getDb();
      const p = repo.createPlayer(db, getCurrentHouseId(db), name);
      reload();
      return p;
    },
```

In `src/store/useSessionsStore.ts` add `import { getCurrentHouseId } from '@/repo/houses';` and change:

```ts
  const loadSummaries = () => {
    const db = getDb();
    const houseId = getCurrentHouseId(db);
    set({
      summaries: repo.listSessionSummaries(db, houseId),
      playerColors: playerColors(buildHistory(repo.listSessionDetails(db, houseId))),
    });
  };
```

```ts
    create: (input) => {
      const db = getDb();
      const s = repo.createSession(db, getCurrentHouseId(db), input);
      loadSummaries();
      return s;
    },
```

```ts
    listDetails: () => {
      const db = getDb();
      return repo.listSessionDetails(db, getCurrentHouseId(db));
    },
    lastPlayerIds: () => {
      const db = getDb();
      return repo.lastSessionPlayerIds(db, getCurrentHouseId(db));
    },
```

- [ ] **Step 5: Create the house actions**

`src/store/houseActions.ts`:

```ts
import { getDb } from '@/db/connection';
import type { House } from '@/domain/types';
import * as repo from '@/repo/houses';
import { useHousesStore } from './useHousesStore';
import { useSettingsStore } from './useSettingsStore';
import { usePlayersStore } from './usePlayersStore';
import { useSessionsStore } from './useSessionsStore';

/** Reload every house-scoped store. Call after anything that changes which house is current or its currency. */
export function reloadAll(): void {
  useHousesStore.getState().load();
  useSettingsStore.getState().load();
  usePlayersStore.getState().load();
  useSessionsStore.setState({ detail: null });
  useSessionsStore.getState().loadSummaries();
}

export function switchHouse(id: string): void {
  repo.setCurrentHouse(getDb(), id);
  reloadAll();
}

export function createHouse(input: { name: string; currencySymbol: string }): House {
  const db = getDb();
  const house = repo.createHouse(db, input);
  repo.setCurrentHouse(db, house.id);
  reloadAll();
  return house;
}

export function renameHouse(id: string, name: string): void {
  repo.renameHouse(getDb(), id, name);
  useHousesStore.getState().load();
}

export function setHouseCurrency(id: string, symbol: string): void {
  repo.setHouseCurrency(getDb(), id, symbol);
  reloadAll();
}

export function deleteHouse(id: string): void {
  repo.deleteHouse(getDb(), id);
  reloadAll();
}
```

- [ ] **Step 6: Boot through reloadAll**

In `src/app/_layout.tsx`, replace the three imports of `usePlayersStore`, `useSettingsStore`, `useSessionsStore` with `import { reloadAll } from '@/store/houseActions';`, and inside the first `useEffect` replace the three `...getState().load...()` lines with `reloadAll();`.

- [ ] **Step 7: Run tests and type-check**

Run: `npx jest && npx tsc --noEmit`
Expected: all tests PASS; no type errors.

- [ ] **Step 8: Commit**

```bash
git add src/store src/app/_layout.tsx
git commit -m "feat(store): houses store, house actions, canEdit selector; stores follow current house

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: House bar and switcher sheet

**Files:**
- Create: `src/components/HouseSwitcherSheet.tsx`
- Create: `src/components/HouseBar.tsx`
- Modify: `src/app/(tabs)/index.tsx`
- Modify: `src/app/(tabs)/history.tsx`

**Interfaces:**
- Consumes: `useHousesStore`, `useCurrentHouse` (Task 6), `switchHouse` (Task 6), `Button`, `Divider`, `Overline`, `Pill`, `toastError` from `@/components/ui`.
- Produces: `<HouseBar style?: StyleProp<ViewStyle> />`, `<HouseSwitcherSheet visible onClose />`. Routes pushed: `/houses/new`, `/houses/<id>` (built in Task 8).

- [ ] **Step 1: Read the Expo Router docs for `useRouter` in SDK 57**

Open https://docs.expo.dev/versions/v57.0.0/sdk/router/ and confirm `router.push` accepts a string path. No code change if it does.

- [ ] **Step 2: Create the switcher sheet**

`src/components/HouseSwitcherSheet.tsx` (same Modal + scrim + sheet pattern as `AddPlayerSheet` in `src/app/session/[id]/index.tsx`):

```tsx
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Divider, Overline, Pill, toastError } from '@/components/ui';
import { useHousesStore } from '@/store/useHousesStore';
import { switchHouse } from '@/store/houseActions';
import { colors, radius, space, textStyles } from '@/theme';

export function HouseSwitcherSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();
  const houses = useHousesStore((s) => s.houses);
  const currentId = useHousesStore((s) => s.currentHouseId);

  const pick = (id: string) => {
    try {
      if (id !== currentId) switchHouse(id);
      onClose();
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.scrim} onPress={onClose} accessibilityLabel="Dismiss" />
      <View style={s.sheet}>
        <Overline style={{ marginBottom: space.md }}>Houses</Overline>
        <View style={s.list}>
          {houses.map((h, i) => (
            <View key={h.id}>
              {i > 0 ? <Divider /> : null}
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: h.id === currentId }}
                onPress={() => pick(h.id)}
                style={({ pressed }) => [s.row, pressed && { backgroundColor: colors.cardAlt }]}>
                <Text style={[s.name, h.id === currentId && { color: colors.accent }]} numberOfLines={1}>
                  {h.name}
                </Text>
                <View style={{ flex: 1 }} />
                <Pill label={h.role === 'owner' ? 'Owner' : 'Viewing'} tone={h.role === 'owner' ? 'default' : 'muted'} />
              </Pressable>
            </View>
          ))}
        </View>
        {currentId ? (
          <Button
            label="House settings"
            variant="secondary"
            size="md"
            onPress={() => {
              onClose();
              router.push(`/houses/${currentId}`);
            }}
            style={{ marginTop: space.md }}
          />
        ) : null}
        <Button
          label="+ New house"
          variant="secondary"
          size="md"
          onPress={() => {
            onClose();
            router.push('/houses/new');
          }}
          style={{ marginTop: space.sm }}
        />
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: 1,
    borderTopColor: colors.borderStrong,
    padding: space.lg,
    paddingBottom: space.xxl,
    maxHeight: '80%',
  },
  list: { backgroundColor: colors.cardAlt, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, paddingVertical: space.md },
  name: { ...textStyles.bodyLg, color: colors.text, flexShrink: 1 },
});
```

- [ ] **Step 3: Create the house bar**

`src/components/HouseBar.tsx`:

```tsx
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { Pill } from '@/components/ui';
import { HouseSwitcherSheet } from '@/components/HouseSwitcherSheet';
import { useCurrentHouse, useHousesStore } from '@/store/useHousesStore';
import { colors, space, textStyles } from '@/theme';

/** Current house name + role. Tap to switch houses. */
export function HouseBar({ style }: { style?: StyleProp<ViewStyle> }) {
  const house = useCurrentHouse();
  const preview = useHousesStore((s) => s.previewAsReader);
  const [open, setOpen] = useState(false);
  if (!house) return null;
  const viewing = house.role !== 'owner' || preview;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`House ${house.name}. Switch house`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [s.bar, pressed && { opacity: 0.7 }, style]}>
        <Text style={s.name} numberOfLines={1}>
          {house.name} ▾
        </Text>
        <Pill label={viewing ? 'Viewing' : 'Owner'} tone={viewing ? 'muted' : 'default'} style={{ marginLeft: space.sm }} />
      </Pressable>
      <HouseSwitcherSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

const s = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start' },
  name: { ...textStyles.bodyLg, color: colors.text, flexShrink: 1 },
});
```

- [ ] **Step 4: Place the bar on Home and History**

`src/app/(tabs)/index.tsx`: add `import { HouseBar } from '@/components/HouseBar';` and insert directly after the closing `</Row>` of the header row:

```tsx
      <HouseBar style={{ marginBottom: space.lg }} />
```

`src/app/(tabs)/history.tsx`: add the same import, and in both returns insert directly after `<Headline style={s.title}>History</Headline>`:

```tsx
        <HouseBar style={{ marginBottom: space.md }} />
```

(Indent to match: the empty-state return is one level deeper.)

- [ ] **Step 5: Type-check and test**

Run: `npx tsc --noEmit && npx jest`
Expected: PASS. (Typed routes are off; `app.json` experiments only set `reactCompiler`, so pushing `/houses/...` before Task 8 creates those routes type-checks.)

- [ ] **Step 6: Commit**

```bash
git add src/components/HouseBar.tsx src/components/HouseSwitcherSheet.tsx "src/app/(tabs)/index.tsx" "src/app/(tabs)/history.tsx"
git commit -m "feat(app): house bar and switcher sheet on Home and History

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: New-house and house-settings screens

**Files:**
- Create: `src/app/houses/new.tsx`
- Create: `src/app/houses/[id].tsx`

**Interfaces:**
- Consumes: `createHouse`, `renameHouse`, `setHouseCurrency`, `deleteHouse` (Task 6 `houseActions`); `useHousesStore` (Task 6); `Body`, `Button`, `Caption`, `NavHeader`, `Overline`, `Row`, `Screen`, `toastError` from `@/components/ui`.
- Produces: routes `/houses/new` and `/houses/[id]`.

- [ ] **Step 1: Create the new-house screen**

`src/app/houses/new.tsx`:

```tsx
import React, { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { Button, Caption, NavHeader, Overline, Screen, toastError } from '@/components/ui';
import { createHouse } from '@/store/houseActions';
import { colors, radius, space, textStyles } from '@/theme';

export default function NewHouseScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('$');

  const save = () => {
    try {
      createHouse({ name, currencySymbol: currency });
      router.back();
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <Screen scroll>
      <NavHeader title="New house" onBack={() => router.back()} />
      <Overline style={{ marginBottom: space.sm }}>Name</Overline>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="e.g. Tuesday Crew"
        placeholderTextColor={colors.textMuted}
        style={s.input}
        autoFocus
        returnKeyType="done"
      />
      <Overline style={{ marginTop: space.lg, marginBottom: space.sm }}>Currency symbol</Overline>
      <TextInput value={currency} onChangeText={setCurrency} style={[s.input, { width: 96 }]} maxLength={3} autoCapitalize="none" />
      <Caption tone="muted" style={{ marginTop: space.sm }}>
        Players and nights belong to one house. Your chip set and default buy-in apply to every house.
      </Caption>
      <Button label="Create house" onPress={save} style={{ marginTop: space.xl }} />
    </Screen>
  );
}

const s = StyleSheet.create({
  input: {
    ...textStyles.bodyLg,
    color: colors.text,
    backgroundColor: colors.cardAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
});
```

- [ ] **Step 2: Create the house settings screen**

`src/app/houses/[id].tsx`:

```tsx
import React, { useState } from 'react';
import { Alert, StyleSheet, Switch, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Body, Button, Caption, NavHeader, Overline, Row, Screen, toastError } from '@/components/ui';
import { useHousesStore } from '@/store/useHousesStore';
import { deleteHouse, renameHouse, setHouseCurrency } from '@/store/houseActions';
import { colors, radius, space, textStyles } from '@/theme';

export default function HouseSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const house = useHousesStore((s) => s.houses.find((h) => h.id === id) ?? null);
  const houseCount = useHousesStore((s) => s.houses.length);
  const preview = useHousesStore((s) => s.previewAsReader);
  const setPreview = useHousesStore((s) => s.setPreviewAsReader);
  const [name, setName] = useState(house?.name ?? '');
  const [currency, setCurrency] = useState(house?.currencySymbol ?? '$');

  if (!house) {
    return (
      <Screen>
        <NavHeader title="House" onBack={() => router.back()} />
        <Body dim>This house no longer exists.</Body>
      </Screen>
    );
  }

  const changed = name.trim() !== house.name || currency.trim() !== house.currencySymbol;

  const save = () => {
    try {
      if (name.trim() !== house.name) renameHouse(house.id, name);
      if (currency.trim() !== house.currencySymbol) setHouseCurrency(house.id, currency);
    } catch (e) {
      toastError(e);
    }
  };

  const confirmDelete = () =>
    Alert.alert(`Delete "${house.name}"?`, 'Its players and nights are deleted too. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          try {
            deleteHouse(house.id);
            router.back();
          } catch (e) {
            toastError(e);
          }
        },
      },
    ]);

  return (
    <Screen scroll>
      <NavHeader title="House" onBack={() => router.back()} />

      <Overline style={{ marginBottom: space.sm }}>Name</Overline>
      <TextInput value={name} onChangeText={setName} style={s.input} returnKeyType="done" />

      <Overline style={{ marginTop: space.lg, marginBottom: space.sm }}>Currency symbol</Overline>
      <TextInput value={currency} onChangeText={setCurrency} style={[s.input, { width: 96 }]} maxLength={3} autoCapitalize="none" />

      <Button label="Save" size="md" onPress={save} disabled={!changed} style={{ marginTop: space.lg }} />

      {__DEV__ ? (
        <Row style={{ marginTop: space.xl }}>
          <Body style={{ flex: 1 }}>Preview as reader</Body>
          <Switch value={preview} onValueChange={setPreview} trackColor={{ true: colors.accent }} />
        </Row>
      ) : null}

      <Button
        label="Delete house"
        variant="danger"
        size="md"
        onPress={confirmDelete}
        disabled={houseCount <= 1}
        style={{ marginTop: space.xxl }}
      />
      {houseCount <= 1 ? (
        <Caption tone="muted" style={{ marginTop: space.sm }}>
          You need at least one house. Create another before deleting this one.
        </Caption>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  input: {
    ...textStyles.bodyLg,
    color: colors.text,
    backgroundColor: colors.cardAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
});
```

- [ ] **Step 3: Type-check, test, bundle**

Run: `npx tsc --noEmit && npx jest && npx expo export --platform ios --output-dir /tmp/chips-export-check`
Expected: all PASS; export completes. Then `rm -rf /tmp/chips-export-check`.

- [ ] **Step 4: Commit**

```bash
git add src/app/houses
git commit -m "feat(app): new-house and house settings screens

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Reader mode

**Files:**
- Create: `src/components/EditorOnly.tsx`
- Modify: `src/app/session/[id]/index.tsx`
- Modify: `src/app/new-session/index.tsx`
- Modify: `src/app/players.tsx`
- Modify: `src/app/(tabs)/index.tsx`
- Modify: `src/app/(tabs)/history.tsx`
- Modify: `src/app/session/[id]/settle.tsx`
- Modify: `src/components/PaymentRow.tsx`

**Interfaces:**
- Consumes: `useCanEdit()` (Task 6).
- Produces: `<EditorOnly fallback={Href}>{children}</EditorOnly>`.

Reader behaviour (spec §4): readers never reach the live table, new-night flow or players screen; tapping a night opens its settle screen; they can still share the image, copy text, open History and player pages. They cannot log, mark or delete payments.

- [ ] **Step 1: Read the Redirect docs**

Open https://docs.expo.dev/versions/v57.0.0/sdk/router/ and confirm `Redirect` and the `Href` type are exported from `expo-router` in SDK 57 (the installed build exports `Redirect` via `build/link/Link.d.ts`).

- [ ] **Step 2: Create the guard**

`src/components/EditorOnly.tsx`:

```tsx
import React from 'react';
import { Redirect, type Href } from 'expo-router';
import { useCanEdit } from '@/store/useHousesStore';

/** Renders children for the house owner; sends readers to `fallback`. UX only: the server enforces permissions. */
export function EditorOnly({ fallback, children }: { fallback: Href; children: React.ReactNode }) {
  const canEdit = useCanEdit();
  return canEdit ? <>{children}</> : <Redirect href={fallback} />;
}
```

- [ ] **Step 3: Guard the three edit screens**

`src/app/session/[id]/index.tsx`: rename `export default function SessionScreen()` to `function SessionEditor()`, add `import { EditorOnly } from '@/components/EditorOnly';`, and add above it:

```tsx
export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <EditorOnly fallback={`/session/${id}/settle`}>
      <SessionEditor />
    </EditorOnly>
  );
}
```

`src/app/new-session/index.tsx`: rename `export default function NewSessionStep1()` to `function NewSessionStep1()`, add the `EditorOnly` import, and add:

```tsx
export default function NewSessionScreen() {
  return (
    <EditorOnly fallback="/">
      <NewSessionStep1 />
    </EditorOnly>
  );
}
```

`src/app/players.tsx`: rename `export default function PlayersScreen()` to `function PlayersEditor()`, add the import, and add:

```tsx
export default function PlayersScreen() {
  return (
    <EditorOnly fallback="/">
      <PlayersEditor />
    </EditorOnly>
  );
}
```

- [ ] **Step 4: Home**

In `src/app/(tabs)/index.tsx` add `import { useCanEdit } from '@/store/useHousesStore';` and `const canEdit = useCanEdit();` below the other hooks. Then:

1. In `onLongPress`, build the buttons conditionally:

```tsx
  const onLongPress = (id: string, title: string) => {
    const share = { text: 'Share', onPress: () => router.push(`/session/${id}/settle?share=1`) };
    const cancel = { text: 'Cancel', style: 'cancel' as const };
    if (!canEdit) {
      Alert.alert(title, undefined, [share, cancel]);
      return;
    }
    Alert.alert(title, undefined, [
      share,
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Delete this night?', 'This cannot be undone.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: () => {
                try {
                  deleteSession(id);
                } catch (e) {
                  toastError(e);
                }
              },
            },
          ]),
      },
      cancel,
    ]);
  };
```

2. Wrap the Players `IconButton` and the spacer `View` after it: `{canEdit ? (<>…</>) : null}`.
3. Wrap the whole "Ready to deal?" `<Card>…</Card>` in `{canEdit ? (…) : null}`.
4. Change the footer caption text to `{canEdit ? 'Long-press a night to share or delete it.' : 'Long-press a night to share it.'}`.

- [ ] **Step 5: History empty state**

In `src/app/(tabs)/history.tsx` add `import { useCanEdit } from '@/store/useHousesStore';`, call `const canEdit = useCanEdit();` with the other hooks (before the early return), and wrap the empty-state `<Button label="Start New Night" … />` in `{canEdit ? (…) : null}`.

- [ ] **Step 6: Settle screen and payment rows**

`src/components/PaymentRow.tsx`: change the prop type to `onDelete?: () => void;`, and on the `Pressable` set `onLongPress={onDelete ? confirmDelete : undefined}` and `accessibilityLabel={onDelete ? `${fromName} paid ${toName}. Long-press to delete` : `${fromName} paid ${toName}`}`.

`src/app/session/[id]/settle.tsx`: add `import { useCanEdit } from '@/store/useHousesStore';` and `const canEdit = useCanEdit();` with the other hooks. Then:

1. `PaymentRow`: `onDelete={canEdit ? () => removePaymentSafe(p.id) : undefined}`.
2. Wrap the `+ Log a payment` `<Button … />` in `{canEdit ? (…) : null}`.
3. `TransferRow`: `onMarkPaid={canEdit ? () => markPaid(t) : undefined}` (the prop is already optional).

- [ ] **Step 7: Type-check, test, bundle**

Run: `npx tsc --noEmit && npx jest && npx expo export --platform ios --output-dir /tmp/chips-export-check && rm -rf /tmp/chips-export-check`
Expected: all PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/EditorOnly.tsx src/components/PaymentRow.tsx src/app
git commit -m "feat(app): reader mode hides editing and routes nights to results

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Final verification and device checklist

**Files:** none edited (unless a check fails).

- [ ] **Step 1: Full checks**

Run: `npx tsc --noEmit && npx jest && npx expo export --platform ios --output-dir /tmp/chips-export-check && rm -rf /tmp/chips-export-check`
Expected: all PASS; test count is Task 0's baseline plus the new tests.

- [ ] **Step 2: Confirm no stray lint config**

Run: `git status --short`
Expected: clean. If `eslint.config.js` exists, delete it.

- [ ] **Step 3: Hand Steven the device checklist**

Steven runs `npx expo start` and opens the app in Expo Go on a phone that already has his real data:

1. App opens on Home showing **My House ▾ · Owner**; the 4 existing nights, totals, History graph and player pages look exactly as before.
2. Settle screen shows the same currency as before.
3. House bar → **+ New house** → "Test", `€` → lands on an empty Home for "Test"; History empty; new night uses `€`.
4. Add a player named the same as one in My House → allowed.
5. Switch back to My House → original data, `$`.
6. House settings for "Test" → rename → bar updates. **Preview as reader** on → Home hides Start New Night and the Players button, long-press shows only Share, tapping a night opens results (no live table), no "+ Log a payment" or "Mark paid". Turn it off.
7. Delete "Test" → back to My House; delete button disabled when only one house remains.
8. Kill and reopen the app → still on the last chosen house.

- [ ] **Step 4: Report**

Tell Steven which checks passed locally and that the device checklist is his to run. Next plan: phase 2 (Supabase schema, RLS, RPCs).
