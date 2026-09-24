# Shared houses phase 3: share, join by code, push/pull, sync status — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An owner can publish a house to Supabase and keep it pushed; a friend can join it with the code and password and read an up-to-date copy; both see a one-line sync status.

**Architecture:**
- **Layers:**
  - `src/repo/sync.ts` is local SQLite bookkeeping (dirty rows, clean-marking, applying pulled rows, cursors). It is pure and tested with node:sqlite.
  - `src/sync/*` is the network side:
    - `remote.ts`: thin supabase-js calls.
    - `push.ts`, `pull.ts`, `publish.ts`, `join.ts`: orchestration that takes `(db, client, …)`.
    - `errors.ts`: user-facing messages.
    - `registry.ts`: holds the app's client.
    - `client.ts`: builds the client; app only, never imported by tests.
  - `src/store/syncActions.ts` wires it all into the app: debounced push, pull on open and on switching house, pull-to-refresh, UI actions.
- **Tests:** the network modules are proven by an integration test that runs two in-memory phones (owner and reader) against the local Supabase stack. It is skipped unless `CHIPS_SUPABASE_URL` is set.

**Tech Stack:** Expo SDK 57, expo-sqlite, zustand, `@supabase/supabase-js` v2 (session persisted via `expo-sqlite/localStorage/install`), `expo-secure-store` (owner's house password), Jest (jest-expo, node:sqlite), Supabase CLI local stack.

**Spec:** `docs/superpowers/specs/2026-09-23-shared-houses-sync-design.md` (§2.1–2.3, §2.6, §3, §4, §7). Server contract: `docs/superpowers/handoffs/2026-09-24-shared-houses-handoff.md` → "Phase 3 must know". Server SQL: `supabase/migrations/*.sql`.

## Global Constraints

- **Expo docs.** Read https://docs.expo.dev/versions/v57.0.0/ before writing Expo API code (AGENTS.md). This covers expo-secure-store, expo-sqlite localStorage and RefreshControl usage.
- **Install commands.** Install native or Expo packages with `npx expo install <pkg>` so versions match SDK 57.
- **Verification.** `npx jest`, `npx tsc --noEmit` and `npx expo export --platform ios --output-dir <tmp>` must pass at the end of every task. Delete the tmp dir afterwards.
  - Do not run `expo lint`. Delete `eslint.config.js` if it appears.
  - There is no simulator on this Mac.
- **Jest isolation.** Tests never import `src/sync/client.ts`. Stores never import `src/sync/*` or `syncActions`. Only `src/app/**`, `src/components/**` and `src/store/syncActions.ts` do. `src/store/stores.test.ts` must stay green.
- **Server contract** (from the handoff, verbatim):
  - Join RPCs return jsonb `{ok:true, house:{…}, role:'owner'|'reader'}` | `{ok:false, error:'invalid'}` | `{ok:false, error:'locked', minutes:N}`.
  - Other RPCs raise P0001 with `not_authenticated` / `forbidden` / `weak_password` / `house_deleted` / `owner_cannot_leave`.
  - `create_house(p_id, p_name, p_currency, p_password, p_display_name?)` returns `(join_code, invite_secret)` and is safe to retry.
  - `remove_member` returns the new invite secret.
- **Limits.** House name 1–60 characters, currency 1–8, display name 1–40, password ≥ 4 characters.
- **Pushing the house row.** `update houses` touching only `name`, `currency_symbol`, `updated_at`, `deleted_at`.
- **Pushing ledger rows.** Upsert in FK order `players → sessions → session_players → buyins → payments` (`LEDGER_TABLES` in `src/db/schema.ts` is already that order).
- **Pull cursor.** Keep `server_updated_at` as the exact text PostgREST returns, plus the last `id`. Page by `(server_updated_at, id)`. Start each pull 5 s before the saved cursor.
- **Secrets.** `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_KEY` come from `.env.local` (gitignored) for Expo Go and from EAS env for builds. Never put them in git.
- **Commits.** Every commit message ends with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Work on branch `feat/shared-houses-phase3`.
- **macOS.** `sed` does not expand `\n`; use `perl -pi -e`.

## Decisions made for this plan

1. **Network-regained trigger dropped.** It needs a new native module (NetInfo). Pushes retry on the next edit, on app foreground, on pull-to-refresh and on tapping the status line. A later phase can add NetInfo.
2. **Pull runs only for reader houses and for a house just joined.** Owners are the source of truth. New-phone recovery for owners is phase 5.
3. **Leaving or removal is a hard purge of the local copy.** Leave house, and a pull that finds no membership ("removed"), hard-delete that house's local rows. A server `deleted_at` marks the local house `closed`. It stays visible with "House closed" until the reader removes it (spec §7).
4. **Invite links and invite text are phase 4.** Phase 3 shows the join code and the saved password so the owner can pass them on by hand.
5. **Local schema v4** adds `houses.last_synced_at` and `houses.closed`. `houses.pull_cursor` (already there) stores a JSON map of per-table cursors.

## File Structure

| Path | Responsibility |
|---|---|
| `src/db/schema.ts` | + v4 migration (`last_synced_at`, `closed`) |
| `src/domain/types.ts` | `House` gains `lastSyncedAt`, `closed` |
| `src/repo/houses.ts` | Selects the new columns; name/currency length limits |
| `src/repo/sync.ts` (new) | `SYNC_COLUMNS`, dirty rows, `markClean`, `pendingCount`, `applyPulledRows`, sync-house bookkeeping, `purgeHouse`, `insertJoinedHouse` |
| `src/sync/cursor.ts` (new) | Per-table pull cursors: parse/serialize/overlap |
| `src/sync/errors.ts` (new) | Map network/PostgREST/RPC errors to `{kind, message}` |
| `src/sync/remote.ts` (new) | Every supabase-js call (auth, RPCs, selects, upserts) |
| `src/sync/push.ts`, `pull.ts`, `publish.ts`, `join.ts` (new) | Orchestration over `(db, client)` |
| `src/sync/registry.ts` (new) | `setSyncClient` / `getSyncClient` / `requireSyncClient` |
| `src/sync/client.ts` (new) | App-only client factory (env, localStorage, AppState refresh) |
| `src/sync/passwords.ts` (new) | Owner's house password in expo-secure-store |
| `src/sync/sync.integration.test.ts` (new) | Owner ↔ reader against the local stack |
| `scripts/test-sync.sh` (new) | Reads the local stack URL/key and runs the integration test |
| `src/domain/syncStatus.ts` (new) | Status line text/tone (pure) |
| `src/domain/joinCode.ts` (new) | Format/normalise join codes (pure) |
| `src/store/useSyncStore.ts` (new) | Per-house phase + pending count |
| `src/store/syncActions.ts` (new) | Debounced push, sync on open/switch/refresh, UI actions |
| `src/components/SyncStatusLine.tsx` (new) | Status line under the house bar |
| `src/components/HouseBar.tsx` | Shows `SyncStatusLine` |
| `src/components/HouseSwitcherSheet.tsx` | + "Join house" |
| `src/components/ui.tsx` | `Screen` gains `refreshing` / `onRefresh` |
| `src/app/houses/[id].tsx` | Share house, code, password, members, leave, closed |
| `src/app/houses/join.tsx` (new) | Join by code |
| `src/app/(tabs)/index.tsx`, `history.tsx` | Pull-to-refresh; Home empty state "Join a house" |
| `src/app/_layout.tsx` | Create client, `startSync()` |
| `supabase/config.toml` | Re-enable `[api]`; raise the local anonymous sign-in limit |
| `.env.example` (new) | Documents the two env vars (no values) |
| `jest.setup.ts` | Mock `expo-secure-store` |

---

### Task 1: Local sync bookkeeping (schema v4, repo/sync, cursors)

**Files:**
- Modify: `src/db/schema.ts`, `src/domain/types.ts`, `src/repo/houses.ts`
- Create: `src/repo/sync.ts`, `src/sync/cursor.ts`
- Test: `src/db/schema.test.ts`, `src/repo/houses.test.ts`, `src/repo/sync.test.ts` (new), `src/sync/cursor.test.ts` (new)

**Interfaces:**
- Produces, in `src/repo/sync.ts`:
  - `type SyncTable = (typeof LEDGER_TABLES)[number]`
  - `type SyncRow = Record<string, string | number | null>`
  - `SYNC_COLUMNS: Record<SyncTable, readonly string[]>`
  - `dirtyRows(db, table, houseId): SyncRow[]`
  - `markClean(db, table: SyncTable | 'houses', rows: { id: string; updated_at: number }[]): void`
  - `pendingCount(db, houseId): number`
  - `applyPulledRows(db, table, rows: SyncRow[]): void`
  - `interface SyncHouse { id; name; role: HouseRole; published: boolean; dirty: boolean; currencySymbol; updatedAt: number; deletedAt: number | null; joinCode: string | null; pullCursor: string | null; lastSyncedAt: number | null; closed: boolean }`
  - `listSyncHouses(db): SyncHouse[]`: published and (not deleted, or deleted but dirty).
  - `getSyncHouse(db, id): SyncHouse | null`: includes deleted.
  - `markPublished(db, id, joinCode)`
  - `dirtyAllInHouse(db, houseId)`
  - `setPullCursor(db, id, raw: string)`
  - `setLastSynced(db, id, t?: number)`
  - `interface ServerHouse { id: string; name: string; currency_symbol: string; join_code: string; created_at: number; updated_at: number; deleted_at: number | null }`
  - `insertJoinedHouse(db, h: ServerHouse, role: HouseRole): boolean`: true if inserted, false if it already existed.
  - `applyServerHouse(db, h: ServerHouse): void`
  - `purgeHouse(db, id): void`
- Produces, in `src/sync/cursor.ts`:
  - `interface TableCursor { ts: string; id: string }`
  - `type PullCursors = Partial<Record<SyncTable, TableCursor>>`
  - `ZERO_UUID`, `OVERLAP_MS = 5000`
  - `parseCursors(raw: string | null): PullCursors`
  - `serializeCursors(c: PullCursors): string`
  - `overlapStart(c: TableCursor | undefined): TableCursor`
- `House` gains `lastSyncedAt: number | null` and `closed: boolean`.
- `createHouse`/`renameHouse`/`setHouseCurrency` throw `Name too long (60 max)` / `Currency too long (8 max)`.

- [ ] **Step 1: Branch**

```bash
git checkout -b feat/shared-houses-phase3
```

- [ ] **Step 2: Write the failing tests**

Append to `src/db/schema.test.ts` inside `describe('migrate', …)`:

```ts
  it('v4 adds sync bookkeeping to houses', () => {
    const db = createTestDb();
    const cols = db.all<{ name: string }>('PRAGMA table_info(houses)').map((c) => c.name);
    expect(cols).toEqual(expect.arrayContaining(['last_synced_at', 'closed', 'pull_cursor']));
    const h = db.first<{ closed: number; last_synced_at: number | null }>('SELECT closed, last_synced_at FROM houses');
    expect(h).toEqual({ closed: 0, last_synced_at: null });
  });
```

Append to `src/repo/houses.test.ts` inside `describe('houses repo', …)`:

```ts
  it('caps name and currency length to what the server accepts', () => {
    const db = createTestDb();
    expect(() => createHouse(db, { name: 'x'.repeat(61), currencySymbol: '$' })).toThrow('Name too long (60 max)');
    expect(() => createHouse(db, { name: 'Ok', currencySymbol: '123456789' })).toThrow('Currency too long (8 max)');
    const h = createHouse(db, { name: 'x'.repeat(60), currencySymbol: '12345678' });
    expect(h).toEqual(expect.objectContaining({ lastSyncedAt: null, closed: false }));
    expect(() => renameHouse(db, h.id, 'y'.repeat(61))).toThrow('Name too long (60 max)');
  });
```

Create `src/repo/sync.test.ts`:

```ts
import { createTestDb } from '../../test/nodeDb';
import type { Db } from '@/db/types';
import { createHouse, getCurrentHouseId, getHouse, listHouses } from './houses';
import { createPlayer, renamePlayer } from './players';
import { addBuyin, createSession } from './sessions';
import {
  SYNC_COLUMNS, applyPulledRows, applyServerHouse, dirtyAllInHouse, dirtyRows, getSyncHouse, insertJoinedHouse,
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
```

Create `src/sync/cursor.test.ts`:

```ts
import { OVERLAP_MS, ZERO_UUID, overlapStart, parseCursors, serializeCursors } from './cursor';

describe('pull cursors', () => {
  it('round-trips and tolerates junk', () => {
    const c = { players: { ts: '2026-09-24T12:00:00.123456+00:00', id: 'abc' } };
    expect(parseCursors(serializeCursors(c))).toEqual(c);
    expect(parseCursors(null)).toEqual({});
    expect(parseCursors('not json')).toEqual({});
    expect(parseCursors('[1,2]')).toEqual({});
  });

  it('starts from the beginning when there is no cursor', () => {
    expect(overlapStart(undefined)).toEqual({ ts: '1970-01-01T00:00:00.000Z', id: ZERO_UUID });
  });

  it('backs off OVERLAP_MS and handles microsecond timestamps', () => {
    const start = overlapStart({ ts: '2026-09-24T12:00:05.123456+00:00', id: 'last' });
    expect(OVERLAP_MS).toBe(5000);
    expect(start).toEqual({ ts: '2026-09-24T12:00:00.123Z', id: ZERO_UUID });
  });

  it('falls back to the beginning on an unparseable timestamp', () => {
    expect(overlapStart({ ts: 'garbage', id: 'x' })).toEqual({ ts: '1970-01-01T00:00:00.000Z', id: ZERO_UUID });
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `npx jest src/db/schema.test.ts src/repo/houses.test.ts src/repo/sync.test.ts src/sync/cursor.test.ts`
Expected: FAIL (`Cannot find module './sync'`, `./cursor`, missing columns, no length error).

- [ ] **Step 4: Schema v4**

In `src/db/schema.ts`, add after `v3Houses`:

```ts
/** v4: sync bookkeeping on houses. `pull_cursor` (v3) holds a JSON map of per-table cursors. */
function v4Sync(db: Db): void {
  addColumn(db, 'houses', 'last_synced_at', 'INTEGER');
  addColumn(db, 'houses', 'closed', 'INTEGER NOT NULL DEFAULT 0');
}
```

and append `v4Sync,` to `MIGRATIONS` after `v3Houses` (with a `// v4` comment like the others).

- [ ] **Step 5: House type and houses repo**

In `src/domain/types.ts`, extend `House`:

```ts
export interface House extends BaseRow {
  name: string;
  role: HouseRole;
  joinCode: string | null;
  currencySymbol: string;
  published: boolean;
  /** Local clock time of the last successful push (owner) or pull (reader). */
  lastSyncedAt: number | null;
  /** The owner deleted this house on the server; readers keep a read-only copy until they remove it. */
  closed: boolean;
}
```

In `src/repo/houses.ts`:

```ts
const COLS = 'id, created_at, updated_at, deleted_at, name, role, join_code, currency_symbol, published, last_synced_at, closed';
```

```ts
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
```

In `createHouse`'s return value, add `lastSyncedAt: null, closed: false`. Run `npx tsc --noEmit` and fix any other place that builds a `House` literal (for example in tests) by adding the same two fields.

- [ ] **Step 6: `src/repo/sync.ts`**

```ts
import type { Db, SqlParam } from '@/db/types';
import { LEDGER_TABLES } from '@/db/schema';
import { now } from '@/db/ids';
import type { HouseRole } from '@/domain/types';

export type SyncTable = (typeof LEDGER_TABLES)[number];
export type SyncRow = Record<string, string | number | null>;

const BASE = ['id', 'house_id', 'created_at', 'updated_at', 'deleted_at'] as const;

/** Columns shared by the local table and the server table (supabase/migrations/20260924120100_ledger.sql). */
export const SYNC_COLUMNS: Record<SyncTable, readonly string[]> = {
  players: [...BASE, 'name', 'color_seed', 'archived'],
  sessions: [...BASE, 'date', 'title', 'default_buyin_cents', 'notes'],
  session_players: [...BASE, 'session_id', 'player_id', 'cashout_cents', 'sort_order'],
  buyins: [...BASE, 'session_player_id', 'amount_cents', 'at'],
  payments: [...BASE, 'session_id', 'from_player_id', 'to_player_id', 'amount_cents', 'note', 'at'],
};

/** Dirty rows of one table in one house, shaped for an upsert (no `dirty`). */
export function dirtyRows(db: Db, table: SyncTable, houseId: string): SyncRow[] {
  return db.all<SyncRow>(`SELECT ${SYNC_COLUMNS[table].join(', ')} FROM ${table} WHERE house_id = ? AND dirty = 1`, [houseId]);
}

/** Clears `dirty` only where `updated_at` still equals the pushed value, so an edit made during a push is not lost. */
export function markClean(db: Db, table: SyncTable | 'houses', rows: { id: string; updated_at: number }[]): void {
  db.transaction(() => {
    for (const r of rows) db.run(`UPDATE ${table} SET dirty = 0 WHERE id = ? AND updated_at = ?`, [r.id, r.updated_at]);
  });
}

export function pendingCount(db: Db, houseId: string): number {
  let n = db.first<{ c: number }>('SELECT COUNT(*) AS c FROM houses WHERE id = ? AND dirty = 1', [houseId])?.c ?? 0;
  for (const t of LEDGER_TABLES) {
    n += db.first<{ c: number }>(`SELECT COUNT(*) AS c FROM ${t} WHERE house_id = ? AND dirty = 1`, [houseId])?.c ?? 0;
  }
  return n;
}

/** Upserts pulled rows as clean. Keys outside SYNC_COLUMNS (e.g. `server_updated_at`) are ignored. */
export function applyPulledRows(db: Db, table: SyncTable, rows: SyncRow[]): void {
  if (rows.length === 0) return;
  const cols = SYNC_COLUMNS[table];
  const updates = cols.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`).join(', ');
  const sql = `INSERT INTO ${table} (${cols.join(', ')}, dirty) VALUES (${cols.map(() => '?').join(', ')}, 0)
    ON CONFLICT(id) DO UPDATE SET ${updates}, dirty = 0`;
  db.transaction(() => {
    for (const r of rows) db.run(sql, cols.map((c) => (r[c] ?? null) as SqlParam));
  });
}

export interface SyncHouse {
  id: string;
  name: string;
  role: HouseRole;
  published: boolean;
  dirty: boolean;
  currencySymbol: string;
  updatedAt: number;
  deletedAt: number | null;
  joinCode: string | null;
  pullCursor: string | null;
  lastSyncedAt: number | null;
  closed: boolean;
}

const SYNC_HOUSE_COLS =
  'id, name, role, published, dirty, currency_symbol, updated_at, deleted_at, join_code, pull_cursor, last_synced_at, closed';

function toSyncHouse(r: Record<string, unknown>): SyncHouse {
  return {
    id: r.id as string,
    name: r.name as string,
    role: r.role as HouseRole,
    published: !!r.published,
    dirty: !!r.dirty,
    currencySymbol: r.currency_symbol as string,
    updatedAt: r.updated_at as number,
    deletedAt: (r.deleted_at as number | null) ?? null,
    joinCode: (r.join_code as string | null) ?? null,
    pullCursor: (r.pull_cursor as string | null) ?? null,
    lastSyncedAt: (r.last_synced_at as number | null) ?? null,
    closed: !!r.closed,
  };
}

/** Published houses that sync: live ones, plus deleted ones whose deletion has not been pushed yet. */
export function listSyncHouses(db: Db): SyncHouse[] {
  return db
    .all<Record<string, unknown>>(
      `SELECT ${SYNC_HOUSE_COLS} FROM houses WHERE published = 1 AND (deleted_at IS NULL OR dirty = 1) ORDER BY created_at ASC`,
    )
    .map(toSyncHouse);
}

/** Includes deleted houses. */
export function getSyncHouse(db: Db, id: string): SyncHouse | null {
  const r = db.first<Record<string, unknown>>(`SELECT ${SYNC_HOUSE_COLS} FROM houses WHERE id = ?`, [id]);
  return r ? toSyncHouse(r) : null;
}

export function markPublished(db: Db, id: string, joinCode: string): void {
  db.run('UPDATE houses SET published = 1, join_code = ? WHERE id = ?', [joinCode, id]);
}

/** At publish time every row must reach the server, whatever its dirty state. */
export function dirtyAllInHouse(db: Db, houseId: string): void {
  db.transaction(() => {
    for (const t of LEDGER_TABLES) db.run(`UPDATE ${t} SET dirty = 1 WHERE house_id = ?`, [houseId]);
    db.run('UPDATE houses SET dirty = 1 WHERE id = ?', [houseId]);
  });
}

export function setPullCursor(db: Db, id: string, raw: string): void {
  db.run('UPDATE houses SET pull_cursor = ? WHERE id = ?', [raw, id]);
}

export function setLastSynced(db: Db, id: string, t: number = now()): void {
  db.run('UPDATE houses SET last_synced_at = ? WHERE id = ?', [t, id]);
}

/** The house row as the server returns it (houses select / join RPC `house`). */
export interface ServerHouse {
  id: string;
  name: string;
  currency_symbol: string;
  join_code: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

/** Adds a house joined from the server. Returns false if it is already on this phone (e.g. the owner's own). */
export function insertJoinedHouse(db: Db, h: ServerHouse, role: HouseRole): boolean {
  if (db.first('SELECT id FROM houses WHERE id = ?', [h.id])) return false;
  db.run(
    `INSERT INTO houses (id, created_at, updated_at, deleted_at, name, role, join_code, currency_symbol, published, dirty, closed)
     VALUES (?, ?, ?, NULL, ?, ?, ?, ?, 1, 0, ?)`,
    [h.id, h.created_at, h.updated_at, h.name, role, h.join_code, h.currency_symbol, h.deleted_at === null ? 0 : 1],
  );
  return true;
}

/** Reader side: take the server's name, currency, code and closed state. Never marks the row dirty. */
export function applyServerHouse(db: Db, h: ServerHouse): void {
  db.run('UPDATE houses SET name = ?, currency_symbol = ?, join_code = ?, updated_at = ?, closed = ?, dirty = 0 WHERE id = ?', [
    h.name, h.currency_symbol, h.join_code, h.updated_at, h.deleted_at === null ? 0 : 1, h.id,
  ]);
}

const CHILD_FIRST = [...LEDGER_TABLES].reverse();

/** Hard-deletes a house and everything in it from this phone (leave / removed). Repairs the current house. */
export function purgeHouse(db: Db, id: string): void {
  db.transaction(() => {
    for (const t of CHILD_FIRST) db.run(`DELETE FROM ${t} WHERE house_id = ?`, [id]);
    db.run('DELETE FROM houses WHERE id = ?', [id]);
    db.run("UPDATE settings SET current_house_id = NULL WHERE id = 'default' AND current_house_id = ?", [id]);
  });
  // ensureCurrentHouse lives in houses.ts; import lazily to avoid a cycle.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  (require('./houses') as typeof import('./houses')).ensureCurrentHouse(db);
}
```

If `SqlParam` is not exported from `src/db/types.ts`, it is (`export type SqlParam`); keep the import. If `./houses` does not import `./sync`, replace the lazy `require` with a normal top-level `import { ensureCurrentHouse } from './houses'` and delete the comment lines. Check with `grep -n "from './sync'" src/repo/houses.ts`. Nothing in this plan makes houses.ts import sync.ts, so the normal import is expected.

- [ ] **Step 7: `src/sync/cursor.ts`**

```ts
import type { SyncTable } from '@/repo/sync';

export interface TableCursor {
  /** `server_updated_at` exactly as PostgREST returned it (microseconds included). */
  ts: string;
  id: string;
}
export type PullCursors = Partial<Record<SyncTable, TableCursor>>;

export const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
/** Rows are stamped when written, not when committed; re-reading a few seconds is harmless because pull is idempotent. */
export const OVERLAP_MS = 5000;

const EPOCH = new Date(0).toISOString();

export function parseCursors(raw: string | null): PullCursors {
  if (!raw) return {};
  try {
    const v: unknown = JSON.parse(raw);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as PullCursors) : {};
  } catch {
    return {};
  }
}

export function serializeCursors(c: PullCursors): string {
  return JSON.stringify(c);
}

/** Where the next pull of a table starts: OVERLAP_MS before the saved cursor, or the beginning. */
export function overlapStart(c: TableCursor | undefined): TableCursor {
  if (!c) return { ts: EPOCH, id: ZERO_UUID };
  // JS dates hold milliseconds; drop extra fractional digits before parsing.
  const ms = Date.parse(c.ts.replace(/(\.\d{3})\d+/, '$1'));
  if (Number.isNaN(ms)) return { ts: EPOCH, id: ZERO_UUID };
  return { ts: new Date(ms - OVERLAP_MS).toISOString(), id: ZERO_UUID };
}
```

- [ ] **Step 8: Run the tests**

Run: `npx jest src/db/schema.test.ts src/repo/houses.test.ts src/repo/sync.test.ts src/sync/cursor.test.ts`
Expected: PASS. Then run the full `npx jest`, `npx tsc --noEmit` and the iOS export (Global Constraints).

- [ ] **Step 9: Commit**

```bash
git add src/db/schema.ts src/db/schema.test.ts src/domain/types.ts src/repo/houses.ts src/repo/houses.test.ts src/repo/sync.ts src/repo/sync.test.ts src/sync/cursor.ts src/sync/cursor.test.ts
git commit -m "feat(sync): local sync bookkeeping, schema v4, pull cursors

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Add any test files you touched in Step 5 too.)

---

### Task 2: Supabase client, registry, local stack config, integration harness

**Files:**
- Modify: `package.json`, `package-lock.json` (via `npx expo install`), `supabase/config.toml`, `jest.setup.ts`, `README.md`
- Create: `src/sync/registry.ts`, `src/sync/client.ts`, `src/sync/passwords.ts`, `.env.example`, `scripts/test-sync.sh`, `src/sync/sync.integration.test.ts` (skeleton)

**Interfaces:**
- Produces:
  - `setSyncClient(c: SupabaseClient | null)`, `getSyncClient(): SupabaseClient | null`, `requireSyncClient(): SupabaseClient` (throws `Sharing isn't set up in this build`).
  - `createAppSyncClient(): SupabaseClient | null` (null when env vars are missing).
  - `savePassword(houseId, pw)`, `loadPassword(houseId): Promise<string | null>`.
  - `npm run test:sync`.

- [ ] **Step 1: Read the docs and install**

Read the Expo SDK 57 pages for `expo-secure-store` and `expo-sqlite` (the "localStorage" / key-value section) and Supabase's Expo quickstart. Then:

```bash
npx expo install @supabase/supabase-js react-native-url-polyfill expo-secure-store
```

If the SDK 57 docs say `expo-secure-store` needs a config plugin entry for this use (no Face ID), add it to `app.json` `plugins`. Otherwise leave `app.json` alone.

- [ ] **Step 2: Registry, client, passwords**

`src/sync/registry.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

/** The app's Supabase client. Set once in _layout; null when the build has no Supabase env. Tests never set it. */
let client: SupabaseClient | null = null;

export function setSyncClient(c: SupabaseClient | null): void {
  client = c;
}

export function getSyncClient(): SupabaseClient | null {
  return client;
}

export function requireSyncClient(): SupabaseClient {
  if (!client) throw new Error("Sharing isn't set up in this build");
  return client;
}
```

`src/sync/client.ts` (app only; the file header says so):

```ts
// App-only: imports native polyfills. Tests must never import this file.
import 'react-native-url-polyfill/auto';
import 'expo-sqlite/localStorage/install';
import { AppState } from 'react-native';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export function createAppSyncClient(): SupabaseClient | null {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_KEY;
  if (!url || !key) return null;
  const client = createClient(url, key, {
    auth: { storage: localStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
  });
  // Refresh tokens only while the app is in the foreground (supabase-js React Native guidance).
  AppState.addEventListener('change', (state) => {
    if (state === 'active') client.auth.startAutoRefresh();
    else client.auth.stopAutoRefresh();
  });
  return client;
}
```

`src/sync/passwords.ts`:

```ts
import * as SecureStore from 'expo-secure-store';

/** The owner's house password, kept on this phone only so it can be shown and shared (spec §2.2). */
const key = (houseId: string) => `house-password-${houseId}`;

export const savePassword = (houseId: string, password: string) => SecureStore.setItemAsync(key(houseId), password);
export const loadPassword = (houseId: string) => SecureStore.getItemAsync(key(houseId));
```

Append to `jest.setup.ts`:

```ts
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    setItemAsync: jest.fn(async (k: string, v: string) => void store.set(k, v)),
    getItemAsync: jest.fn(async (k: string) => store.get(k) ?? null),
    deleteItemAsync: jest.fn(async (k: string) => void store.delete(k)),
  };
});
```

- [ ] **Step 3: Local stack and env docs**

In `supabase/config.toml`:
- set `enabled = true` under `[api]`, because the app and the integration test need PostgREST;
- under `[auth.rate_limit]`, set `anonymous_users = 1000`, so repeated local test runs are not throttled. This key only affects the local stack; the hosted limit is set in the dashboard.

Check the exact key name with `grep -n "anonymous_users" supabase/config.toml` and edit that line with `perl -pi -e`.

Create `.env.example`:

```bash
# Copy to .env.local (gitignored) for Expo Go. EAS builds read these from EAS env.
# Supabase dashboard → Project Settings → API: Project URL and the publishable key.
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_KEY=
```

Create `scripts/test-sync.sh` and make it executable (`chmod +x`):

```bash
#!/usr/bin/env bash
# Runs the sync integration test against the local Supabase stack (supabase start).
set -euo pipefail
cd "$(dirname "$0")/.."
eval "$(supabase status -o env | grep -E '^(API_URL|PUBLISHABLE_KEY)=')"
CHIPS_SUPABASE_URL="$API_URL" CHIPS_SUPABASE_KEY="$PUBLISHABLE_KEY" npx jest src/sync/sync.integration.test.ts --runInBand
```

In `package.json` `scripts`, add `"test:sync": "scripts/test-sync.sh"`.

In `README.md`, under the "Server (Supabase)" section, add these lines:

```markdown
    npm run test:sync     # sync integration test against the local stack (needs `supabase start`)

For Expo Go, copy `.env.example` to `.env.local` and fill in the hosted project URL and publishable key.
```

- [ ] **Step 4: Integration test skeleton**

`src/sync/sync.integration.test.ts`:

```ts
/**
 * @jest-environment node
 *
 * Owner and reader phones against the local Supabase stack. Skipped unless CHIPS_SUPABASE_URL/KEY are set;
 * run with `npm run test:sync` after `supabase start`.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ensureSession } from './remote';

const URL = process.env.CHIPS_SUPABASE_URL;
const KEY = process.env.CHIPS_SUPABASE_KEY;
const describeIt = URL && KEY ? describe : describe.skip;

export function newClient(): SupabaseClient {
  return createClient(URL!, KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
}

describeIt('sync against local Supabase', () => {
  jest.setTimeout(30000);

  it('signs in anonymously and keeps the same user', async () => {
    const c = newClient();
    const a = await ensureSession(c);
    const b = await ensureSession(c);
    expect(a).toMatch(/^[0-9a-f-]{36}$/);
    expect(b).toBe(a);
  });
});
```

Create a minimal `src/sync/remote.ts` with only `ensureSession` for now (Task 3 fills in the rest):

```ts
import type { SupabaseClient } from '@supabase/supabase-js';

/** Signs in anonymously the first time; returns the auth user id. */
export async function ensureSession(client: SupabaseClient): Promise<string> {
  const { data } = await client.auth.getSession();
  if (data.session) return data.session.user.id;
  const { data: signed, error } = await client.auth.signInAnonymously();
  if (error || !signed.user) throw error ?? new Error('Sign-in failed');
  return signed.user.id;
}
```

- [ ] **Step 5: Verify**

1. Restart the local stack with the API on:
   ```bash
   supabase stop && supabase start
   ```
2. Run the integration test:
   ```bash
   npm run test:sync
   ```
   Expected: 1 test passes.
3. Run `npx jest`. The integration test is **skipped**, and everything else passes.
4. Run `npx tsc --noEmit` and the iOS export.

If supabase-js fails to load under jest-expo:
- The `@jest-environment node` docblock should already cover it.
- If it doesn't, add `'@supabase'` to jest-expo's `transformIgnorePatterns` allow-list in `jest.config.js`, and record why in the report.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json supabase/config.toml jest.setup.ts README.md .env.example scripts/test-sync.sh src/sync/registry.ts src/sync/client.ts src/sync/passwords.ts src/sync/remote.ts src/sync/sync.integration.test.ts
git commit -m "feat(sync): supabase client, registry, secure password store, local integration harness

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

(Include `app.json` and `jest.config.js` if you changed them.)

---

### Task 3: Remote calls, error mapping, push, publish

**Files:**
- Modify: `src/sync/remote.ts`, `src/sync/sync.integration.test.ts`
- Create: `src/sync/errors.ts`, `src/sync/errors.test.ts`, `src/sync/push.ts`, `src/sync/publish.ts`

**Interfaces:**
- Consumes: Task 1 repo functions, `ensureSession`.
- Produces, in `remote.ts`:
  - `rpcCreateHouse(client, { id, name, currency, password }) → { join_code, invite_secret }`
  - `rpcJoinHouse(client, code, password, displayName?) → JoinResponse`
  - `fetchHouse(client, id) → ServerHouse | null`
  - `updateHouseRow(client, id, patch)`
  - `upsertRows(client, table, rows)`
  - `fetchPage(client, table, houseId, after: TableCursor, limit?) → (SyncRow & { server_updated_at: string })[]`
  - `rpcLeaveHouse(client, id)`
  - `rpcResetPassword(client, id, password)`
  - `listMembers(client, houseId) → Member[]`
  - `rpcRemoveMember(client, houseId, userId) → string`
  - `PAGE_SIZE = 500`
- Produces, in `errors.ts`: `describeSyncError(e) → { kind: 'offline' | 'error'; message: string }`.
- Produces, in `push.ts`: `PUSH_CHUNK = 500` and `pushHouse(db, client, houseId): Promise<number>`, which returns the number of rows pushed.
- Produces, in `publish.ts`: `publishHouse(db, client, houseId, password): Promise<{ joinCode: string; inviteSecret: string }>`.

- [ ] **Step 1: Failing tests**

`src/sync/errors.test.ts`:

```ts
import { describeSyncError } from './errors';

describe('describeSyncError', () => {
  it('treats fetch failures as offline', () => {
    expect(describeSyncError(new TypeError('Network request failed'))).toEqual({ kind: 'offline', message: "You're offline" });
    expect(describeSyncError(new TypeError('fetch failed'))).toEqual({ kind: 'offline', message: "You're offline" });
    expect(describeSyncError({ message: 'TypeError: Failed to fetch' })).toEqual({ kind: 'offline', message: "You're offline" });
  });

  it('maps RPC messages and Postgres codes', () => {
    expect(describeSyncError({ code: 'P0001', message: 'weak_password' }).message).toBe('Password needs at least 4 characters');
    expect(describeSyncError({ code: 'P0001', message: 'forbidden' }).message).toBe('Only the owner can do that');
    expect(describeSyncError({ code: 'P0001', message: 'owner_cannot_leave' }).message).toBe("Owners can't leave their own house");
    expect(describeSyncError({ code: 'P0001', message: 'house_deleted' }).message).toBe('This house was deleted');
    expect(describeSyncError({ code: 'P0001', message: 'not_authenticated' }).message).toBe("Couldn't sign in. Try again.");
    expect(describeSyncError({ code: '23514', message: 'violates check constraint' }).message).toBe('A name or symbol is too long');
    expect(describeSyncError({ code: '42501', message: 'row-level security' }).message).toBe('The server refused this change');
  });

  it('falls back to the message', () => {
    expect(describeSyncError(new Error('boom'))).toEqual({ kind: 'error', message: 'boom' });
    expect(describeSyncError('weird')).toEqual({ kind: 'error', message: 'weird' });
  });
});
```

Extend `src/sync/sync.integration.test.ts`:
- Add these imports at the top:

```ts
import type { Db } from '@/db/types';
import { createTestDb } from '../../test/nodeDb';
import { createHouse } from '@/repo/houses';
import { createPlayer } from '@/repo/players';
import { addBuyin, addPayment, createSession, setCashout } from '@/repo/sessions';
import { SYNC_COLUMNS, pendingCount, type SyncTable } from '@/repo/sync';
import { LEDGER_TABLES } from '@/db/schema';
import { publishHouse } from './publish';
import { pushHouse } from './push';
```

- Add these helpers above `describeIt`:

```ts
/** A house with two players, one night, buy-ins, cash-outs and a payment. */
export function seedHouse(db: Db, name = 'IT Crew') {
  const house = createHouse(db, { name, currencySymbol: '£' });
  const ann = createPlayer(db, house.id, 'Ann');
  const bo = createPlayer(db, house.id, 'Bo');
  const night = createSession(db, house.id, { date: '2026-09-24', title: 'Opening night', defaultBuyinCents: 2000, playerIds: [ann.id, bo.id] });
  const sps = db.all<{ id: string }>('SELECT id FROM session_players WHERE session_id = ? ORDER BY sort_order', [night.id]);
  addBuyin(db, sps[0].id, 2000);
  addBuyin(db, sps[1].id, 2000);
  setCashout(db, sps[0].id, 3000);
  setCashout(db, sps[1].id, 1000);
  addPayment(db, night.id, { fromPlayerId: bo.id, toPlayerId: ann.id, amountCents: 1000 });
  return { house, ann, bo, night };
}

/** Every synced column of every ledger row in the house, keyed by table. Includes soft-deleted rows. */
export function snapshot(db: Db, houseId: string): Record<SyncTable, unknown[]> {
  const out = {} as Record<SyncTable, unknown[]>;
  for (const t of LEDGER_TABLES) {
    out[t] = db.all(`SELECT ${SYNC_COLUMNS[t].join(', ')} FROM ${t} WHERE house_id = ? ORDER BY id`, [houseId]);
  }
  return out;
}

async function serverSnapshot(client: SupabaseClient, houseId: string): Promise<Record<SyncTable, unknown[]>> {
  const out = {} as Record<SyncTable, unknown[]>;
  for (const t of LEDGER_TABLES) {
    const { data, error } = await client.from(t).select(SYNC_COLUMNS[t].join(', ')).eq('house_id', houseId).order('id');
    if (error) throw error;
    out[t] = data ?? [];
  }
  return out;
}
```

- Add these tests inside `describeIt`:

```ts
  it('publishes a house and pushes every row', async () => {
    const db = createTestDb();
    const owner = newClient();
    const { house } = seedHouse(db);
    const { joinCode, inviteSecret } = await publishHouse(db, owner, house.id, 'hunter22');
    expect(joinCode).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
    expect(inviteSecret).toHaveLength(43);
    expect(pendingCount(db, house.id)).toBe(0);
    expect(await serverSnapshot(owner, house.id)).toEqual(snapshot(db, house.id));
  });

  it('pushes the house row and later edits, and nothing when clean', async () => {
    const db = createTestDb();
    const owner = newClient();
    const { house, ann } = seedHouse(db);
    await publishHouse(db, owner, house.id, 'hunter22');
    expect(await pushHouse(db, owner, house.id)).toBe(0);

    db.run("UPDATE houses SET name = 'Renamed', updated_at = updated_at + 1, dirty = 1 WHERE id = ?", [house.id]);
    db.run("UPDATE players SET name = 'Annie', updated_at = updated_at + 1, dirty = 1 WHERE id = ?", [ann.id]);
    expect(await pushHouse(db, owner, house.id)).toBe(2);
    const { data } = await owner.from('houses').select('name').eq('id', house.id).single();
    expect(data?.name).toBe('Renamed');
    expect(await serverSnapshot(owner, house.id)).toEqual(snapshot(db, house.id));
  });

  it('publish is safe to retry', async () => {
    const db = createTestDb();
    const owner = newClient();
    const { house } = seedHouse(db);
    const a = await publishHouse(db, owner, house.id, 'hunter22');
    const b = await publishHouse(db, owner, house.id, 'hunter23');
    expect(b.joinCode).toBe(a.joinCode);
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest src/sync/errors.test.ts` (FAIL: no module), then `npm run test:sync` (FAIL: `./publish` missing).

- [ ] **Step 3: `src/sync/errors.ts`**

```ts
export interface SyncErrorInfo {
  kind: 'offline' | 'error';
  message: string;
}

const RPC_MESSAGES: Record<string, string> = {
  weak_password: 'Password needs at least 4 characters',
  forbidden: 'Only the owner can do that',
  owner_cannot_leave: "Owners can't leave their own house",
  house_deleted: 'This house was deleted',
  not_authenticated: "Couldn't sign in. Try again.",
};

const OFFLINE = /network request failed|fetch failed|failed to fetch|network error|timed out/i;

/** Turns anything a sync call can throw into what the UI shows. */
export function describeSyncError(e: unknown): SyncErrorInfo {
  const err = (e ?? {}) as { code?: unknown; message?: unknown };
  const message = typeof err.message === 'string' ? err.message : typeof e === 'string' ? e : String(e);
  const code = typeof err.code === 'string' ? err.code : '';

  if (OFFLINE.test(message)) return { kind: 'offline', message: "You're offline" };
  if (code === 'P0001' && RPC_MESSAGES[message]) return { kind: 'error', message: RPC_MESSAGES[message] };
  if (code === '23514') return { kind: 'error', message: 'A name or symbol is too long' };
  if (code === '42501') {
    console.warn('Sync rejected by row-level security:', message); // spec §7: log as a bug
    return { kind: 'error', message: 'The server refused this change' };
  }
  return { kind: 'error', message };
}
```

- [ ] **Step 4: `src/sync/remote.ts` (complete)**

Replace the file with:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { HouseRole } from '@/domain/types';
import type { ServerHouse, SyncRow, SyncTable } from '@/repo/sync';
import type { TableCursor } from './cursor';

export const PAGE_SIZE = 500;
const HOUSE_COLS = 'id, name, currency_symbol, join_code, created_at, updated_at, deleted_at';

/** Signs in anonymously the first time; returns the auth user id. */
export async function ensureSession(client: SupabaseClient): Promise<string> {
  const { data } = await client.auth.getSession();
  if (data.session) return data.session.user.id;
  const { data: signed, error } = await client.auth.signInAnonymously();
  if (error || !signed.user) throw error ?? new Error('Sign-in failed');
  return signed.user.id;
}

export async function rpcCreateHouse(
  client: SupabaseClient,
  a: { id: string; name: string; currency: string; password: string },
): Promise<{ join_code: string; invite_secret: string }> {
  const { data, error } = await client.rpc('create_house', {
    p_id: a.id, p_name: a.name, p_currency: a.currency, p_password: a.password,
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as { join_code: string; invite_secret: string } | undefined;
  if (!row) throw new Error('create_house returned nothing');
  return row;
}

export type JoinResponse =
  | { ok: true; house: ServerHouse; role: HouseRole }
  | { ok: false; error: 'invalid' }
  | { ok: false; error: 'locked'; minutes: number };

export async function rpcJoinHouse(
  client: SupabaseClient,
  code: string,
  password: string,
  displayName?: string | null,
): Promise<JoinResponse> {
  const { data, error } = await client.rpc('join_house', {
    p_code: code, p_password: password, p_display_name: displayName ?? null,
  });
  if (error) throw error;
  return data as JoinResponse;
}

/** The house row, or null when the caller is not a member (RLS hides it). */
export async function fetchHouse(client: SupabaseClient, id: string): Promise<ServerHouse | null> {
  const { data, error } = await client.from('houses').select(HOUSE_COLS).eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as ServerHouse | null) ?? null;
}

/** Owner only; the server grants update on exactly these four columns. */
export async function updateHouseRow(
  client: SupabaseClient,
  id: string,
  patch: { name: string; currency_symbol: string; updated_at: number; deleted_at: number | null },
): Promise<void> {
  const { data, error } = await client.from('houses').update(patch).eq('id', id).select('id');
  if (error) throw error;
  if (!data || data.length === 0) throw new Error('The server refused the house update');
}

export async function upsertRows(client: SupabaseClient, table: SyncTable, rows: SyncRow[]): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await client.from(table).upsert(rows, { onConflict: 'id' });
  if (error) throw error;
}

/** One page of rows after `after`, ordered by (server_updated_at, id). Values are quoted for PostgREST. */
export async function fetchPage(
  client: SupabaseClient,
  table: SyncTable,
  houseId: string,
  after: TableCursor,
  limit: number = PAGE_SIZE,
): Promise<(SyncRow & { server_updated_at: string })[]> {
  const ts = `"${after.ts}"`;
  const { data, error } = await client
    .from(table)
    .select('*')
    .eq('house_id', houseId)
    .or(`server_updated_at.gt.${ts},and(server_updated_at.eq.${ts},id.gt.${after.id})`)
    .order('server_updated_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as (SyncRow & { server_updated_at: string })[];
}

export async function rpcLeaveHouse(client: SupabaseClient, houseId: string): Promise<void> {
  const { error } = await client.rpc('leave_house', { p_house_id: houseId });
  if (error) throw error;
}

export async function rpcResetPassword(client: SupabaseClient, houseId: string, password: string): Promise<void> {
  const { error } = await client.rpc('reset_house_password', { p_house_id: houseId, p_password: password });
  if (error) throw error;
}

export interface Member {
  user_id: string;
  role: HouseRole;
  display_name: string | null;
  joined_at: string;
}

/** Owner sees every member; a reader sees only their own row (RLS). */
export async function listMembers(client: SupabaseClient, houseId: string): Promise<Member[]> {
  const { data, error } = await client
    .from('house_members')
    .select('user_id, role, display_name, joined_at')
    .eq('house_id', houseId)
    .order('joined_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as Member[];
}

/** Returns the new invite secret (the old link stops working). */
export async function rpcRemoveMember(client: SupabaseClient, houseId: string, userId: string): Promise<string> {
  const { data, error } = await client.rpc('remove_member', { p_house_id: houseId, p_user_id: userId });
  if (error) throw error;
  return data as string;
}
```

- [ ] **Step 5: `src/sync/push.ts` and `src/sync/publish.ts`**

`push.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Db } from '@/db/types';
import { LEDGER_TABLES } from '@/db/schema';
import { dirtyRows, getSyncHouse, markClean } from '@/repo/sync';
import { updateHouseRow, upsertRows } from './remote';

export const PUSH_CHUNK = 500;

/**
 * Pushes a published, owned house: the house row (4 columns) if dirty, then dirty ledger rows in FK order.
 * Clears `dirty` only on rows unchanged since they were read. Returns how many rows were pushed.
 * A failure throws and leaves the remaining rows dirty for the next try.
 */
export async function pushHouse(db: Db, client: SupabaseClient, houseId: string): Promise<number> {
  const h = getSyncHouse(db, houseId);
  if (!h || !h.published || h.role !== 'owner') return 0;
  let pushed = 0;

  if (h.dirty) {
    await updateHouseRow(client, houseId, {
      name: h.name, currency_symbol: h.currencySymbol, updated_at: h.updatedAt, deleted_at: h.deletedAt,
    });
    markClean(db, 'houses', [{ id: houseId, updated_at: h.updatedAt }]);
    pushed += 1;
  }

  for (const table of LEDGER_TABLES) {
    const rows = dirtyRows(db, table, houseId);
    for (let i = 0; i < rows.length; i += PUSH_CHUNK) {
      const chunk = rows.slice(i, i + PUSH_CHUNK);
      await upsertRows(client, table, chunk);
      markClean(db, table, chunk as { id: string; updated_at: number }[]);
      pushed += chunk.length;
    }
  }
  return pushed;
}
```

`publish.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Db } from '@/db/types';
import { dirtyAllInHouse, getSyncHouse, markPublished } from '@/repo/sync';
import { ensureSession, rpcCreateHouse } from './remote';
import { pushHouse } from './push';

/**
 * Share house (spec §2.2): sign in if needed, create the server house (safe to retry),
 * mark the local house published, then push every row.
 */
export async function publishHouse(
  db: Db,
  client: SupabaseClient,
  houseId: string,
  password: string,
): Promise<{ joinCode: string; inviteSecret: string }> {
  const h = getSyncHouse(db, houseId);
  if (!h || h.deletedAt !== null) throw new Error('House not found');
  if (h.role !== 'owner') throw new Error('Only the owner can share this house');
  if (password.length < 4) throw new Error('Password needs at least 4 characters');

  await ensureSession(client);
  const created = await rpcCreateHouse(client, { id: h.id, name: h.name, currency: h.currencySymbol, password });
  db.transaction(() => {
    markPublished(db, houseId, created.join_code);
    dirtyAllInHouse(db, houseId);
  });
  await pushHouse(db, client, houseId);
  return { joinCode: created.join_code, inviteSecret: created.invite_secret };
}
```

- [ ] **Step 6: Run the tests**

Run: `npx jest src/sync/errors.test.ts` (PASS), then `npm run test:sync` (4 PASS).

If the `.or()` filter misparses the quoted timestamp, test `fetchPage` directly and fix the quoting. Check PostgREST's docs on reserved characters in logical filters. Do not drop the `(server_updated_at, id)` keyset. `fetchPage` is not exercised until Task 4, but it compiles here.

Then run `npx jest`, `npx tsc --noEmit` and the export.

- [ ] **Step 7: Commit**

```bash
git add src/sync/remote.ts src/sync/errors.ts src/sync/errors.test.ts src/sync/push.ts src/sync/publish.ts src/sync/sync.integration.test.ts
git commit -m "feat(sync): remote calls, error mapping, owner push and publish

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Join by code and pull

**Files:**
- Create: `src/sync/pull.ts`, `src/sync/join.ts`
- Modify: `src/sync/sync.integration.test.ts`

**Interfaces:**
- Consumes: Tasks 1 and 3.
- Produces:
  - `type PullResult = 'ok' | 'removed' | 'closed'`
  - `pullHouse(db, client, houseId): Promise<PullResult>`
  - `type JoinOutcome = { ok: true; houseId: string; role: HouseRole } | { ok: false; error: 'invalid' } | { ok: false; error: 'locked'; minutes: number }`
  - `joinByCode(db, client, code, password, displayName?): Promise<JoinOutcome>`

- [ ] **Step 1: Failing integration tests**

Add these imports:

```ts
import { deleteHouse } from '@/repo/houses';
import { renamePlayer } from '@/repo/players';
import { deleteSession } from '@/repo/sessions';
import { getHouse } from '@/repo/houses';
import { joinByCode } from './join';
import { pullHouse } from './pull';
import { rpcLeaveHouse, rpcRemoveMember, upsertRows } from './remote';
import { PAGE_SIZE } from './remote';
```

Add these tests inside `describeIt`:

```ts
  it('a reader joins by code and gets the same ledger', async () => {
    const ownerDb = createTestDb();
    const owner = newClient();
    const { house } = seedHouse(ownerDb);
    const { joinCode } = await publishHouse(ownerDb, owner, house.id, 'hunter22');

    const readerDb = createTestDb();
    const reader = newClient();
    const typed = `${joinCode.slice(0, 4).toLowerCase()}-${joinCode.slice(4)}`;
    expect(await joinByCode(readerDb, reader, typed, 'hunter22', 'Rae')).toEqual({ ok: true, houseId: house.id, role: 'reader' });
    expect(snapshot(readerDb, house.id)).toEqual(snapshot(ownerDb, house.id));
    expect(getHouse(readerDb, house.id)).toEqual(
      expect.objectContaining({ name: 'IT Crew', currencySymbol: '£', role: 'reader', published: true, joinCode }),
    );
  });

  it('wrong code and wrong password give the same answer', async () => {
    const ownerDb = createTestDb();
    const { house } = seedHouse(ownerDb);
    const { joinCode } = await publishHouse(ownerDb, newClient(), house.id, 'hunter22');
    const reader = newClient();
    const db = createTestDb();
    const badPw = await joinByCode(db, reader, joinCode, 'nope');
    const badCode = await joinByCode(db, reader, 'ZZZZZZZZ', 'hunter22');
    expect(badPw).toEqual({ ok: false, error: 'invalid' });
    expect(badCode).toEqual(badPw);
  });

  it('pulls later edits, soft deletes and renames incrementally', async () => {
    const ownerDb = createTestDb();
    const owner = newClient();
    const { house, ann, night } = seedHouse(ownerDb);
    const { joinCode } = await publishHouse(ownerDb, owner, house.id, 'hunter22');
    const readerDb = createTestDb();
    const reader = newClient();
    await joinByCode(readerDb, reader, joinCode, 'hunter22');

    renamePlayer(ownerDb, ann.id, 'Annie');
    deleteSession(ownerDb, night.id);
    ownerDb.run("UPDATE houses SET name = 'Tuesday', updated_at = updated_at + 1, dirty = 1 WHERE id = ?", [house.id]);
    await pushHouse(ownerDb, owner, house.id);

    expect(await pullHouse(readerDb, reader, house.id)).toBe('ok');
    expect(snapshot(readerDb, house.id)).toEqual(snapshot(ownerDb, house.id));
    expect(getHouse(readerDb, house.id)?.name).toBe('Tuesday');
    expect(await pullHouse(readerDb, reader, house.id)).toBe('ok'); // idempotent
    expect(snapshot(readerDb, house.id)).toEqual(snapshot(ownerDb, house.id));
  });

  it('pages through more rows than one page', async () => {
    const ownerDb = createTestDb();
    const owner = newClient();
    const house = createHouse(ownerDb, { name: 'Big', currencySymbol: '$' });
    for (let i = 0; i < PAGE_SIZE + 20; i++) createPlayer(ownerDb, house.id, `P${i}`);
    const { joinCode } = await publishHouse(ownerDb, owner, house.id, 'hunter22');
    const readerDb = createTestDb();
    await joinByCode(readerDb, newClient(), joinCode, 'hunter22');
    expect(snapshot(readerDb, house.id).players).toHaveLength(PAGE_SIZE + 20);
  });

  it('a reader cannot write to the server', async () => {
    const ownerDb = createTestDb();
    const { house, ann } = seedHouse(ownerDb);
    const { joinCode } = await publishHouse(ownerDb, newClient(), house.id, 'hunter22');
    const reader = newClient();
    await joinByCode(createTestDb(), reader, joinCode, 'hunter22');
    await expect(
      upsertRows(reader, 'players', [{ ...snapshot(ownerDb, house.id).players.find((p) => (p as { id: string }).id === ann.id) as never, name: 'Hacked' }]),
    ).rejects.toEqual(expect.objectContaining({ code: '42501' }));
  });

  it('removed and left readers get "removed"; a deleted house reads "closed"', async () => {
    const ownerDb = createTestDb();
    const owner = newClient();
    const { house } = seedHouse(ownerDb);
    const { joinCode } = await publishHouse(ownerDb, owner, house.id, 'hunter22');

    const r1Db = createTestDb();
    const r1 = newClient();
    await joinByCode(r1Db, r1, joinCode, 'hunter22');
    const r1Id = await ensureSession(r1);
    await rpcRemoveMember(owner, house.id, r1Id);
    expect(await pullHouse(r1Db, r1, house.id)).toBe('removed');

    const r2Db = createTestDb();
    const r2 = newClient();
    await joinByCode(r2Db, r2, joinCode, 'hunter22');
    await rpcLeaveHouse(r2, house.id);
    expect(await pullHouse(r2Db, r2, house.id)).toBe('removed');

    const r3Db = createTestDb();
    const r3 = newClient();
    await joinByCode(r3Db, r3, joinCode, 'hunter22');
    deleteHouse(ownerDb, house.id); // owner db still has My House, so deleting is allowed
    await pushHouse(ownerDb, owner, house.id);
    expect(await pullHouse(r3Db, r3, house.id)).toBe('closed');
    expect(getHouse(r3Db, house.id)?.closed).toBe(true);
  });

  it('the owner joining their own code keeps owner role and pulls nothing', async () => {
    const db = createTestDb();
    const owner = newClient();
    const { house } = seedHouse(db);
    const { joinCode } = await publishHouse(db, owner, house.id, 'hunter22');
    expect(await joinByCode(db, owner, joinCode, 'hunter22')).toEqual({ ok: true, houseId: house.id, role: 'owner' });
    expect(pendingCount(db, house.id)).toBe(0);
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm run test:sync`
Expected: FAIL (`./join`, `./pull` missing).

- [ ] **Step 3: `src/sync/pull.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Db } from '@/db/types';
import { LEDGER_TABLES } from '@/db/schema';
import { applyPulledRows, applyServerHouse, getSyncHouse, setLastSynced, setPullCursor } from '@/repo/sync';
import { overlapStart, parseCursors, serializeCursors } from './cursor';
import { PAGE_SIZE, fetchHouse, fetchPage } from './remote';

export type PullResult = 'ok' | 'removed' | 'closed';

/**
 * Reader pull (spec §3.2): read the house row first (none → removed), then each table in FK order,
 * paging by (server_updated_at, id) from a few seconds before the saved cursor. Saves the cursor after each page.
 * Soft-deleted rows arrive like any other; local `deleted_at IS NULL` filters hide them.
 */
export async function pullHouse(db: Db, client: SupabaseClient, houseId: string): Promise<PullResult> {
  const server = await fetchHouse(client, houseId);
  if (!server) return 'removed';
  applyServerHouse(db, server);

  const cursors = parseCursors(getSyncHouse(db, houseId)?.pullCursor ?? null);
  for (const table of LEDGER_TABLES) {
    let after = overlapStart(cursors[table]);
    for (;;) {
      const page = await fetchPage(client, table, houseId, after);
      if (page.length === 0) break;
      applyPulledRows(db, table, page);
      const last = page[page.length - 1];
      after = { ts: last.server_updated_at, id: String(last.id) };
      cursors[table] = after;
      setPullCursor(db, houseId, serializeCursors(cursors));
      if (page.length < PAGE_SIZE) break;
    }
  }
  setLastSynced(db, houseId);
  return server.deleted_at === null ? 'ok' : 'closed';
}
```

- [ ] **Step 4: `src/sync/join.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Db } from '@/db/types';
import type { HouseRole } from '@/domain/types';
import { insertJoinedHouse } from '@/repo/sync';
import { ensureSession, rpcJoinHouse } from './remote';
import { pullHouse } from './pull';

export type JoinOutcome =
  | { ok: true; houseId: string; role: HouseRole }
  | { ok: false; error: 'invalid' }
  | { ok: false; error: 'locked'; minutes: number };

/**
 * Join by code and password (spec §2.3). A house already on this phone (the owner's own) is left as is;
 * a new one is added with the role the server reports, then pulled.
 */
export async function joinByCode(
  db: Db,
  client: SupabaseClient,
  code: string,
  password: string,
  displayName?: string | null,
): Promise<JoinOutcome> {
  await ensureSession(client);
  const r = await rpcJoinHouse(client, code, password, displayName);
  if (!r.ok) return r;
  if (insertJoinedHouse(db, r.house, r.role)) await pullHouse(db, client, r.house.id);
  return { ok: true, houseId: r.house.id, role: r.role };
}
```

- [ ] **Step 5: Run the tests**

Run: `npm run test:sync`
Expected: all PASS.

If the reader-write test's error has no `code` because of how supabase-js surfaces it, assert on what it does carry (`code` or `message` containing `row-level security`). Keep the assertion that the write is rejected.

Then run `npx jest` (integration skipped), `npx tsc --noEmit` and the export.

- [ ] **Step 6: Commit**

```bash
git add src/sync/pull.ts src/sync/join.ts src/sync/sync.integration.test.ts
git commit -m "feat(sync): join by code and paged reader pull

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Sync store, status text, sync actions, app wiring

**Files:**
- Create: `src/domain/syncStatus.ts`, `src/domain/syncStatus.test.ts`, `src/domain/joinCode.ts`, `src/domain/joinCode.test.ts`, `src/store/useSyncStore.ts`, `src/store/syncActions.ts`, `src/store/syncActions.test.ts`
- Modify: `src/app/_layout.tsx`

**Interfaces:**
- Produces:
  - `syncStatusLabel(input): { text: string; tone: 'dim' | 'warn' | 'error'; tappable: boolean } | null`
  - `formatJoinCode(code): string` ("K7QX-M2PA")
  - `useSyncStore` with `byHouse[id] = { phase: 'idle' | 'syncing' | 'offline' | 'error'; message: string | null }` and `pending[id]: number`
- Also produces, in `syncActions`:
  - `PUSH_DEBOUNCE_MS = 2000`, `schedulePush()`, `pushDirtyHouses()`, `syncHouse(id)`, `syncAll()`, `startSync(): () => void`, `refreshPending()`
  - UI actions: `shareHouse(id, password)`, `joinHouse(code, password, displayName)`, `leaveHouse(id)`, `removeClosedHouse(id)`, `resetHousePassword(id, password)`, `loadMembers(id)`, `removeHouseMember(id, userId)`

- [ ] **Step 1: Failing tests**

`src/domain/joinCode.test.ts`:

```ts
import { formatJoinCode } from './joinCode';

describe('formatJoinCode', () => {
  it('splits 8 characters with a hyphen and leaves anything else alone', () => {
    expect(formatJoinCode('K7QXM2PA')).toBe('K7QX-M2PA');
    expect(formatJoinCode('ABC')).toBe('ABC');
  });
});
```

`src/domain/syncStatus.test.ts`:

```ts
import { syncStatusLabel, type SyncStatusInput } from './syncStatus';

const base: SyncStatusInput = {
  role: 'owner', published: true, closed: false, phase: 'idle', pending: 0, lastSyncedAt: 1_000_000, now: 1_000_000 + 2 * 60_000,
};

describe('syncStatusLabel', () => {
  it('shows nothing for unpublished houses', () => {
    expect(syncStatusLabel({ ...base, published: false })).toBeNull();
  });

  it('owner states', () => {
    expect(syncStatusLabel(base)).toEqual({ text: 'Synced · 2m ago', tone: 'dim', tappable: false });
    expect(syncStatusLabel({ ...base, phase: 'syncing' })?.text).toBe('Syncing…');
    expect(syncStatusLabel({ ...base, phase: 'offline', pending: 3 })).toEqual({ text: 'Offline · 3 changes waiting', tone: 'warn', tappable: true });
    expect(syncStatusLabel({ ...base, phase: 'offline', pending: 1 })?.text).toBe('Offline · 1 change waiting');
    expect(syncStatusLabel({ ...base, phase: 'error' })).toEqual({ text: 'Sync failed · tap to retry', tone: 'error', tappable: true });
    expect(syncStatusLabel({ ...base, pending: 2 })).toEqual({ text: '2 changes waiting', tone: 'dim', tappable: true });
    expect(syncStatusLabel({ ...base, lastSyncedAt: null })?.text).toBe('Not synced yet');
  });

  it('reader states', () => {
    const r = { ...base, role: 'reader' as const };
    expect(syncStatusLabel(r)).toEqual({ text: 'Updated 2m ago', tone: 'dim', tappable: true });
    expect(syncStatusLabel({ ...r, phase: 'syncing' })?.text).toBe('Updating…');
    expect(syncStatusLabel({ ...r, phase: 'offline' })?.text).toBe('Offline · updated 2m ago');
    expect(syncStatusLabel({ ...r, phase: 'error' })?.text).toBe('Update failed · tap to retry');
    expect(syncStatusLabel({ ...r, closed: true })).toEqual({ text: 'House closed by the owner', tone: 'warn', tappable: false });
  });

  it('formats age', () => {
    const at = (ms: number) => syncStatusLabel({ ...base, now: base.lastSyncedAt! + ms })?.text;
    expect(at(10_000)).toBe('Synced · just now');
    expect(at(3 * 3_600_000)).toBe('Synced · 3h ago');
    expect(at(2 * 86_400_000)).toBe('Synced · 2d ago');
  });
});
```

`src/store/syncActions.test.ts`:

```ts
jest.mock('@/sync/push', () => ({ pushHouse: jest.fn() }));
jest.mock('@/sync/pull', () => ({ pullHouse: jest.fn() }));

import { createTestDb } from '../../test/nodeDb';
import { setDb } from '@/db/connection';
import { getCurrentHouseId } from '@/repo/houses';
import { markPublished } from '@/repo/sync';
import { setSyncClient } from '@/sync/registry';
import { pushHouse } from '@/sync/push';
import { reloadAll } from './houseActions';
import { PUSH_DEBOUNCE_MS, schedulePush, syncHouse } from './syncActions';
import { useSyncStore } from './useSyncStore';

const push = pushHouse as jest.Mock;

describe('syncActions', () => {
  let houseId: string;

  beforeEach(() => {
    jest.useFakeTimers();
    const db = createTestDb();
    setDb(db);
    reloadAll();
    houseId = getCurrentHouseId(db);
    markPublished(db, houseId, 'ABCDEFGH'); // My House starts dirty, so it has pending rows
    setSyncClient({} as never);
    push.mockReset();
    useSyncStore.setState({ byHouse: {}, pending: {} });
  });

  afterEach(() => {
    jest.useRealTimers();
    setSyncClient(null);
  });

  it('debounces bursts of writes into one push', async () => {
    push.mockResolvedValue(1);
    schedulePush();
    schedulePush();
    schedulePush();
    expect(push).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(PUSH_DEBOUNCE_MS);
    expect(push).toHaveBeenCalledTimes(1);
    expect(useSyncStore.getState().byHouse[houseId]).toEqual({ phase: 'idle', message: null });
  });

  it('marks the house offline and keeps changes waiting when the network fails', async () => {
    push.mockRejectedValue(new TypeError('Network request failed'));
    await syncHouse(houseId);
    expect(useSyncStore.getState().byHouse[houseId]).toEqual({ phase: 'offline', message: "You're offline" });
    expect(useSyncStore.getState().pending[houseId]).toBeGreaterThan(0);
  });

  it('shares one in-flight sync per house', async () => {
    let release!: () => void;
    push.mockImplementation(() => new Promise<number>((r) => (release = () => r(1))));
    const a = syncHouse(houseId);
    const b = syncHouse(houseId);
    release();
    await Promise.all([a, b]);
    expect(push).toHaveBeenCalledTimes(1);
  });

  it('does nothing without a client', async () => {
    setSyncClient(null);
    await syncHouse(houseId);
    expect(push).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx jest src/domain/joinCode.test.ts src/domain/syncStatus.test.ts src/store/syncActions.test.ts`
Expected: FAIL (modules missing).

- [ ] **Step 3: Pure helpers**

`src/domain/joinCode.ts`:

```ts
/** "K7QXM2PA" → "K7QX-M2PA" for display. The server accepts any case, spaces or hyphens. */
export function formatJoinCode(code: string): string {
  return code.length === 8 ? `${code.slice(0, 4)}-${code.slice(4)}` : code;
}
```

`src/domain/syncStatus.ts`:

```ts
import type { HouseRole } from './types';

export type SyncPhase = 'idle' | 'syncing' | 'offline' | 'error';

export interface SyncStatusInput {
  role: HouseRole;
  published: boolean;
  closed: boolean;
  phase: SyncPhase;
  pending: number;
  lastSyncedAt: number | null;
  now: number;
}

export interface SyncStatus {
  text: string;
  tone: 'dim' | 'warn' | 'error';
  /** Tapping retries the sync. */
  tappable: boolean;
}

function ago(from: number, now: number): string {
  const s = Math.max(0, Math.floor((now - from) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const changes = (n: number) => `${n} change${n === 1 ? '' : 's'} waiting`;

/** The one-line status under the house name (spec §3.4). */
export function syncStatusLabel(i: SyncStatusInput): SyncStatus | null {
  if (!i.published) return null;
  if (i.closed) return { text: 'House closed by the owner', tone: 'warn', tappable: false };
  const when = i.lastSyncedAt === null ? null : ago(i.lastSyncedAt, i.now);

  if (i.role === 'owner') {
    switch (i.phase) {
      case 'syncing':
        return { text: 'Syncing…', tone: 'dim', tappable: false };
      case 'offline':
        return { text: i.pending > 0 ? `Offline · ${changes(i.pending)}` : 'Offline', tone: 'warn', tappable: true };
      case 'error':
        return { text: 'Sync failed · tap to retry', tone: 'error', tappable: true };
      default:
        if (i.pending > 0) return { text: changes(i.pending), tone: 'dim', tappable: true };
        return { text: when ? `Synced · ${when}` : 'Not synced yet', tone: 'dim', tappable: false };
    }
  }

  switch (i.phase) {
    case 'syncing':
      return { text: 'Updating…', tone: 'dim', tappable: false };
    case 'offline':
      return { text: when ? `Offline · updated ${when}` : 'Offline', tone: 'warn', tappable: true };
    case 'error':
      return { text: 'Update failed · tap to retry', tone: 'error', tappable: true };
    default:
      return { text: when ? `Updated ${when}` : 'Not updated yet', tone: 'dim', tappable: true };
  }
}
```

- [ ] **Step 4: `src/store/useSyncStore.ts`**

```ts
import { create } from 'zustand';
import type { SyncPhase } from '@/domain/syncStatus';

export interface HouseSync {
  phase: SyncPhase;
  message: string | null;
}

interface SyncState {
  byHouse: Record<string, HouseSync>;
  /** Dirty rows waiting to push, per house (owner houses only). */
  pending: Record<string, number>;
  setPhase(houseId: string, phase: SyncPhase, message?: string | null): void;
  setPending(houseId: string, n: number): void;
}

export const useSyncStore = create<SyncState>((set) => ({
  byHouse: {},
  pending: {},
  setPhase: (houseId, phase, message = null) => set((s) => ({ byHouse: { ...s.byHouse, [houseId]: { phase, message } } })),
  setPending: (houseId, n) => set((s) => (s.pending[houseId] === n ? s : { pending: { ...s.pending, [houseId]: n } })),
}));
```

- [ ] **Step 5: `src/store/syncActions.ts`**

```ts
import { Alert, AppState } from 'react-native';
import { getDb } from '@/db/connection';
import * as housesRepo from '@/repo/houses';
import * as syncRepo from '@/repo/sync';
import { describeSyncError } from '@/sync/errors';
import { joinByCode, type JoinOutcome } from '@/sync/join';
import { savePassword } from '@/sync/passwords';
import { pullHouse } from '@/sync/pull';
import { publishHouse } from '@/sync/publish';
import { pushHouse } from '@/sync/push';
import { getSyncClient, requireSyncClient } from '@/sync/registry';
import { ensureSession, listMembers, rpcLeaveHouse, rpcRemoveMember, rpcResetPassword, type Member } from '@/sync/remote';
import { reloadAll } from './houseActions';
import { useHousesStore } from './useHousesStore';
import { usePlayersStore } from './usePlayersStore';
import { useSessionsStore } from './useSessionsStore';
import { useSyncStore } from './useSyncStore';

export const PUSH_DEBOUNCE_MS = 2000;

export function refreshPending(): void {
  const db = getDb();
  const { setPending } = useSyncStore.getState();
  for (const h of syncRepo.listSyncHouses(db)) if (h.role === 'owner') setPending(h.id, syncRepo.pendingCount(db, h.id));
}

const inflight = new Map<string, Promise<void>>();

/** Push (owner) or pull (reader) one published house. Concurrent calls for the same house share one run. */
export function syncHouse(houseId: string): Promise<void> {
  const running = inflight.get(houseId);
  if (running) return running;
  const p = runSync(houseId).finally(() => inflight.delete(houseId));
  inflight.set(houseId, p);
  return p;
}

async function runSync(houseId: string): Promise<void> {
  const client = getSyncClient();
  if (!client) return;
  const db = getDb();
  const h = syncRepo.getSyncHouse(db, houseId);
  if (!h || !h.published) return;
  const sync = useSyncStore.getState();
  sync.setPhase(houseId, 'syncing');
  try {
    if (h.role === 'owner') {
      await pushHouse(db, client, houseId);
      syncRepo.setLastSynced(db, houseId);
    } else {
      const result = await pullHouse(db, client, houseId);
      if (result === 'removed') {
        syncRepo.purgeHouse(db, houseId);
        reloadAll();
        Alert.alert('Removed from house', `You no longer have access to "${h.name}".`);
      } else if (houseId === useHousesStore.getState().currentHouseId) {
        reloadAll();
      }
    }
    useSyncStore.getState().setPhase(houseId, 'idle');
  } catch (e) {
    const d = describeSyncError(e);
    useSyncStore.getState().setPhase(houseId, d.kind, d.message);
  } finally {
    refreshPending();
    useHousesStore.getState().load(); // lastSyncedAt / closed
  }
}

export async function pushDirtyHouses(): Promise<void> {
  const db = getDb();
  for (const h of syncRepo.listSyncHouses(db)) {
    if (h.role === 'owner' && syncRepo.pendingCount(db, h.id) > 0) await syncHouse(h.id);
  }
}

/** Every published house, current first. */
export async function syncAll(): Promise<void> {
  const current = useHousesStore.getState().currentHouseId;
  const houses = syncRepo.listSyncHouses(getDb()).sort((a, b) => Number(b.id === current) - Number(a.id === current));
  for (const h of houses) await syncHouse(h.id);
}

let timer: ReturnType<typeof setTimeout> | null = null;

/** Called after local writes: push 2 s after the last one (spec §3.1). */
export function schedulePush(): void {
  refreshPending();
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void pushDirtyHouses();
  }, PUSH_DEBOUNCE_MS);
}

const houseSignature = (s: ReturnType<typeof useHousesStore.getState>) =>
  s.houses.map((h) => `${h.id}:${h.updatedAt}`).join('|');

/**
 * Wires sync into the app. Store changes that come from local writes schedule a push; switching house
 * or returning to the foreground syncs. Sync's own reloads do not change house `updatedAt`, so a failing
 * push cannot loop. Returns an unsubscribe function.
 */
export function startSync(): () => void {
  const unsubs = [
    useSessionsStore.subscribe((s, prev) => {
      if (s.summaries !== prev.summaries) schedulePush();
    }),
    usePlayersStore.subscribe((s, prev) => {
      if (s.players !== prev.players) schedulePush();
    }),
    useHousesStore.subscribe((s, prev) => {
      if (s.currentHouseId && s.currentHouseId !== prev.currentHouseId) void syncHouse(s.currentHouseId);
      if (houseSignature(s) !== houseSignature(prev)) schedulePush();
    }),
  ];
  const app = AppState.addEventListener('change', (state) => {
    if (state === 'active') void syncAll();
  });
  refreshPending();
  void syncAll();
  return () => {
    unsubs.forEach((u) => u());
    app.remove();
  };
}

// UI actions ------------------------------------------------------------------------------------

export async function shareHouse(houseId: string, password: string): Promise<{ joinCode: string }> {
  const client = requireSyncClient();
  const { joinCode } = await publishHouse(getDb(), client, houseId, password);
  await savePassword(houseId, password);
  useHousesStore.getState().load();
  refreshPending();
  return { joinCode };
}

export async function joinHouse(code: string, password: string, displayName: string | null): Promise<JoinOutcome> {
  const db = getDb();
  const r = await joinByCode(db, requireSyncClient(), code, password, displayName?.trim() || null);
  if (r.ok) {
    housesRepo.setCurrentHouse(db, r.houseId);
    reloadAll();
  }
  return r;
}

export async function leaveHouse(houseId: string): Promise<void> {
  await rpcLeaveHouse(requireSyncClient(), houseId);
  syncRepo.purgeHouse(getDb(), houseId);
  reloadAll();
}

export function removeClosedHouse(houseId: string): void {
  syncRepo.purgeHouse(getDb(), houseId);
  reloadAll();
}

export async function resetHousePassword(houseId: string, password: string): Promise<void> {
  await rpcResetPassword(requireSyncClient(), houseId, password);
  await savePassword(houseId, password);
}

export async function loadMembers(houseId: string): Promise<{ me: string; members: Member[] }> {
  const client = requireSyncClient();
  const me = await ensureSession(client);
  return { me, members: await listMembers(client, houseId) };
}

/** The removed reader's old link stops working; they can still rejoin with the code and password until it is reset. */
export async function removeHouseMember(houseId: string, userId: string): Promise<void> {
  await rpcRemoveMember(requireSyncClient(), houseId, userId);
}

```

- [ ] **Step 6: Wire into `_layout.tsx`**

In `src/app/_layout.tsx`:

```ts
import { createAppSyncClient } from '@/sync/client';
import { setSyncClient } from '@/sync/registry';
import { startSync } from '@/store/syncActions';
```

Inside the existing startup `useEffect`, right after `reloadAll(); setReady(true);`:

```ts
      setSyncClient(createAppSyncClient());
```

Add a second effect that starts sync once the app is ready:

```ts
  useEffect(() => {
    if (!ready) return;
    return startSync();
  }, [ready]);
```

- [ ] **Step 7: Run the tests**

Run: `npx jest src/domain src/store` and then the full `npx jest`. All pass, including the unchanged `src/store/stores.test.ts`. Then run `npx tsc --noEmit` and the export.

- [ ] **Step 8: Commit**

```bash
git add src/domain/syncStatus.ts src/domain/syncStatus.test.ts src/domain/joinCode.ts src/domain/joinCode.test.ts src/store/useSyncStore.ts src/store/syncActions.ts src/store/syncActions.test.ts src/app/_layout.tsx
git commit -m "feat(sync): sync store, status text, debounced push, sync on open and switch

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: House settings: share, code, password, members, leave, closed

**Files:**
- Modify: `src/app/houses/[id].tsx`, `src/app/houses/new.tsx` (name `maxLength={60}`)

**Interfaces:**
- Consumes these `syncActions`: `shareHouse`, `resetHousePassword`, `loadMembers`, `removeHouseMember`, `leaveHouse`, `removeClosedHouse`, `syncHouse`.
- Consumes `loadPassword`, `formatJoinCode`, `copyToClipboard` (`@/share`), `useSyncStore`, `getSyncClient`.

Behaviour (spec §4, §2.6, §7):

| Who | Sees |
|---|---|
| Owner, unpublished | Name, currency, Save (as today). A **Share with friends** section: password field (secure, ≥ 4 chars) and **Share house**. The button is disabled with the caption "Sharing isn't set up in this build" when `getSyncClient()` is null. On success, an Alert shows the code: "Shared. Join code K7QX-M2PA. Friends need the code and your password." |
| Owner, published | Name, currency, Save. **Sharing** section: join code (large, formatted) with **Copy code**. Password shown as `••••` with **Show** and **Copy** (from secure store); if missing: "Not saved on this phone. Reset it below." **Reset password** field and button. **Members** list, loaded on mount: display name or "Anonymous member", role pill, "joined <date>". Readers have **Remove** (confirm: "They lose access now. To keep them out, also reset the password."); the owner row has none. **Sync now** button. The dev "Preview as reader" switch and **Delete house** as today (Delete caption for published houses: "Friends will see it as closed."). |
| Reader | Name and currency read-only, "Only the owner can change this house.", **Leave house** (danger; confirm "You'll lose your copy of this house on this phone.") |
| Reader, closed house | Banner (warn) "The owner closed this house." and **Remove from this phone** (danger; purges locally, no network). |

Errors from any action go through `toastError(new Error(describeSyncError(e).message))`. Buttons show a busy label ("Sharing…", "Resetting…", "Leaving…") and are disabled while busy.

- [ ] **Step 1: Implement**

Replace `src/app/houses/[id].tsx` with:

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Banner, Body, Button, Caption, Divider, NavHeader, Overline, Pill, Row, Screen, toastError } from '@/components/ui';
import { useHousesStore } from '@/store/useHousesStore';
import { deleteHouse, renameHouse, setHouseCurrency } from '@/store/houseActions';
import {
  leaveHouse, loadMembers, removeClosedHouse, removeHouseMember, resetHousePassword, shareHouse, syncHouse,
} from '@/store/syncActions';
import { getSyncClient } from '@/sync/registry';
import { loadPassword } from '@/sync/passwords';
import { describeSyncError } from '@/sync/errors';
import type { Member } from '@/sync/remote';
import type { House } from '@/domain/types';
import { formatJoinCode } from '@/domain/joinCode';
import { copyToClipboard } from '@/share';
import { formatDate } from '@/date';
import { colors, radius, space, textStyles } from '@/theme';

const MIN_PASSWORD = 4;
const fail = (e: unknown) => toastError(new Error(describeSyncError(e).message));

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

  const isOwner = house.role === 'owner';
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
    Alert.alert(
      `Delete "${house.name}"?`,
      house.published
        ? 'Its players and nights are deleted too. Friends will see it as closed. This cannot be undone.'
        : 'Its players and nights are deleted too. This cannot be undone.',
      [
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
      ],
    );

  return (
    <Screen scroll>
      <NavHeader title="House" onBack={() => router.back()} />

      {house.closed ? <Banner kind="warn" text="The owner closed this house." style={{ marginBottom: space.lg }} /> : null}

      <Overline style={{ marginBottom: space.sm }}>Name</Overline>
      {isOwner ? (
        <TextInput value={name} onChangeText={setName} style={s.input} returnKeyType="done" maxLength={60} />
      ) : (
        <Body>{house.name}</Body>
      )}

      <Overline style={{ marginTop: space.lg, marginBottom: space.sm }}>Currency symbol</Overline>
      {isOwner ? (
        <TextInput value={currency} onChangeText={setCurrency} style={[s.input, { width: 96 }]} maxLength={3} autoCapitalize="none" />
      ) : (
        <Body>{house.currencySymbol}</Body>
      )}

      {isOwner ? (
        <>
          <Button label="Save" size="md" onPress={save} disabled={!changed} style={{ marginTop: space.lg }} />

          {house.published ? <SharingSection house={house} /> : <ShareSection house={house} />}

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
        </>
      ) : (
        <ReaderSection house={house} onGone={() => router.back()} />
      )}
    </Screen>
  );
}

/** Owner, not yet published: pick a password and publish. */
function ShareSection({ house }: { house: House }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const available = getSyncClient() !== null;

  const share = async () => {
    setBusy(true);
    try {
      const { joinCode } = await shareHouse(house.id, password);
      Alert.alert('Shared', `Join code ${formatJoinCode(joinCode)}. Friends need the code and your password.`);
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Overline style={s.section}>Share with friends</Overline>
      <Caption style={{ marginBottom: space.sm }}>
        Friends who join can see this house's nights and balances. Only you can edit.
      </Caption>
      <TextInput
        value={password}
        onChangeText={setPassword}
        style={s.input}
        placeholder={`Password (at least ${MIN_PASSWORD} characters)`}
        placeholderTextColor={colors.textMuted}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Button
        label={busy ? 'Sharing…' : 'Share house'}
        size="md"
        onPress={() => void share()}
        disabled={!available || busy || password.length < MIN_PASSWORD}
        style={{ marginTop: space.md }}
      />
      {!available ? (
        <Caption tone="muted" style={{ marginTop: space.sm }}>
          Sharing isn't set up in this build.
        </Caption>
      ) : null}
    </>
  );
}

/** Owner, published: code, password, members, sync now. */
function SharingSection({ house }: { house: House }) {
  const [saved, setSaved] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [resetting, setResetting] = useState(false);
  const [members, setMembers] = useState<{ me: string; members: Member[] } | null>(null);

  useEffect(() => {
    void loadPassword(house.id).then(setSaved);
  }, [house.id]);

  const reloadMembers = useCallback(() => {
    loadMembers(house.id).then(setMembers, fail);
  }, [house.id]);
  useEffect(reloadMembers, [reloadMembers]);

  const copy = async (text: string, what: string) => {
    try {
      await copyToClipboard(text);
      Alert.alert('Copied', `${what} copied to the clipboard.`);
    } catch (e) {
      toastError(e);
    }
  };

  const reset = async () => {
    setResetting(true);
    try {
      await resetHousePassword(house.id, newPassword);
      setSaved(newPassword);
      setNewPassword('');
      Alert.alert('Password reset', 'Anyone joining now needs the new password. Current members stay.');
    } catch (e) {
      fail(e);
    } finally {
      setResetting(false);
    }
  };

  const confirmRemove = (m: Member) =>
    Alert.alert(`Remove ${m.display_name ?? 'this member'}?`, 'They lose access now. To keep them out, also reset the password.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => removeHouseMember(house.id, m.user_id).then(reloadMembers, fail),
      },
    ]);

  return (
    <>
      <Overline style={s.section}>Sharing</Overline>
      <Caption>Join code</Caption>
      <Row style={{ marginTop: space.xs }}>
        <Text style={s.code}>{house.joinCode ? formatJoinCode(house.joinCode) : '—'}</Text>
        <View style={{ flex: 1 }} />
        {house.joinCode ? (
          <Button label="Copy code" variant="secondary" size="md" onPress={() => void copy(house.joinCode!, 'Join code')} />
        ) : null}
      </Row>

      <Caption style={{ marginTop: space.lg }}>Password</Caption>
      {saved ? (
        <Row style={{ marginTop: space.xs }}>
          <Body style={{ flex: 1 }}>{shown ? saved : '••••••'}</Body>
          <Button label={shown ? 'Hide' : 'Show'} variant="ghost" size="md" onPress={() => setShown(!shown)} />
          <Button label="Copy" variant="secondary" size="md" onPress={() => void copy(saved, 'Password')} style={{ marginLeft: space.sm }} />
        </Row>
      ) : (
        <Caption tone="muted" style={{ marginTop: space.xs }}>
          Not saved on this phone. Reset it below.
        </Caption>
      )}

      <TextInput
        value={newPassword}
        onChangeText={setNewPassword}
        style={[s.input, { marginTop: space.md }]}
        placeholder="New password"
        placeholderTextColor={colors.textMuted}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Button
        label={resetting ? 'Resetting…' : 'Reset password'}
        variant="secondary"
        size="md"
        onPress={() => void reset()}
        disabled={resetting || newPassword.length < MIN_PASSWORD}
        style={{ marginTop: space.sm }}
      />

      <Overline style={s.section}>Members</Overline>
      <View style={s.panel}>
        {members === null ? (
          <Caption style={s.memberRow}>Loading…</Caption>
        ) : (
          members.members.map((m, i) => (
            <View key={m.user_id}>
              {i > 0 ? <Divider /> : null}
              <Row style={s.memberRow}>
                <View style={{ flex: 1 }}>
                  <Body numberOfLines={1}>{m.user_id === members.me ? 'You' : m.display_name ?? 'Anonymous member'}</Body>
                  <Caption tone="muted">joined {formatDate(m.joined_at.slice(0, 10))}</Caption>
                </View>
                <Pill label={m.role === 'owner' ? 'Owner' : 'Viewer'} tone={m.role === 'owner' ? 'default' : 'muted'} />
                {m.role === 'reader' ? (
                  <Button label="Remove" variant="ghost" size="md" onPress={() => confirmRemove(m)} style={{ marginLeft: space.sm }} />
                ) : null}
              </Row>
            </View>
          ))
        )}
      </View>

      <Button label="Sync now" variant="secondary" size="md" onPress={() => void syncHouse(house.id)} style={{ marginTop: space.lg }} />
    </>
  );
}

/** Reader: leave, or remove a closed house. */
function ReaderSection({ house, onGone }: { house: House; onGone: () => void }) {
  const [busy, setBusy] = useState(false);

  const leave = () =>
    Alert.alert(`Leave "${house.name}"?`, "You'll lose your copy of this house on this phone.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await leaveHouse(house.id);
            onGone();
          } catch (e) {
            fail(e);
          } finally {
            setBusy(false);
          }
        },
      },
    ]);

  const remove = () => {
    removeClosedHouse(house.id);
    onGone();
  };

  return (
    <>
      <Caption tone="muted" style={{ marginTop: space.lg }}>
        Only the owner can change this house.
      </Caption>
      {house.closed ? (
        <Button label="Remove from this phone" variant="danger" size="md" onPress={remove} style={{ marginTop: space.xxl }} />
      ) : (
        <Button
          label={busy ? 'Leaving…' : 'Leave house'}
          variant="danger"
          size="md"
          onPress={leave}
          disabled={busy}
          style={{ marginTop: space.xxl }}
        />
      )}
    </>
  );
}

const s = StyleSheet.create({
  section: { marginTop: space.xl, marginBottom: space.sm },
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
  code: { ...textStyles.headlineMd, color: colors.text, letterSpacing: 2 },
  panel: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  memberRow: { paddingHorizontal: space.md, paddingVertical: space.md },
});
```

In `src/app/houses/new.tsx`, add `maxLength={60}` to the name `TextInput`.

- [ ] **Step 2: Verify**

Run `npx jest`, `npx tsc --noEmit` and the export.

This screen has no component tests. Read through every branch in the table above against the code before committing, and list them in the report.

- [ ] **Step 3: Commit**

```bash
git add "src/app/houses/[id].tsx" src/app/houses/new.tsx
git commit -m "feat(houses): share house, join code, password, members, leave and closed states

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```


---

### Task 7: Join screen, entry points, status line, pull-to-refresh

**Files:**
- Create: `src/app/houses/join.tsx`, `src/components/SyncStatusLine.tsx`
- Modify: `src/components/HouseBar.tsx`, `src/components/HouseSwitcherSheet.tsx`, `src/components/ui.tsx`, `src/app/(tabs)/index.tsx`, `src/app/(tabs)/history.tsx`

**Interfaces:**
- Consumes `joinHouse`, `syncHouse`, `syncStatusLabel`, `useSyncStore`, `useCurrentHouse`, `getSyncClient`.
- `Screen` gains `refreshing?: boolean; onRefresh?: () => void`. They only apply when `scroll` is set.

- [ ] **Step 1: `Screen` pull-to-refresh**

In `src/components/ui.tsx`, add `RefreshControl` to the react-native import. Add the props `refreshing?: boolean; onRefresh?: () => void` to `Screen`, and on the ScrollView set:

```tsx
refreshControl={
  onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.accent} /> : undefined
}
```

- [ ] **Step 2: `SyncStatusLine` and `HouseBar`**

`src/components/SyncStatusLine.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { Pressable, Text } from 'react-native';
import type { House } from '@/domain/types';
import { syncStatusLabel } from '@/domain/syncStatus';
import { useSyncStore } from '@/store/useSyncStore';
import { syncHouse } from '@/store/syncActions';
import { colors, space, textStyles } from '@/theme';

/** "Synced · 2m ago" / "Offline · 3 changes waiting" / "Updated 5m ago" under the house name (spec §3.4). */
export function SyncStatusLine({ house }: { house: House }) {
  const phase = useSyncStore((s) => s.byHouse[house.id]?.phase ?? 'idle');
  const pending = useSyncStore((s) => s.pending[house.id] ?? 0);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const status = syncStatusLabel({
    role: house.role, published: house.published, closed: house.closed, phase, pending, lastSyncedAt: house.lastSyncedAt, now,
  });
  if (!status) return null;
  const color = { dim: colors.textMuted, warn: colors.orange, error: colors.neg }[status.tone];
  const text = <Text style={[textStyles.bodySm, { color, marginTop: space.xs }]}>{status.text}</Text>;
  return status.tappable ? (
    <Pressable accessibilityRole="button" accessibilityLabel={`${status.text}. Sync now`} onPress={() => void syncHouse(house.id)}>
      {text}
    </Pressable>
  ) : (
    text
  );
}
```

In `HouseBar`, wrap the existing Pressable and the sheet in a `View` that has the `style` prop. Render `<SyncStatusLine house={house} />` under the Pressable, and move `style` from the Pressable to the wrapper.

- [ ] **Step 3: Join screen**

`src/app/houses/join.tsx`:

```tsx
import React, { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import { Banner, Button, Caption, NavHeader, Overline, Screen } from '@/components/ui';
import { joinHouse } from '@/store/syncActions';
import { getSyncClient } from '@/sync/registry';
import { describeSyncError } from '@/sync/errors';
import { colors, radius, space, textStyles } from '@/theme';

export default function JoinHouseScreen() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const available = getSyncClient() !== null;
  const ready = code.replace(/[^A-Za-z0-9]/g, '').length === 8 && password.length > 0;

  const submit = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const r = await joinHouse(code, password, name);
      if (r.ok) {
        router.dismissTo('/');
        return;
      }
      setProblem(r.error === 'locked' ? `Too many tries. Try again in ${r.minutes} min.` : 'Code or password incorrect.');
    } catch (e) {
      setProblem(describeSyncError(e).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen scroll>
      <NavHeader title="Join a house" onBack={() => router.back()} />
      {!available ? <Banner kind="warn" text="Sharing isn't set up in this build." style={{ marginBottom: space.md }} /> : null}
      {problem ? <Banner kind="warn" text={problem} style={{ marginBottom: space.md }} /> : null}

      <Overline style={s.label}>Join code</Overline>
      <TextInput
        value={code}
        onChangeText={setCode}
        style={s.input}
        placeholder="K7QX-M2PA"
        placeholderTextColor={colors.textMuted}
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={9}
      />
      <Overline style={s.label}>Password</Overline>
      <TextInput value={password} onChangeText={setPassword} style={s.input} secureTextEntry autoCapitalize="none" autoCorrect={false} />
      <Overline style={s.label}>Your name (optional)</Overline>
      <TextInput value={name} onChangeText={setName} style={s.input} maxLength={40} placeholder="Shown to the owner" placeholderTextColor={colors.textMuted} />
      <Caption tone="muted" style={{ marginTop: space.sm }}>
        Ask the owner for the code and password. You'll see their nights and balances; only they can edit.
      </Caption>

      <Button
        label={busy ? 'Joining…' : 'Join house'}
        onPress={() => void submit()}
        disabled={!available || !ready || busy}
        style={{ marginTop: space.xl }}
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  label: { marginTop: space.lg, marginBottom: space.sm },
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

Confirm `router.dismissTo('/')` exists in expo-router for SDK 57 (Expo docs). If it doesn't, use `router.replace('/')`. Confirm `Banner` accepts `kind="warn"`. It does: `'info' | 'warn' | 'success'`.

- [ ] **Step 4: Entry points**

- In `HouseSwitcherSheet`, below "+ New house", add a `secondary`/`md` button "Join house" that closes the sheet and runs `router.push('/houses/join')`, styled the same way as "+ New house".
- On Home (`src/app/(tabs)/index.tsx`), inside the "Ready to deal?" card when `!hasNights`, add under Start New Night: `<Button label="Join a friend's house" variant="secondary" onPress={() => router.push('/houses/join')} style={{ marginTop: space.sm }} />`.
- On both Home and History (every `Screen scroll` the screen renders, including History's empty state), pass pull-to-refresh:

```tsx
const house = useCurrentHouse();
const syncing = useSyncStore((s) => (house ? s.byHouse[house.id]?.phase === 'syncing' : false));
const onRefresh = house?.published ? () => void syncHouse(house.id) : undefined;
// <Screen scroll refreshing={syncing} onRefresh={onRefresh}>
```

- [ ] **Step 5: Verify**

Run `npx jest`, `npx tsc --noEmit` and the export.

- [ ] **Step 6: Commit**

```bash
git add src/app/houses/join.tsx src/components/SyncStatusLine.tsx src/components/HouseBar.tsx src/components/HouseSwitcherSheet.tsx src/components/ui.tsx "src/app/(tabs)/index.tsx" "src/app/(tabs)/history.tsx"
git commit -m "feat(houses): join by code, sync status line, pull to refresh

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Hosted env, device check, handoff (needs Steven)

The controller runs the local steps and asks Steven for the rest.

**Files:**
- Modify: `docs/superpowers/handoffs/2026-09-24-shared-houses-handoff.md`

- [ ] **Step 1: Full local verification**

```bash
supabase start
npm run test:sync
npx jest
npx tsc --noEmit
```

Also run the iOS export. All must pass.

- [ ] **Step 2: Steven sets the env**

1. Steven copies `.env.example` to `.env.local` and fills in the hosted Project URL and publishable key (Dashboard → Project Settings → API). The controller must not read the file's values back into chat.
2. For builds, Steven (or the controller, with Steven's yes) runs:

```bash
eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL --value <url> --visibility plaintext
eas env:create --environment production --name EXPO_PUBLIC_SUPABASE_KEY --value <publishable key> --visibility plaintext
```

Check the exact flags with `eas env:create --help` first.

- [ ] **Step 3: Device check in Expo Go** (two phones or one phone plus a friend)

Run `npx expo start`, then check:
1. Share a house, and see the code.
2. On a second phone, join by code, and see the same nights and balances.
3. The owner adds a rebuy. After about 2 s the owner shows "Synced". The reader pulls to refresh and sees it.
4. Airplane mode on the owner, add a night, see "Offline · N changes waiting". Reconnect, tap the status line, see "Synced".
5. The reader leaves, and the house disappears from their phone.
6. The owner removes a member. That member's next pull says "Removed from house".
7. The owner deletes a published house. The reader sees "House closed by the owner" and can remove it.

Expo Go uses its own database, so this does not touch the TestFlight data.

- [ ] **Step 4: Update the handoff**

Mark phase 3 done: branch, commits, and what was verified on device. List what phase 4 needs:
- invite links: `reset_house_link`, `.well-known`, the `/houses/join` prefill;
- invite text;
- the network-regained trigger, if wanted.

Then commit:

```bash
git add docs/superpowers/handoffs/2026-09-24-shared-houses-handoff.md
git commit -m "docs: phase 3 done, phase 4 notes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Do not merge or push without Steven's go-ahead.

---

## Spec coverage check

| Spec item | Task |
|---|---|
| §2.1 anonymous sign-in, created lazily; session persisted on the device | 2 (client), 3 (`ensureSession`, called by publish/join) |
| §2.2 Share house: password → `create_house` → published → push; password kept in secure store | 3 (`publishHouse`), 5 (`shareHouse` saves password), 6 (UI) |
| §2.3 Join by code, same error for a wrong code or password, lockout message | 4 (`joinByCode`), 7 (screen) |
| §2.6 Owner: show code, reset password, member list with remove, rename, delete. Reader: Leave | 6 (reset link and copy invite are phase 4) |
| §3.1 Dirty outbox, push 2 s after the last write, push on foreground, FK order, clean only if unchanged, failures stay dirty | 1, 3, 5 (network-regained trigger dropped: Decision 1) |
| §3.2 Pull on open, on house switch and on pull-to-refresh; removed/closed first; paging and cursor; soft deletes; idempotent | 4, 5, 7 |
| §3.4 Status line | 5 (`syncStatusLabel`), 7 (`SyncStatusLine`) |
| §4 `/houses/join`, switcher "Join house", fresh-install "Join a house" | 7 (Home empty state stands in for the fresh-install prompt) |
| §6.1 Jest: push with dirty/`updated_at`, pull paging/cursor/soft delete/idempotent, `useCanEdit` unchanged | 1, 3, 4 (against the real local stack instead of a fake client) |
| §6.3 Device checks | 8 |
| §7 Errors: offline, push failed, removed, house closed, wrong code or password, lockout | 3 (`describeSyncError`), 5, 6, 7 |
