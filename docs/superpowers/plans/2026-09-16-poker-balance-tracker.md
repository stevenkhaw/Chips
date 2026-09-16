# Poker Balance Tracker ("Chips") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an on-device iOS/Android app that records poker-night buy-ins and cash-outs per player, computes the fewest transfers to settle, and shares a settlement image.

**Architecture:** Expo (React Native + TypeScript) app with Expo Router screens. Pure domain functions (nets, minimal-transfer settlement, chip math, money formatting) are isolated in `src/domain` with no IO. A tiny `Db` interface abstracts SQLite so repositories run against `expo-sqlite` on device and Node's built-in `node:sqlite` in Jest. Zustand stores call repositories and hold UI state.

**Tech Stack:** Expo SDK 57, expo-router, expo-sqlite (sync API), expo-crypto, expo-sharing, react-native-view-shot, @react-native-community/datetimepicker, zustand 5, jest-expo, TypeScript strict. Node 25 (`node:sqlite`) for tests.

**Spec:** `docs/superpowers/specs/2026-09-16-poker-balance-tracker-design.md`

## Global Constraints

- Money is always integer cents (`number`). Never store or compute money as floats.
- Every table has `id TEXT PRIMARY KEY` (UUID v4), `created_at`, `updated_at`, `deleted_at` (ms epoch, nullable). Deletes are soft. All reads filter `deleted_at IS NULL`.
- `src/domain/**` imports nothing from `src/db`, `src/repo`, `src/store`, `src/app`, `src/components`, or any Expo/React package.
- `src/repo/**` is the only place containing SQL.
- Repositories take `db: Db` as first argument. Stores obtain it via `getDb()`.
- Settlement must produce the fewest transfers for ≤ 12 non-zero players (zero-sum subset phase), greedy fallback above that.
- Ties in settlement are broken by input order (player `sort_order`) so identical inputs give identical transfer lists.
- Source lives under `src/`. Expo Router root is `src/app`. Path alias `@/*` → `src/*`.
- Test files live next to the code as `*.test.ts` / `*.test.tsx`; test-only helpers under `test/`.
- Commit after every task with a conventional-commit message ending in the line `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Default settings on first launch: `default_buyin_cents = 2000`, `currency_symbol = "$"`. `chip_denoms` starts empty.
- Deviation from spec, agreed: "swipe to remove player" is implemented as long-press → action sheet (no gesture library). Everything else follows the spec.

---

## File Structure

```
package.json, app.json, tsconfig.json, babel.config.js, jest.config.js, jest.setup.ts
src/
  app/
    _layout.tsx                 Root Stack; opens DB, migrates, hydrates stores, renders children
    index.tsx                   Sessions list (home) + FAB
    new-session.tsx             New Night modal
    session/[id]/index.tsx      Session editor
    session/[id]/settle.tsx     Settlement + share
    players.tsx                 Roster
    settings.tsx                Default buy-in + chip denominations
  components/
    ui.tsx                      Screen, Button, Text variants, Row, Banner, Avatar, Pill (small shared primitives)
    MoneyText.tsx               Colored ± money display
    AmountPad.tsx               Modal numeric entry for cents
    ChipSheet.tsx               Modal chip-count calculator
    PlayerPicker.tsx            Toggle-chip roster picker with inline add
    SessionCard.tsx             Home list card
    PlayerRow.tsx               Session editor row (buy-in pills, cash-out, net)
    ShareCard.tsx               1080px settlement card for capture
  domain/
    types.ts                    Row and aggregate types
    money.ts                    formatCents, parseMoneyInput
    settle.ts                   settle(): two-phase minimal transfers
    nets.ts                     computeRows, summarize (nets, totals, pending, settlement)
    chips.ts                    chipsToCents
  db/
    types.ts                    Db interface
    schema.ts                   MIGRATIONS array + migrate(db)
    connection.ts               setDb / getDb
    expo-adapter.ts             Db over expo-sqlite (imported only from _layout)
    ids.ts                      newId() via expo-crypto
    map.ts                      snake_case row → camelCase object
  repo/
    players.ts
    settings.ts                 settings row + chip_denoms
    sessions.ts                 sessions, session_players, buyins, summaries, detail
  store/
    usePlayersStore.ts
    useSettingsStore.ts
    useSessionsStore.ts
  theme.ts                      colors, spacing, radii
  share.ts                      captureAndShare(ref)
test/
  nodeDb.ts                     Db over node:sqlite, in-memory, for Jest
```

---

### Task 1: Scaffold Expo project with Jest

**Files:**
- Create: whole Expo project at repo root (via `create-expo-app` in a temp dir, then copied in)
- Create: `jest.config.js`, `jest.setup.ts`, `src/app/_layout.tsx`, `src/app/index.tsx`, `src/domain/smoke.test.ts` (deleted in Task 2)
- Modify: `tsconfig.json`, `package.json`, `app.json`, `.gitignore`

**Interfaces:**
- Produces: `npm test` runs Jest with `jest-expo` preset; `npx expo start` boots an app showing "Chips".

- [ ] **Step 1: Generate the template in a temp dir and copy it in**

The repo already contains `.git` and `docs/`, so generate elsewhere then copy.

```bash
cd /Users/stevenkhaw/Documents/GitHub/Chips
npx create-expo-app@latest /tmp/chips-scaffold --template default --no-install
rsync -a --exclude .git /tmp/chips-scaffold/ ./
rm -rf /tmp/chips-scaffold
npm install
```

- [ ] **Step 2: Remove template example screens and set up `src/app`**

```bash
cd /Users/stevenkhaw/Documents/GitHub/Chips
rm -rf app components constants hooks scripts assets/images/react-logo* assets/images/partial-react-logo.png
mkdir -p src/app src/components src/domain src/db src/repo src/store test
```

Create `src/app/_layout.tsx`:

```tsx
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
```

Create `src/app/index.tsx`:

```tsx
import { Text, View } from 'react-native';

export default function Home() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111' }}>
      <Text style={{ color: '#fff', fontSize: 24 }}>Chips</Text>
    </View>
  );
}
```

- [ ] **Step 3: Fix tsconfig alias and app.json**

Replace `tsconfig.json` with:

```json
{
  "extends": "expo/tsconfig.base",
  "compilerOptions": {
    "strict": true,
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["**/*.ts", "**/*.tsx", ".expo/types/**/*.ts", "expo-env.d.ts"]
}
```

In `app.json` set `"name": "Chips"`, `"slug": "chips"`, `"scheme": "chips"`, `"userInterfaceStyle": "dark"`, and under `expo.ios` add `"bundleIdentifier": "com.stevenkhaw.chips"`, under `expo.android` add `"package": "com.stevenkhaw.chips"`. Keep `"plugins": ["expo-router", ...]` as generated. Remove the `experiments.typedRoutes` key if present (keeps routing simple).

- [ ] **Step 4: Install runtime deps**

```bash
npx expo install expo-sqlite expo-crypto expo-sharing react-native-view-shot @react-native-community/datetimepicker
npm install zustand
```

- [ ] **Step 5: Install Jest and configure**

```bash
npx expo install jest-expo jest @types/jest --dev
```

Create `jest.config.js`:

```js
module.exports = {
  preset: 'jest-expo',
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
  testPathIgnorePatterns: ['/node_modules/', '/.expo/'],
};
```

Create `jest.setup.ts`:

```ts
jest.mock('expo-crypto', () => ({
  randomUUID: () => require('crypto').randomUUID(),
}));
```

In `package.json` add `"test": "jest"` to `scripts` and remove any `"jest"` key the template added (config lives in `jest.config.js`).

- [ ] **Step 6: Write a smoke test**

Create `src/domain/smoke.test.ts`:

```ts
test('jest runs', () => {
  expect(1 + 1).toBe(2);
});
```

- [ ] **Step 7: Run tests and start the app once**

Run: `npm test`
Expected: 1 passed.

Run: `npx expo start --ios` (or `npx expo start` and press `i`). Simulator shows "Chips" on dark background. Stop with Ctrl-C.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold Expo app with Jest

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Domain types and money formatting

**Files:**
- Create: `src/domain/types.ts`, `src/domain/money.ts`, `src/domain/money.test.ts`
- Delete: `src/domain/smoke.test.ts`

**Interfaces:**
- Produces:
  - `formatCents(cents: number, symbol?: string): string` → `"$20"`, `"$12.50"`, `"-$7.25"`, `"$0"`.
  - `formatSigned(cents: number, symbol?: string): string` → `"+$20"`, `"-$7.25"`, `"$0"`.
  - `parseMoneyInput(text: string): number | null` → cents or `null` if invalid.
  - All row types below, used by every later task.

- [ ] **Step 1: Create `src/domain/types.ts`**

```ts
export interface BaseRow {
  id: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
}

export interface Player extends BaseRow {
  name: string;
  colorSeed: number;
  archived: boolean;
}

export interface Session extends BaseRow {
  date: string; // YYYY-MM-DD local
  title: string | null;
  defaultBuyinCents: number;
  notes: string | null;
}

export interface SessionPlayer extends BaseRow {
  sessionId: string;
  playerId: string;
  cashoutCents: number | null;
  sortOrder: number;
}

export interface Buyin extends BaseRow {
  sessionPlayerId: string;
  amountCents: number;
  at: number;
}

export interface ChipDenom extends BaseRow {
  label: string;
  colorHex: string;
  valueCents: number;
  sortOrder: number;
}

export interface Settings {
  defaultBuyinCents: number;
  currencySymbol: string;
}

export interface SessionPlayerDetail {
  sp: SessionPlayer;
  player: Player;
  buyins: Buyin[];
}

export interface SessionDetail {
  session: Session;
  players: SessionPlayerDetail[];
}

export interface SessionSummary {
  session: Session;
  playerCount: number;
  topWinner: { name: string; netCents: number } | null;
}
```

- [ ] **Step 2: Write failing tests `src/domain/money.test.ts`**

```ts
import { formatCents, formatSigned, parseMoneyInput } from './money';

describe('formatCents', () => {
  it('drops .00', () => expect(formatCents(2000)).toBe('$20'));
  it('keeps cents', () => expect(formatCents(1250)).toBe('$12.50'));
  it('pads single cent digit', () => expect(formatCents(1205)).toBe('$12.05'));
  it('negative', () => expect(formatCents(-725)).toBe('-$7.25'));
  it('zero', () => expect(formatCents(0)).toBe('$0'));
  it('custom symbol', () => expect(formatCents(500, '€')).toBe('€5'));
});

describe('formatSigned', () => {
  it('positive gets plus', () => expect(formatSigned(2000)).toBe('+$20'));
  it('negative', () => expect(formatSigned(-725)).toBe('-$7.25'));
  it('zero has no sign', () => expect(formatSigned(0)).toBe('$0'));
});

describe('parseMoneyInput', () => {
  it('whole dollars', () => expect(parseMoneyInput('20')).toBe(2000));
  it('decimals', () => expect(parseMoneyInput('12.5')).toBe(1250));
  it('two decimals', () => expect(parseMoneyInput('12.05')).toBe(1205));
  it('strips symbol and spaces', () => expect(parseMoneyInput(' $20 ')).toBe(2000));
  it('rejects three decimals', () => expect(parseMoneyInput('1.234')).toBeNull());
  it('rejects letters', () => expect(parseMoneyInput('abc')).toBeNull());
  it('rejects empty', () => expect(parseMoneyInput('')).toBeNull());
  it('rejects negative', () => expect(parseMoneyInput('-5')).toBeNull());
  it('accepts leading dot', () => expect(parseMoneyInput('.5')).toBe(50));
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm test -- money`
Expected: FAIL, "Cannot find module './money'".

- [ ] **Step 4: Implement `src/domain/money.ts`**

```ts
export function formatCents(cents: number, symbol = '$'): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const dollars = Math.floor(abs / 100);
  const rem = abs % 100;
  const body = rem === 0 ? `${dollars}` : `${dollars}.${rem.toString().padStart(2, '0')}`;
  return `${sign}${symbol}${body}`;
}

export function formatSigned(cents: number, symbol = '$'): string {
  if (cents > 0) return `+${formatCents(cents, symbol)}`;
  return formatCents(cents, symbol);
}

const MONEY_RE = /^(\d*)(?:\.(\d{1,2}))?$/;

export function parseMoneyInput(text: string): number | null {
  const cleaned = text.replace(/[\s$€£,]/g, '');
  if (cleaned === '' || cleaned === '.') return null;
  const m = MONEY_RE.exec(cleaned);
  if (!m) return null;
  const dollars = m[1] === '' ? 0 : parseInt(m[1], 10);
  const centsStr = (m[2] ?? '').padEnd(2, '0');
  const cents = centsStr === '' ? 0 : parseInt(centsStr, 10);
  return dollars * 100 + cents;
}
```

- [ ] **Step 5: Run tests, delete smoke test**

Run: `rm src/domain/smoke.test.ts && npm test`
Expected: all money tests PASS.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(domain): money formatting and parsing

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Settlement algorithm

**Files:**
- Create: `src/domain/settle.ts`, `src/domain/settle.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface Net { playerId: string; netCents: number }
  export interface Transfer { from: string; to: string; amountCents: number }
  export interface SettlementResult { transfers: Transfer[]; discrepancyCents: number }
  export function settle(nets: Net[]): SettlementResult
  ```

- [ ] **Step 1: Write failing tests `src/domain/settle.test.ts`**

```ts
import { settle, Net } from './settle';

const n = (playerId: string, netCents: number): Net => ({ playerId, netCents });

function assertSettles(nets: Net[], transfers: { from: string; to: string; amountCents: number }[]) {
  // applying transfers to nets must zero everyone (when books balance)
  const bal = new Map(nets.map((x) => [x.playerId, x.netCents]));
  for (const t of transfers) {
    bal.set(t.from, (bal.get(t.from) ?? 0) + t.amountCents);
    bal.set(t.to, (bal.get(t.to) ?? 0) - t.amountCents);
  }
  for (const [, v] of bal) expect(v).toBe(0);
}

describe('settle', () => {
  it('empty input', () => {
    expect(settle([])).toEqual({ transfers: [], discrepancyCents: 0 });
  });

  it('single zero player', () => {
    expect(settle([n('a', 0)])).toEqual({ transfers: [], discrepancyCents: 0 });
  });

  it('all zero', () => {
    expect(settle([n('a', 0), n('b', 0)]).transfers).toEqual([]);
  });

  it('two players', () => {
    const r = settle([n('a', 2000), n('b', -2000)]);
    expect(r.transfers).toEqual([{ from: 'b', to: 'a', amountCents: 2000 }]);
    expect(r.discrepancyCents).toBe(0);
  });

  it('one winner, three losers → 3 transfers', () => {
    const nets = [n('w', 6000), n('x', -1000), n('y', -2000), n('z', -3000)];
    const r = settle(nets);
    expect(r.transfers).toHaveLength(3);
    assertSettles(nets, r.transfers);
  });

  it('greedy alone is suboptimal; subset phase finds 3 transfers', () => {
    // A +20, B +15, C -10, D -10, E -15. Greedy gives 4. Optimal: B<-E, then A<-C,D = 3.
    const nets = [n('A', 2000), n('B', 1500), n('C', -1000), n('D', -1000), n('E', -1500)];
    const r = settle(nets);
    expect(r.transfers).toHaveLength(3);
    assertSettles(nets, r.transfers);
    expect(r.transfers).toContainEqual({ from: 'E', to: 'B', amountCents: 1500 });
  });

  it('zero-net players never appear in transfers', () => {
    const r = settle([n('a', 500), n('zero', 0), n('b', -500)]);
    for (const t of r.transfers) {
      expect(t.from).not.toBe('zero');
      expect(t.to).not.toBe('zero');
    }
  });

  it('positive discrepancy (too much cash out) reported, residual not transferred', () => {
    const r = settle([n('a', 3000), n('b', -2000)]);
    expect(r.discrepancyCents).toBe(1000);
    expect(r.transfers).toEqual([{ from: 'b', to: 'a', amountCents: 2000 }]);
  });

  it('negative discrepancy (missing cash) reported', () => {
    const r = settle([n('a', 2000), n('b', -3000)]);
    expect(r.discrepancyCents).toBe(-1000);
    expect(r.transfers).toEqual([{ from: 'b', to: 'a', amountCents: 2000 }]);
  });

  it('13 non-zero players falls back to greedy and still settles', () => {
    const nets: Net[] = [];
    for (let i = 0; i < 12; i++) nets.push(n(`l${i}`, -100 * (i + 1)));
    const total = nets.reduce((s, x) => s + x.netCents, 0);
    nets.push(n('big', -total));
    const r = settle(nets);
    expect(r.discrepancyCents).toBe(0);
    expect(r.transfers.length).toBeLessThanOrEqual(12);
    assertSettles(nets, r.transfers);
  });

  it('deterministic: same input twice gives identical output', () => {
    const nets = [n('a', 1000), n('b', 1000), n('c', -1000), n('d', -1000)];
    expect(settle(nets)).toEqual(settle(nets));
  });

  it('ties broken by input order', () => {
    const r = settle([n('a', 1000), n('b', 1000), n('c', -1000), n('d', -1000)]);
    expect(r.transfers).toEqual([
      { from: 'c', to: 'a', amountCents: 1000 },
      { from: 'd', to: 'b', amountCents: 1000 },
    ]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- settle`
Expected: FAIL, "Cannot find module './settle'".

- [ ] **Step 3: Implement `src/domain/settle.ts`**

```ts
export interface Net {
  playerId: string;
  netCents: number;
}

export interface Transfer {
  from: string;
  to: string;
  amountCents: number;
}

export interface SettlementResult {
  transfers: Transfer[];
  discrepancyCents: number;
}

/** Above this many non-zero players, skip the exact subset search. 2^12 = 4096 masks. */
const SUBSET_LIMIT = 12;

export function settle(nets: Net[]): SettlementResult {
  const discrepancyCents = nets.reduce((s, x) => s + x.netCents, 0);
  let remaining = nets.filter((x) => x.netCents !== 0);
  const transfers: Transfer[] = [];

  if (remaining.length <= SUBSET_LIMIT) {
    for (;;) {
      const subset = findSmallestZeroSubset(remaining);
      if (!subset) break;
      transfers.push(...greedy(subset));
      const used = new Set(subset.map((x) => x.playerId));
      remaining = remaining.filter((x) => !used.has(x.playerId));
    }
  }

  transfers.push(...greedy(remaining));
  return { transfers, discrepancyCents };
}

function popcount(x: number): number {
  let c = 0;
  while (x) {
    x &= x - 1;
    c++;
  }
  return c;
}

/** Smallest subset (size ≥ 2) of nets summing to exactly zero, or null. Ties → lowest mask (earliest players). */
function findSmallestZeroSubset(nets: Net[]): Net[] | null {
  const n = nets.length;
  if (n < 2) return null;
  let best = -1;
  let bestSize = Infinity;
  const limit = 1 << n;
  for (let mask = 1; mask < limit; mask++) {
    const size = popcount(mask);
    if (size < 2 || size >= bestSize) continue;
    let sum = 0;
    for (let i = 0; i < n; i++) if (mask & (1 << i)) sum += nets[i].netCents;
    if (sum === 0) {
      best = mask;
      bestSize = size;
      if (size === 2) break;
    }
  }
  if (best < 0) return null;
  return nets.filter((_, i) => best & (1 << i));
}

/** Largest debtor pays largest creditor, repeat. ≤ m−1 transfers. Stable sort keeps input-order ties. */
function greedy(nets: Net[]): Transfer[] {
  const debtors = nets
    .filter((x) => x.netCents < 0)
    .map((x) => ({ id: x.playerId, amt: -x.netCents }))
    .sort((a, b) => b.amt - a.amt);
  const creditors = nets
    .filter((x) => x.netCents > 0)
    .map((x) => ({ id: x.playerId, amt: x.netCents }))
    .sort((a, b) => b.amt - a.amt);

  const out: Transfer[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amt = Math.min(debtors[i].amt, creditors[j].amt);
    out.push({ from: debtors[i].id, to: creditors[j].id, amountCents: amt });
    debtors[i].amt -= amt;
    creditors[j].amt -= amt;
    if (debtors[i].amt === 0) i++;
    if (creditors[j].amt === 0) j++;
  }
  return out;
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- settle`
Expected: all PASS. If "ties broken by input order" fails, check that `greedy` sorts are stable (they are in Node ≥ 11) and that no extra sort key was added.

- [ ] **Step 5: Commit**

```bash
git add src/domain/settle.ts src/domain/settle.test.ts
git commit -m "feat(domain): two-phase minimal-transfer settlement

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Nets, totals, and chip conversion

**Files:**
- Create: `src/domain/nets.ts`, `src/domain/nets.test.ts`, `src/domain/chips.ts`, `src/domain/chips.test.ts`

**Interfaces:**
- Consumes: `SessionDetail`, `ChipDenom` from `types.ts`; `settle` from `settle.ts`.
- Produces:
  ```ts
  export interface PlayerNetRow { playerId: string; name: string; colorSeed: number; buyinCents: number; cashoutCents: number | null; netCents: number | null }
  export interface SessionSummaryMath { rows: PlayerNetRow[]; totalBuyinCents: number; totalCashoutCents: number; pendingCount: number; settlement: SettlementResult }
  export function computeRows(detail: SessionDetail): PlayerNetRow[]
  export function summarize(detail: SessionDetail): SessionSummaryMath
  export function chipsToCents(counts: Record<string, number>, denoms: ChipDenom[]): number
  ```

- [ ] **Step 1: Write failing tests `src/domain/nets.test.ts`**

```ts
import { computeRows, summarize } from './nets';
import type { SessionDetail, Player, SessionPlayer, Buyin } from './types';

const base = { createdAt: 0, updatedAt: 0, deletedAt: null };
const player = (id: string, name: string): Player => ({ ...base, id, name, colorSeed: 1, archived: false });
const sp = (id: string, playerId: string, cashoutCents: number | null, sortOrder: number): SessionPlayer => ({
  ...base, id, sessionId: 's1', playerId, cashoutCents, sortOrder,
});
const buyin = (id: string, sessionPlayerId: string, amountCents: number): Buyin => ({
  ...base, id, sessionPlayerId, amountCents, at: 0,
});

const detail: SessionDetail = {
  session: { ...base, id: 's1', date: '2026-09-16', title: null, defaultBuyinCents: 2000, notes: null },
  players: [
    { sp: sp('sp1', 'p1', 5000, 0), player: player('p1', 'Ann'), buyins: [buyin('b1', 'sp1', 2000)] },
    { sp: sp('sp2', 'p2', 1000, 1), player: player('p2', 'Bob'), buyins: [buyin('b2', 'sp2', 2000), buyin('b3', 'sp2', 2000)] },
    { sp: sp('sp3', 'p3', null, 2), player: player('p3', 'Cat'), buyins: [buyin('b4', 'sp3', 2000)] },
  ],
};

describe('computeRows', () => {
  it('sums buy-ins and computes net; null cashout → null net', () => {
    const rows = computeRows(detail);
    expect(rows).toEqual([
      { playerId: 'p1', name: 'Ann', colorSeed: 1, buyinCents: 2000, cashoutCents: 5000, netCents: 3000 },
      { playerId: 'p2', name: 'Bob', colorSeed: 1, buyinCents: 4000, cashoutCents: 1000, netCents: -3000 },
      { playerId: 'p3', name: 'Cat', colorSeed: 1, buyinCents: 2000, cashoutCents: null, netCents: null },
    ]);
  });

  it('orders by sortOrder', () => {
    const swapped: SessionDetail = { ...detail, players: [detail.players[1], detail.players[0]] };
    expect(computeRows(swapped).map((r) => r.playerId)).toEqual(['p1', 'p2']);
  });
});

describe('summarize', () => {
  it('totals include pending buy-ins, exclude pending from settlement', () => {
    const s = summarize(detail);
    expect(s.totalBuyinCents).toBe(8000);
    expect(s.totalCashoutCents).toBe(6000);
    expect(s.pendingCount).toBe(1);
    expect(s.settlement.transfers).toEqual([{ from: 'p2', to: 'p1', amountCents: 3000 }]);
    expect(s.settlement.discrepancyCents).toBe(0);
  });
});
```

- [ ] **Step 2: Write failing tests `src/domain/chips.test.ts`**

```ts
import { chipsToCents } from './chips';
import type { ChipDenom } from './types';

const base = { createdAt: 0, updatedAt: 0, deletedAt: null };
const denoms: ChipDenom[] = [
  { ...base, id: 'w', label: 'White', colorHex: '#fff', valueCents: 25, sortOrder: 0 },
  { ...base, id: 'r', label: 'Red', colorHex: '#f00', valueCents: 100, sortOrder: 1 },
  { ...base, id: 'g', label: 'Green', colorHex: '#0f0', valueCents: 500, sortOrder: 2 },
];

describe('chipsToCents', () => {
  it('sums count × value', () => {
    expect(chipsToCents({ w: 4, r: 3, g: 1 }, denoms)).toBe(100 + 300 + 500);
  });
  it('ignores unknown ids and missing counts', () => {
    expect(chipsToCents({ zzz: 10, r: 2 }, denoms)).toBe(200);
  });
  it('empty → 0', () => {
    expect(chipsToCents({}, denoms)).toBe(0);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `npm test -- nets chips`
Expected: FAIL, modules not found.

- [ ] **Step 4: Implement `src/domain/nets.ts`**

```ts
import { settle, type SettlementResult } from './settle';
import type { SessionDetail } from './types';

export interface PlayerNetRow {
  playerId: string;
  name: string;
  colorSeed: number;
  buyinCents: number;
  cashoutCents: number | null;
  netCents: number | null;
}

export interface SessionSummaryMath {
  rows: PlayerNetRow[];
  totalBuyinCents: number;
  totalCashoutCents: number;
  pendingCount: number;
  settlement: SettlementResult;
}

export function computeRows(detail: SessionDetail): PlayerNetRow[] {
  return [...detail.players]
    .sort((a, b) => a.sp.sortOrder - b.sp.sortOrder)
    .map(({ sp, player, buyins }) => {
      const buyinCents = buyins.reduce((s, b) => s + b.amountCents, 0);
      const cashoutCents = sp.cashoutCents;
      return {
        playerId: player.id,
        name: player.name,
        colorSeed: player.colorSeed,
        buyinCents,
        cashoutCents,
        netCents: cashoutCents === null ? null : cashoutCents - buyinCents,
      };
    });
}

export function summarize(detail: SessionDetail): SessionSummaryMath {
  const rows = computeRows(detail);
  const totalBuyinCents = rows.reduce((s, r) => s + r.buyinCents, 0);
  const totalCashoutCents = rows.reduce((s, r) => s + (r.cashoutCents ?? 0), 0);
  const pendingCount = rows.filter((r) => r.netCents === null).length;
  const settlement = settle(
    rows.filter((r) => r.netCents !== null).map((r) => ({ playerId: r.playerId, netCents: r.netCents as number })),
  );
  return { rows, totalBuyinCents, totalCashoutCents, pendingCount, settlement };
}
```

- [ ] **Step 5: Implement `src/domain/chips.ts`**

```ts
import type { ChipDenom } from './types';

export function chipsToCents(counts: Record<string, number>, denoms: ChipDenom[]): number {
  let total = 0;
  for (const d of denoms) {
    const c = counts[d.id] ?? 0;
    total += c * d.valueCents;
  }
  return total;
}
```

- [ ] **Step 6: Run tests**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/domain
git commit -m "feat(domain): session nets, totals, chip conversion

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Db interface, schema, migrations, adapters

**Files:**
- Create: `src/db/types.ts`, `src/db/schema.ts`, `src/db/connection.ts`, `src/db/ids.ts`, `src/db/map.ts`, `src/db/expo-adapter.ts`, `test/nodeDb.ts`, `src/db/schema.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // src/db/types.ts
  export type SqlParam = string | number | null;
  export interface Db {
    exec(sql: string): void;
    run(sql: string, params?: SqlParam[]): { changes: number };
    all<T>(sql: string, params?: SqlParam[]): T[];
    first<T>(sql: string, params?: SqlParam[]): T | null;
    transaction<T>(fn: () => T): T;
  }
  // src/db/schema.ts
  export function migrate(db: Db): void
  // src/db/connection.ts
  export function setDb(db: Db): void; export function getDb(): Db
  // src/db/ids.ts
  export function newId(): string; export function now(): number
  // src/db/map.ts
  export function mapRow<T>(row: Record<string, unknown>): T   // snake_case → camelCase
  // test/nodeDb.ts
  export function createTestDb(): Db   // fresh in-memory node:sqlite, already migrated
  ```

- [ ] **Step 1: Create `src/db/types.ts`**

```ts
export type SqlParam = string | number | null;

export interface Db {
  exec(sql: string): void;
  run(sql: string, params?: SqlParam[]): { changes: number };
  all<T>(sql: string, params?: SqlParam[]): T[];
  first<T>(sql: string, params?: SqlParam[]): T | null;
  transaction<T>(fn: () => T): T;
}
```

- [ ] **Step 2: Create `src/db/schema.ts`**

```ts
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
```

- [ ] **Step 3: Create `src/db/connection.ts`, `src/db/ids.ts`, `src/db/map.ts`**

`src/db/connection.ts`:

```ts
import type { Db } from './types';

let current: Db | null = null;

export function setDb(db: Db): void {
  current = db;
}

export function getDb(): Db {
  if (!current) throw new Error('Database not initialised. Call setDb() first.');
  return current;
}
```

`src/db/ids.ts`:

```ts
import * as Crypto from 'expo-crypto';

export function newId(): string {
  return Crypto.randomUUID();
}

export function now(): number {
  return Date.now();
}
```

`src/db/map.ts`:

```ts
const snakeToCamel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

/** Converts a snake_case SQL row to camelCase. Does not coerce types; callers fix booleans. */
export function mapRow<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(row)) out[snakeToCamel(k)] = row[k];
  return out as T;
}
```

- [ ] **Step 4: Create `src/db/expo-adapter.ts`**

```ts
import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';
import type { Db, SqlParam } from './types';

export function openExpoDb(name = 'chips.db'): Db {
  const sqlite: SQLiteDatabase = openDatabaseSync(name);
  sqlite.execSync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  return {
    exec: (sql) => sqlite.execSync(sql),
    run: (sql, params: SqlParam[] = []) => {
      const r = sqlite.runSync(sql, params);
      return { changes: r.changes };
    },
    all: <T>(sql: string, params: SqlParam[] = []) => sqlite.getAllSync<T>(sql, params),
    first: <T>(sql: string, params: SqlParam[] = []) => sqlite.getFirstSync<T>(sql, params) ?? null,
    transaction: <T>(fn: () => T): T => {
      let result!: T;
      sqlite.withTransactionSync(() => {
        result = fn();
      });
      return result;
    },
  };
}
```

- [ ] **Step 5: Create `test/nodeDb.ts`**

```ts
import { DatabaseSync } from 'node:sqlite';
import type { Db, SqlParam } from '@/db/types';
import { migrate } from '@/db/schema';

export function createTestDb(): Db {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON;');
  const db: Db = {
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
  migrate(db);
  return db;
}
```

- [ ] **Step 6: Write failing test `src/db/schema.test.ts`**

```ts
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

  it('is idempotent', () => {
    const db = createTestDb();
    migrate(db);
    expect(db.first<{ user_version: number }>('PRAGMA user_version')?.user_version).toBe(MIGRATIONS.length);
  });
});
```

- [ ] **Step 7: Run tests**

Run: `npm test -- schema`
Expected: PASS. If Jest complains about `node:sqlite`, confirm `node --version` ≥ 22.13 and that `jest.config.js` has `testEnvironment: 'node'`.

- [ ] **Step 8: Commit**

```bash
git add src/db test
git commit -m "feat(db): Db interface, schema migrations, expo and node adapters

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Players repository

**Files:**
- Create: `src/repo/players.ts`, `src/repo/players.test.ts`

**Interfaces:**
- Consumes: `Db`, `newId`, `now`, `mapRow`, `Player`.
- Produces:
  ```ts
  export function listPlayers(db: Db, opts?: { includeArchived?: boolean }): Player[]   // name ASC, case-insensitive
  export function getPlayer(db: Db, id: string): Player | null
  export function createPlayer(db: Db, name: string): Player          // throws Error('Name already exists') / Error('Name required')
  export function renamePlayer(db: Db, id: string, name: string): void  // same validation
  export function setPlayerArchived(db: Db, id: string, archived: boolean): void
  export function deletePlayer(db: Db, id: string): void               // soft; throws Error('Player has sessions') if used
  export function playerSessionCount(db: Db, id: string): number
  ```

- [ ] **Step 1: Write failing tests `src/repo/players.test.ts`**

```ts
import { createTestDb } from '../../test/nodeDb';
import {
  createPlayer, listPlayers, getPlayer, renamePlayer, setPlayerArchived, deletePlayer, playerSessionCount,
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
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- repo/players`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `src/repo/players.ts`**

```ts
import type { Db } from '@/db/types';
import { newId, now } from '@/db/ids';
import { mapRow } from '@/db/map';
import type { Player } from '@/domain/types';

const COLS = 'id, created_at, updated_at, deleted_at, name, color_seed, archived';

function toPlayer(row: Record<string, unknown>): Player {
  const p = mapRow<Player & { archived: number }>(row);
  return { ...p, archived: !!p.archived };
}

function normalizeName(db: Db, name: string, excludeId?: string): string {
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Name required');
  const dup = db.first<{ id: string }>(
    'SELECT id FROM players WHERE deleted_at IS NULL AND lower(name) = lower(?) AND id != ?',
    [trimmed, excludeId ?? ''],
  );
  if (dup) throw new Error('Name already exists');
  return trimmed;
}

export function listPlayers(db: Db, opts: { includeArchived?: boolean } = {}): Player[] {
  const where = opts.includeArchived ? '' : 'AND archived = 0';
  return db
    .all<Record<string, unknown>>(`SELECT ${COLS} FROM players WHERE deleted_at IS NULL ${where} ORDER BY lower(name) ASC`)
    .map(toPlayer);
}

export function getPlayer(db: Db, id: string): Player | null {
  const row = db.first<Record<string, unknown>>(`SELECT ${COLS} FROM players WHERE id = ? AND deleted_at IS NULL`, [id]);
  return row ? toPlayer(row) : null;
}

export function createPlayer(db: Db, name: string): Player {
  const clean = normalizeName(db, name);
  const id = newId();
  const t = now();
  const colorSeed = Math.floor(Math.random() * 1000);
  db.run(
    'INSERT INTO players (id, created_at, updated_at, deleted_at, name, color_seed, archived) VALUES (?, ?, ?, NULL, ?, ?, 0)',
    [id, t, t, clean, colorSeed],
  );
  return { id, createdAt: t, updatedAt: t, deletedAt: null, name: clean, colorSeed, archived: false };
}

export function renamePlayer(db: Db, id: string, name: string): void {
  const clean = normalizeName(db, name, id);
  db.run('UPDATE players SET name = ?, updated_at = ? WHERE id = ?', [clean, now(), id]);
}

export function setPlayerArchived(db: Db, id: string, archived: boolean): void {
  db.run('UPDATE players SET archived = ?, updated_at = ? WHERE id = ?', [archived ? 1 : 0, now(), id]);
}

export function playerSessionCount(db: Db, id: string): number {
  const r = db.first<{ c: number }>(
    'SELECT COUNT(*) AS c FROM session_players WHERE player_id = ? AND deleted_at IS NULL',
    [id],
  );
  return r?.c ?? 0;
}

export function deletePlayer(db: Db, id: string): void {
  if (playerSessionCount(db, id) > 0) throw new Error('Player has sessions');
  const t = now();
  db.run('UPDATE players SET deleted_at = ?, updated_at = ? WHERE id = ?', [t, t, id]);
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- repo/players`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/repo/players.ts src/repo/players.test.ts
git commit -m "feat(repo): players CRUD with soft delete

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Settings and chip denominations repository

**Files:**
- Create: `src/repo/settings.ts`, `src/repo/settings.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function getSettings(db: Db): Settings
  export function updateSettings(db: Db, patch: Partial<Settings>): Settings
  export function listChipDenoms(db: Db): ChipDenom[]     // sort_order ASC
  export function createChipDenom(db: Db, input: { label: string; colorHex: string; valueCents: number }): ChipDenom   // appended last
  export function updateChipDenom(db: Db, id: string, patch: Partial<Pick<ChipDenom, 'label' | 'colorHex' | 'valueCents'>>): void
  export function deleteChipDenom(db: Db, id: string): void      // soft
  export function reorderChipDenoms(db: Db, orderedIds: string[]): void
  ```
  Validation: `label` trimmed non-empty else `Error('Label required')`; `valueCents` integer > 0 else `Error('Value must be positive')`.

- [ ] **Step 1: Write failing tests `src/repo/settings.test.ts`**

```ts
import { createTestDb } from '../../test/nodeDb';
import {
  getSettings, updateSettings, listChipDenoms, createChipDenom, updateChipDenom, deleteChipDenom, reorderChipDenoms,
} from './settings';

describe('settings', () => {
  it('reads seeded defaults', () => {
    expect(getSettings(createTestDb())).toEqual({ defaultBuyinCents: 2000, currencySymbol: '$' });
  });
  it('patches', () => {
    const db = createTestDb();
    expect(updateSettings(db, { defaultBuyinCents: 5000 })).toEqual({ defaultBuyinCents: 5000, currencySymbol: '$' });
    expect(getSettings(db).defaultBuyinCents).toBe(5000);
  });
});

describe('chip denoms', () => {
  it('starts empty, appends in order', () => {
    const db = createTestDb();
    expect(listChipDenoms(db)).toEqual([]);
    const w = createChipDenom(db, { label: 'White', colorHex: '#ffffff', valueCents: 25 });
    const r = createChipDenom(db, { label: 'Red', colorHex: '#ff0000', valueCents: 100 });
    expect(listChipDenoms(db).map((d) => d.id)).toEqual([w.id, r.id]);
    expect(listChipDenoms(db).map((d) => d.sortOrder)).toEqual([0, 1]);
  });

  it('validates', () => {
    const db = createTestDb();
    expect(() => createChipDenom(db, { label: ' ', colorHex: '#fff', valueCents: 25 })).toThrow('Label required');
    expect(() => createChipDenom(db, { label: 'X', colorHex: '#fff', valueCents: 0 })).toThrow('Value must be positive');
    expect(() => createChipDenom(db, { label: 'X', colorHex: '#fff', valueCents: 12.5 })).toThrow('Value must be positive');
  });

  it('updates and soft deletes', () => {
    const db = createTestDb();
    const w = createChipDenom(db, { label: 'White', colorHex: '#fff', valueCents: 25 });
    updateChipDenom(db, w.id, { valueCents: 50, label: 'Whitey' });
    expect(listChipDenoms(db)[0]).toEqual(expect.objectContaining({ valueCents: 50, label: 'Whitey' }));
    deleteChipDenom(db, w.id);
    expect(listChipDenoms(db)).toEqual([]);
  });

  it('reorders', () => {
    const db = createTestDb();
    const a = createChipDenom(db, { label: 'A', colorHex: '#fff', valueCents: 1 });
    const b = createChipDenom(db, { label: 'B', colorHex: '#fff', valueCents: 2 });
    reorderChipDenoms(db, [b.id, a.id]);
    expect(listChipDenoms(db).map((d) => d.label)).toEqual(['B', 'A']);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- repo/settings`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `src/repo/settings.ts`**

```ts
import type { Db } from '@/db/types';
import { newId, now } from '@/db/ids';
import { mapRow } from '@/db/map';
import type { ChipDenom, Settings } from '@/domain/types';

export function getSettings(db: Db): Settings {
  const row = db.first<{ default_buyin_cents: number; currency_symbol: string }>(
    "SELECT default_buyin_cents, currency_symbol FROM settings WHERE id = 'default'",
  );
  if (!row) throw new Error('Settings row missing');
  return { defaultBuyinCents: row.default_buyin_cents, currencySymbol: row.currency_symbol };
}

export function updateSettings(db: Db, patch: Partial<Settings>): Settings {
  const cur = getSettings(db);
  const next = { ...cur, ...patch };
  db.run("UPDATE settings SET default_buyin_cents = ?, currency_symbol = ? WHERE id = 'default'", [
    next.defaultBuyinCents,
    next.currencySymbol,
  ]);
  return next;
}

const DENOM_COLS = 'id, created_at, updated_at, deleted_at, label, color_hex, value_cents, sort_order';

function validateDenom(input: { label?: string; valueCents?: number }) {
  if (input.label !== undefined && !input.label.trim()) throw new Error('Label required');
  if (input.valueCents !== undefined && (!Number.isInteger(input.valueCents) || input.valueCents <= 0)) {
    throw new Error('Value must be positive');
  }
}

export function listChipDenoms(db: Db): ChipDenom[] {
  return db
    .all<Record<string, unknown>>(`SELECT ${DENOM_COLS} FROM chip_denoms WHERE deleted_at IS NULL ORDER BY sort_order ASC`)
    .map((r) => mapRow<ChipDenom>(r));
}

export function createChipDenom(db: Db, input: { label: string; colorHex: string; valueCents: number }): ChipDenom {
  validateDenom(input);
  const max = db.first<{ m: number | null }>('SELECT MAX(sort_order) AS m FROM chip_denoms WHERE deleted_at IS NULL');
  const sortOrder = (max?.m ?? -1) + 1;
  const id = newId();
  const t = now();
  const label = input.label.trim();
  db.run(
    'INSERT INTO chip_denoms (id, created_at, updated_at, deleted_at, label, color_hex, value_cents, sort_order) VALUES (?, ?, ?, NULL, ?, ?, ?, ?)',
    [id, t, t, label, input.colorHex, input.valueCents, sortOrder],
  );
  return { id, createdAt: t, updatedAt: t, deletedAt: null, label, colorHex: input.colorHex, valueCents: input.valueCents, sortOrder };
}

export function updateChipDenom(
  db: Db,
  id: string,
  patch: Partial<Pick<ChipDenom, 'label' | 'colorHex' | 'valueCents'>>,
): void {
  validateDenom(patch);
  const cur = db.first<Record<string, unknown>>(`SELECT ${DENOM_COLS} FROM chip_denoms WHERE id = ? AND deleted_at IS NULL`, [id]);
  if (!cur) throw new Error('Denomination not found');
  const d = mapRow<ChipDenom>(cur);
  const next = { ...d, ...patch, label: (patch.label ?? d.label).trim() };
  db.run('UPDATE chip_denoms SET label = ?, color_hex = ?, value_cents = ?, updated_at = ? WHERE id = ?', [
    next.label, next.colorHex, next.valueCents, now(), id,
  ]);
}

export function deleteChipDenom(db: Db, id: string): void {
  const t = now();
  db.run('UPDATE chip_denoms SET deleted_at = ?, updated_at = ? WHERE id = ?', [t, t, id]);
}

export function reorderChipDenoms(db: Db, orderedIds: string[]): void {
  const t = now();
  db.transaction(() => {
    orderedIds.forEach((id, i) => db.run('UPDATE chip_denoms SET sort_order = ?, updated_at = ? WHERE id = ?', [i, t, id]));
  });
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- repo/settings`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/repo/settings.ts src/repo/settings.test.ts
git commit -m "feat(repo): settings and chip denominations

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Sessions repository

**Files:**
- Create: `src/repo/sessions.ts`, `src/repo/sessions.test.ts`

**Interfaces:**
- Consumes: `computeRows` from `@/domain/nets`, `Player` types, players repo not needed (raw SQL).
- Produces:
  ```ts
  export interface CreateSessionInput { date: string; title: string | null; defaultBuyinCents: number; playerIds: string[] }
  export function createSession(db: Db, input: CreateSessionInput): Session
  export function updateSession(db: Db, id: string, patch: Partial<Pick<Session, 'date' | 'title' | 'defaultBuyinCents' | 'notes'>>): void
  export function deleteSession(db: Db, id: string): void            // soft-deletes session, its session_players and their buyins
  export function listSessionSummaries(db: Db): SessionSummary[]     // date DESC, created_at DESC
  export function getSessionDetail(db: Db, id: string): SessionDetail | null
  export function addPlayerToSession(db: Db, sessionId: string, playerId: string): SessionPlayer   // throws Error('Player already in session')
  export function removePlayerFromSession(db: Db, sessionPlayerId: string): void   // soft-deletes sp + its buyins
  export function setCashout(db: Db, sessionPlayerId: string, cents: number | null): void   // throws Error('Amount must be non-negative') if cents<0 or non-integer
  export function addBuyin(db: Db, sessionPlayerId: string, amountCents: number): Buyin        // throws Error('Amount must be positive')
  export function updateBuyin(db: Db, buyinId: string, amountCents: number): void
  export function removeBuyin(db: Db, buyinId: string): void
  export function lastSessionPlayerIds(db: Db): string[]  // player ids from most recent session, [] if none
  ```

- [ ] **Step 1: Write failing tests `src/repo/sessions.test.ts`**

```ts
import { createTestDb } from '../../test/nodeDb';
import { createPlayer } from './players';
import {
  createSession, updateSession, deleteSession, listSessionSummaries, getSessionDetail,
  addPlayerToSession, removePlayerFromSession, setCashout, addBuyin, updateBuyin, removeBuyin, lastSessionPlayerIds,
} from './sessions';

function setup() {
  const db = createTestDb();
  const ann = createPlayer(db, 'Ann');
  const bob = createPlayer(db, 'Bob');
  const cat = createPlayer(db, 'Cat');
  return { db, ann, bob, cat };
}

describe('sessions repo', () => {
  it('creates a session with players in given order', () => {
    const { db, ann, bob } = setup();
    const s = createSession(db, { date: '2026-09-16', title: 'Home', defaultBuyinCents: 2000, playerIds: [bob.id, ann.id] });
    const d = getSessionDetail(db, s.id)!;
    expect(d.session).toEqual(expect.objectContaining({ date: '2026-09-16', title: 'Home', defaultBuyinCents: 2000 }));
    expect(d.players.map((p) => p.player.name)).toEqual(['Bob', 'Ann']);
    expect(d.players.map((p) => p.sp.sortOrder)).toEqual([0, 1]);
    expect(d.players[0].buyins).toEqual([]);
    expect(d.players[0].sp.cashoutCents).toBeNull();
  });

  it('adds and removes players, appending sort order', () => {
    const { db, ann, bob, cat } = setup();
    const s = createSession(db, { date: '2026-09-16', title: null, defaultBuyinCents: 2000, playerIds: [ann.id] });
    const spBob = addPlayerToSession(db, s.id, bob.id);
    expect(spBob.sortOrder).toBe(1);
    expect(() => addPlayerToSession(db, s.id, bob.id)).toThrow('Player already in session');
    addBuyin(db, spBob.id, 2000);
    removePlayerFromSession(db, spBob.id);
    const d = getSessionDetail(db, s.id)!;
    expect(d.players.map((p) => p.player.id)).toEqual([ann.id]);
    // re-adding after removal works
    expect(addPlayerToSession(db, s.id, bob.id).sortOrder).toBe(2);
    expect(getSessionDetail(db, s.id)!.players.find((p) => p.player.id === bob.id)!.buyins).toEqual([]);
    void cat;
  });

  it('buy-ins: add, update, remove, validation', () => {
    const { db, ann } = setup();
    const s = createSession(db, { date: '2026-09-16', title: null, defaultBuyinCents: 2000, playerIds: [ann.id] });
    const sp = getSessionDetail(db, s.id)!.players[0].sp;
    const b1 = addBuyin(db, sp.id, 2000);
    const b2 = addBuyin(db, sp.id, 1000);
    expect(() => addBuyin(db, sp.id, 0)).toThrow('Amount must be positive');
    updateBuyin(db, b2.id, 1500);
    removeBuyin(db, b1.id);
    const buyins = getSessionDetail(db, s.id)!.players[0].buyins;
    expect(buyins.map((b) => b.amountCents)).toEqual([1500]);
  });

  it('cashout set, cleared, validated', () => {
    const { db, ann } = setup();
    const s = createSession(db, { date: '2026-09-16', title: null, defaultBuyinCents: 2000, playerIds: [ann.id] });
    const sp = getSessionDetail(db, s.id)!.players[0].sp;
    setCashout(db, sp.id, 3500);
    expect(getSessionDetail(db, s.id)!.players[0].sp.cashoutCents).toBe(3500);
    setCashout(db, sp.id, null);
    expect(getSessionDetail(db, s.id)!.players[0].sp.cashoutCents).toBeNull();
    expect(() => setCashout(db, sp.id, -1)).toThrow('Amount must be non-negative');
  });

  it('summaries sorted by date desc with top winner', () => {
    const { db, ann, bob } = setup();
    const old = createSession(db, { date: '2026-09-01', title: null, defaultBuyinCents: 2000, playerIds: [ann.id] });
    const recent = createSession(db, { date: '2026-09-16', title: 'Big', defaultBuyinCents: 2000, playerIds: [ann.id, bob.id] });
    const d = getSessionDetail(db, recent.id)!;
    addBuyin(db, d.players[0].sp.id, 2000);
    addBuyin(db, d.players[1].sp.id, 2000);
    setCashout(db, d.players[0].sp.id, 500);
    setCashout(db, d.players[1].sp.id, 3500);
    const sums = listSessionSummaries(db);
    expect(sums.map((x) => x.session.id)).toEqual([recent.id, old.id]);
    expect(sums[0].playerCount).toBe(2);
    expect(sums[0].topWinner).toEqual({ name: 'Bob', netCents: 1500 });
    expect(sums[1].topWinner).toBeNull();
  });

  it('updateSession patches fields', () => {
    const { db, ann } = setup();
    const s = createSession(db, { date: '2026-09-16', title: null, defaultBuyinCents: 2000, playerIds: [ann.id] });
    updateSession(db, s.id, { title: 'Renamed', defaultBuyinCents: 2500 });
    expect(getSessionDetail(db, s.id)!.session).toEqual(expect.objectContaining({ title: 'Renamed', defaultBuyinCents: 2500 }));
  });

  it('deleteSession hides everything', () => {
    const { db, ann } = setup();
    const s = createSession(db, { date: '2026-09-16', title: null, defaultBuyinCents: 2000, playerIds: [ann.id] });
    const sp = getSessionDetail(db, s.id)!.players[0].sp;
    addBuyin(db, sp.id, 2000);
    deleteSession(db, s.id);
    expect(getSessionDetail(db, s.id)).toBeNull();
    expect(listSessionSummaries(db)).toEqual([]);
    expect(db.first('SELECT deleted_at FROM buyins WHERE session_player_id = ?', [sp.id])).toEqual({ deleted_at: expect.any(Number) });
  });

  it('lastSessionPlayerIds returns most recent session players', () => {
    const { db, ann, bob } = setup();
    expect(lastSessionPlayerIds(db)).toEqual([]);
    createSession(db, { date: '2026-09-01', title: null, defaultBuyinCents: 2000, playerIds: [ann.id] });
    createSession(db, { date: '2026-09-16', title: null, defaultBuyinCents: 2000, playerIds: [bob.id, ann.id] });
    expect(lastSessionPlayerIds(db)).toEqual([bob.id, ann.id]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- repo/sessions`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement `src/repo/sessions.ts`**

```ts
import type { Db } from '@/db/types';
import { newId, now } from '@/db/ids';
import { mapRow } from '@/db/map';
import { computeRows } from '@/domain/nets';
import type { Buyin, Player, Session, SessionDetail, SessionPlayer, SessionSummary } from '@/domain/types';

const S_COLS = 'id, created_at, updated_at, deleted_at, date, title, default_buyin_cents, notes';
const SP_COLS = 'id, created_at, updated_at, deleted_at, session_id, player_id, cashout_cents, sort_order';
const B_COLS = 'id, created_at, updated_at, deleted_at, session_player_id, amount_cents, at';
const P_COLS = 'id, created_at, updated_at, deleted_at, name, color_seed, archived';

export interface CreateSessionInput {
  date: string;
  title: string | null;
  defaultBuyinCents: number;
  playerIds: string[];
}

function getSession(db: Db, id: string): Session | null {
  const row = db.first<Record<string, unknown>>(`SELECT ${S_COLS} FROM sessions WHERE id = ? AND deleted_at IS NULL`, [id]);
  return row ? mapRow<Session>(row) : null;
}

export function createSession(db: Db, input: CreateSessionInput): Session {
  const id = newId();
  const t = now();
  db.transaction(() => {
    db.run(
      'INSERT INTO sessions (id, created_at, updated_at, deleted_at, date, title, default_buyin_cents, notes) VALUES (?, ?, ?, NULL, ?, ?, ?, NULL)',
      [id, t, t, input.date, input.title, input.defaultBuyinCents],
    );
    input.playerIds.forEach((pid, i) => insertSessionPlayer(db, id, pid, i, t));
  });
  return { id, createdAt: t, updatedAt: t, deletedAt: null, date: input.date, title: input.title, defaultBuyinCents: input.defaultBuyinCents, notes: null };
}

function insertSessionPlayer(db: Db, sessionId: string, playerId: string, sortOrder: number, t: number): SessionPlayer {
  const id = newId();
  db.run(
    'INSERT INTO session_players (id, created_at, updated_at, deleted_at, session_id, player_id, cashout_cents, sort_order) VALUES (?, ?, ?, NULL, ?, ?, NULL, ?)',
    [id, t, t, sessionId, playerId, sortOrder],
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
  db.run('UPDATE sessions SET date = ?, title = ?, default_buyin_cents = ?, notes = ?, updated_at = ? WHERE id = ?', [
    next.date, next.title, next.defaultBuyinCents, next.notes, now(), id,
  ]);
}

export function deleteSession(db: Db, id: string): void {
  const t = now();
  db.transaction(() => {
    db.run(
      'UPDATE buyins SET deleted_at = ?, updated_at = ? WHERE deleted_at IS NULL AND session_player_id IN (SELECT id FROM session_players WHERE session_id = ?)',
      [t, t, id],
    );
    db.run('UPDATE session_players SET deleted_at = ?, updated_at = ? WHERE deleted_at IS NULL AND session_id = ?', [t, t, id]);
    db.run('UPDATE sessions SET deleted_at = ?, updated_at = ? WHERE id = ?', [t, t, id]);
  });
}

export function getSessionDetail(db: Db, id: string): SessionDetail | null {
  const session = getSession(db, id);
  if (!session) return null;
  const sps = db
    .all<Record<string, unknown>>(`SELECT ${SP_COLS} FROM session_players WHERE session_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC`, [id])
    .map((r) => mapRow<SessionPlayer>(r));
  const players = sps.map((sp) => {
    const prow = db.first<Record<string, unknown>>(`SELECT ${P_COLS} FROM players WHERE id = ?`, [sp.playerId]);
    if (!prow) throw new Error('Player row missing');
    const p = mapRow<Player & { archived: number }>(prow);
    const player: Player = { ...p, archived: !!p.archived };
    const buyins = db
      .all<Record<string, unknown>>(`SELECT ${B_COLS} FROM buyins WHERE session_player_id = ? AND deleted_at IS NULL ORDER BY at ASC, created_at ASC`, [sp.id])
      .map((r) => mapRow<Buyin>(r));
    return { sp, player, buyins };
  });
  return { session, players };
}

export function listSessionSummaries(db: Db): SessionSummary[] {
  const sessions = db
    .all<Record<string, unknown>>(`SELECT ${S_COLS} FROM sessions WHERE deleted_at IS NULL ORDER BY date DESC, created_at DESC`)
    .map((r) => mapRow<Session>(r));
  return sessions.map((session) => {
    const detail = getSessionDetail(db, session.id)!;
    const rows = computeRows(detail);
    let topWinner: SessionSummary['topWinner'] = null;
    for (const r of rows) {
      if (r.netCents !== null && r.netCents > 0 && (!topWinner || r.netCents > topWinner.netCents)) {
        topWinner = { name: r.name, netCents: r.netCents };
      }
    }
    return { session, playerCount: rows.length, topWinner };
  });
}

export function addPlayerToSession(db: Db, sessionId: string, playerId: string): SessionPlayer {
  const dup = db.first<{ id: string }>(
    'SELECT id FROM session_players WHERE session_id = ? AND player_id = ? AND deleted_at IS NULL',
    [sessionId, playerId],
  );
  if (dup) throw new Error('Player already in session');
  const max = db.first<{ m: number | null }>('SELECT MAX(sort_order) AS m FROM session_players WHERE session_id = ?', [sessionId]);
  return insertSessionPlayer(db, sessionId, playerId, (max?.m ?? -1) + 1, now());
}

export function removePlayerFromSession(db: Db, sessionPlayerId: string): void {
  const t = now();
  db.transaction(() => {
    db.run('UPDATE buyins SET deleted_at = ?, updated_at = ? WHERE deleted_at IS NULL AND session_player_id = ?', [t, t, sessionPlayerId]);
    db.run('UPDATE session_players SET deleted_at = ?, updated_at = ? WHERE id = ?', [t, t, sessionPlayerId]);
  });
}

export function setCashout(db: Db, sessionPlayerId: string, cents: number | null): void {
  if (cents !== null && (!Number.isInteger(cents) || cents < 0)) throw new Error('Amount must be non-negative');
  db.run('UPDATE session_players SET cashout_cents = ?, updated_at = ? WHERE id = ?', [cents, now(), sessionPlayerId]);
}

export function addBuyin(db: Db, sessionPlayerId: string, amountCents: number): Buyin {
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error('Amount must be positive');
  const id = newId();
  const t = now();
  db.run(
    'INSERT INTO buyins (id, created_at, updated_at, deleted_at, session_player_id, amount_cents, at) VALUES (?, ?, ?, NULL, ?, ?, ?)',
    [id, t, t, sessionPlayerId, amountCents, t],
  );
  return { id, createdAt: t, updatedAt: t, deletedAt: null, sessionPlayerId, amountCents, at: t };
}

export function updateBuyin(db: Db, buyinId: string, amountCents: number): void {
  if (!Number.isInteger(amountCents) || amountCents <= 0) throw new Error('Amount must be positive');
  db.run('UPDATE buyins SET amount_cents = ?, updated_at = ? WHERE id = ?', [amountCents, now(), buyinId]);
}

export function removeBuyin(db: Db, buyinId: string): void {
  const t = now();
  db.run('UPDATE buyins SET deleted_at = ?, updated_at = ? WHERE id = ?', [t, t, buyinId]);
}

export function lastSessionPlayerIds(db: Db): string[] {
  const last = db.first<{ id: string }>('SELECT id FROM sessions WHERE deleted_at IS NULL ORDER BY date DESC, created_at DESC LIMIT 1');
  if (!last) return [];
  return db
    .all<{ player_id: string }>('SELECT player_id FROM session_players WHERE session_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC', [last.id])
    .map((r) => r.player_id);
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- repo/sessions`
Expected: PASS. Note the `topWinner` test depends on `createSession` for `recent` being created after `old` (created_at tiebreak is irrelevant since dates differ).

- [ ] **Step 5: Commit**

```bash
git add src/repo/sessions.ts src/repo/sessions.test.ts
git commit -m "feat(repo): sessions, session players, buy-ins

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Zustand stores

**Files:**
- Create: `src/store/useSettingsStore.ts`, `src/store/usePlayersStore.ts`, `src/store/useSessionsStore.ts`, `src/store/stores.test.ts`

**Interfaces:**
- Consumes: all repo functions from Tasks 6–8, `getDb()`.
- Produces (every action writes to DB first, then updates state; errors propagate to caller for toasting):
  ```ts
  // useSettingsStore
  interface SettingsState {
    settings: Settings; denoms: ChipDenom[];
    load(): void;
    setDefaultBuyin(cents: number): void;
    addDenom(input: { label: string; colorHex: string; valueCents: number }): void;
    updateDenom(id: string, patch: Partial<Pick<ChipDenom, 'label' | 'colorHex' | 'valueCents'>>): void;
    removeDenom(id: string): void;
    reorderDenoms(ids: string[]): void;
  }
  // usePlayersStore
  interface PlayersState {
    players: Player[];           // includes archived; screens filter
    load(): void;
    add(name: string): Player;
    rename(id: string, name: string): void;
    setArchived(id: string, archived: boolean): void;
    remove(id: string): void;
  }
  // useSessionsStore
  interface SessionsState {
    summaries: SessionSummary[];
    detail: SessionDetail | null;   // currently open session
    loadSummaries(): void;
    create(input: CreateSessionInput): Session;
    open(id: string): void;         // sets detail (null if missing)
    refreshDetail(): void;
    updateSession(patch: Partial<Pick<Session, 'date' | 'title' | 'defaultBuyinCents' | 'notes'>>): void;
    deleteSession(id: string): void;
    addPlayer(playerId: string): void;
    removePlayer(sessionPlayerId: string): void;
    setCashout(sessionPlayerId: string, cents: number | null): void;
    addBuyin(sessionPlayerId: string, cents: number): void;
    updateBuyin(buyinId: string, cents: number): void;
    removeBuyin(buyinId: string): void;
    lastPlayerIds(): string[];
  }
  ```

- [ ] **Step 1: Write failing tests `src/store/stores.test.ts`**

```ts
import { createTestDb } from '../../test/nodeDb';
import { setDb } from '@/db/connection';
import { usePlayersStore } from './usePlayersStore';
import { useSettingsStore } from './useSettingsStore';
import { useSessionsStore } from './useSessionsStore';

beforeEach(() => {
  setDb(createTestDb());
  usePlayersStore.setState({ players: [] });
  useSettingsStore.setState({ settings: { defaultBuyinCents: 2000, currencySymbol: '$' }, denoms: [] });
  useSessionsStore.setState({ summaries: [], detail: null });
});

describe('usePlayersStore', () => {
  it('add persists and updates state', () => {
    const p = usePlayersStore.getState().add('Ann');
    expect(usePlayersStore.getState().players.map((x) => x.id)).toEqual([p.id]);
    usePlayersStore.setState({ players: [] });
    usePlayersStore.getState().load();
    expect(usePlayersStore.getState().players).toHaveLength(1);
  });

  it('propagates repo errors without changing state', () => {
    usePlayersStore.getState().add('Ann');
    expect(() => usePlayersStore.getState().add('ann')).toThrow('Name already exists');
    expect(usePlayersStore.getState().players).toHaveLength(1);
  });
});

describe('useSettingsStore', () => {
  it('loads defaults and updates buy-in', () => {
    useSettingsStore.getState().load();
    expect(useSettingsStore.getState().settings.defaultBuyinCents).toBe(2000);
    useSettingsStore.getState().setDefaultBuyin(2500);
    expect(useSettingsStore.getState().settings.defaultBuyinCents).toBe(2500);
  });

  it('manages denoms', () => {
    const s = useSettingsStore.getState();
    s.addDenom({ label: 'Red', colorHex: '#f00', valueCents: 100 });
    expect(useSettingsStore.getState().denoms).toHaveLength(1);
    const id = useSettingsStore.getState().denoms[0].id;
    useSettingsStore.getState().updateDenom(id, { valueCents: 200 });
    expect(useSettingsStore.getState().denoms[0].valueCents).toBe(200);
    useSettingsStore.getState().removeDenom(id);
    expect(useSettingsStore.getState().denoms).toHaveLength(0);
  });
});

describe('useSessionsStore', () => {
  it('create → open → edit → summaries reflect changes', () => {
    const ann = usePlayersStore.getState().add('Ann');
    const bob = usePlayersStore.getState().add('Bob');
    const s = useSessionsStore.getState().create({ date: '2026-09-16', title: null, defaultBuyinCents: 2000, playerIds: [ann.id, bob.id] });
    expect(useSessionsStore.getState().summaries).toHaveLength(1);

    useSessionsStore.getState().open(s.id);
    const d = useSessionsStore.getState().detail!;
    expect(d.players).toHaveLength(2);

    useSessionsStore.getState().addBuyin(d.players[0].sp.id, 2000);
    useSessionsStore.getState().addBuyin(d.players[1].sp.id, 2000);
    useSessionsStore.getState().setCashout(d.players[0].sp.id, 0);
    useSessionsStore.getState().setCashout(d.players[1].sp.id, 4000);

    const d2 = useSessionsStore.getState().detail!;
    expect(d2.players[0].buyins).toHaveLength(1);
    expect(d2.players[1].sp.cashoutCents).toBe(4000);
    expect(useSessionsStore.getState().summaries[0].topWinner).toEqual({ name: 'Bob', netCents: 2000 });

    useSessionsStore.getState().deleteSession(s.id);
    expect(useSessionsStore.getState().summaries).toEqual([]);
    expect(useSessionsStore.getState().detail).toBeNull();
  });

  it('lastPlayerIds', () => {
    const ann = usePlayersStore.getState().add('Ann');
    expect(useSessionsStore.getState().lastPlayerIds()).toEqual([]);
    useSessionsStore.getState().create({ date: '2026-09-16', title: null, defaultBuyinCents: 2000, playerIds: [ann.id] });
    expect(useSessionsStore.getState().lastPlayerIds()).toEqual([ann.id]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npm test -- stores`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement `src/store/useSettingsStore.ts`**

```ts
import { create } from 'zustand';
import { getDb } from '@/db/connection';
import type { ChipDenom, Settings } from '@/domain/types';
import * as repo from '@/repo/settings';

interface SettingsState {
  settings: Settings;
  denoms: ChipDenom[];
  load(): void;
  setDefaultBuyin(cents: number): void;
  addDenom(input: { label: string; colorHex: string; valueCents: number }): void;
  updateDenom(id: string, patch: Partial<Pick<ChipDenom, 'label' | 'colorHex' | 'valueCents'>>): void;
  removeDenom(id: string): void;
  reorderDenoms(ids: string[]): void;
}

export const useSettingsStore = create<SettingsState>((set) => {
  const reload = () => set({ settings: repo.getSettings(getDb()), denoms: repo.listChipDenoms(getDb()) });
  return {
    settings: { defaultBuyinCents: 2000, currencySymbol: '$' },
    denoms: [],
    load: reload,
    setDefaultBuyin: (cents) => {
      repo.updateSettings(getDb(), { defaultBuyinCents: cents });
      reload();
    },
    addDenom: (input) => {
      repo.createChipDenom(getDb(), input);
      reload();
    },
    updateDenom: (id, patch) => {
      repo.updateChipDenom(getDb(), id, patch);
      reload();
    },
    removeDenom: (id) => {
      repo.deleteChipDenom(getDb(), id);
      reload();
    },
    reorderDenoms: (ids) => {
      repo.reorderChipDenoms(getDb(), ids);
      reload();
    },
  };
});
```

- [ ] **Step 4: Implement `src/store/usePlayersStore.ts`**

```ts
import { create } from 'zustand';
import { getDb } from '@/db/connection';
import type { Player } from '@/domain/types';
import * as repo from '@/repo/players';

interface PlayersState {
  players: Player[];
  load(): void;
  add(name: string): Player;
  rename(id: string, name: string): void;
  setArchived(id: string, archived: boolean): void;
  remove(id: string): void;
}

export const usePlayersStore = create<PlayersState>((set) => {
  const reload = () => set({ players: repo.listPlayers(getDb(), { includeArchived: true }) });
  return {
    players: [],
    load: reload,
    add: (name) => {
      const p = repo.createPlayer(getDb(), name);
      reload();
      return p;
    },
    rename: (id, name) => {
      repo.renamePlayer(getDb(), id, name);
      reload();
    },
    setArchived: (id, archived) => {
      repo.setPlayerArchived(getDb(), id, archived);
      reload();
    },
    remove: (id) => {
      repo.deletePlayer(getDb(), id);
      reload();
    },
  };
});
```

- [ ] **Step 5: Implement `src/store/useSessionsStore.ts`**

```ts
import { create } from 'zustand';
import { getDb } from '@/db/connection';
import type { Session, SessionDetail, SessionSummary } from '@/domain/types';
import * as repo from '@/repo/sessions';
import type { CreateSessionInput } from '@/repo/sessions';

interface SessionsState {
  summaries: SessionSummary[];
  detail: SessionDetail | null;
  loadSummaries(): void;
  create(input: CreateSessionInput): Session;
  open(id: string): void;
  refreshDetail(): void;
  updateSession(patch: Partial<Pick<Session, 'date' | 'title' | 'defaultBuyinCents' | 'notes'>>): void;
  deleteSession(id: string): void;
  addPlayer(playerId: string): void;
  removePlayer(sessionPlayerId: string): void;
  setCashout(sessionPlayerId: string, cents: number | null): void;
  addBuyin(sessionPlayerId: string, cents: number): void;
  updateBuyin(buyinId: string, cents: number): void;
  removeBuyin(buyinId: string): void;
  lastPlayerIds(): string[];
}

export const useSessionsStore = create<SessionsState>((set, get) => {
  const loadSummaries = () => set({ summaries: repo.listSessionSummaries(getDb()) });
  const refreshDetail = () => {
    const id = get().detail?.session.id;
    set({ detail: id ? repo.getSessionDetail(getDb(), id) : null });
    loadSummaries();
  };
  const requireId = () => {
    const id = get().detail?.session.id;
    if (!id) throw new Error('No session open');
    return id;
  };
  return {
    summaries: [],
    detail: null,
    loadSummaries,
    create: (input) => {
      const s = repo.createSession(getDb(), input);
      loadSummaries();
      return s;
    },
    open: (id) => {
      set({ detail: repo.getSessionDetail(getDb(), id) });
    },
    refreshDetail,
    updateSession: (patch) => {
      repo.updateSession(getDb(), requireId(), patch);
      refreshDetail();
    },
    deleteSession: (id) => {
      repo.deleteSession(getDb(), id);
      if (get().detail?.session.id === id) set({ detail: null });
      loadSummaries();
    },
    addPlayer: (playerId) => {
      repo.addPlayerToSession(getDb(), requireId(), playerId);
      refreshDetail();
    },
    removePlayer: (spId) => {
      repo.removePlayerFromSession(getDb(), spId);
      refreshDetail();
    },
    setCashout: (spId, cents) => {
      repo.setCashout(getDb(), spId, cents);
      refreshDetail();
    },
    addBuyin: (spId, cents) => {
      repo.addBuyin(getDb(), spId, cents);
      refreshDetail();
    },
    updateBuyin: (id, cents) => {
      repo.updateBuyin(getDb(), id, cents);
      refreshDetail();
    },
    removeBuyin: (id) => {
      repo.removeBuyin(getDb(), id);
      refreshDetail();
    },
    lastPlayerIds: () => repo.lastSessionPlayerIds(getDb()),
  };
});
```

- [ ] **Step 6: Run tests**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/store
git commit -m "feat(store): zustand stores over repositories

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: App shell, theme, shared UI primitives

**Files:**
- Create: `src/theme.ts`, `src/components/ui.tsx`, `src/components/MoneyText.tsx`
- Modify: `src/app/_layout.tsx`, `src/app/index.tsx`

**Interfaces:**
- Produces:
  ```ts
  // theme.ts
  export const colors = { bg, card, cardAlt, border, text, textDim, accent, accentText, pos, neg, warn, warnBg, danger }
  export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 }
  export const radius = { sm: 8, md: 12, lg: 16, pill: 999 }
  export function avatarColor(seed: number): string
  // ui.tsx
  export function Screen({ children, scroll?: boolean, padded?: boolean }): JSX.Element   // SafeArea + bg
  export function Title({ children }), Subtitle({ children }), Body({ children, dim? }), Caption({ children })
  export function Button({ label, onPress, variant?: 'primary'|'secondary'|'danger'|'ghost', disabled?, style? })
  export function Row({ children, style? })          // flexDirection row, alignItems center
  export function Card({ children, style?, onPress?, onLongPress? })
  export function Banner({ kind: 'warn'|'info', text })
  export function Avatar({ name, seed, size? })      // colored circle w/ initial
  export function Pill({ label, onPress?, onLongPress?, tone?: 'default'|'accent' })
  export function IconButton({ label, onPress })     // text glyph button, e.g. "＋", "⋯", "←"
  export function toastError(e: unknown): void       // Alert.alert('Error', message)
  // MoneyText.tsx
  export function MoneyText({ cents, signed?: boolean, size?: number, dimZero?: boolean })  // colored by sign
  ```
  `_layout.tsx` opens `openExpoDb()`, `migrate`, `setDb`, loads all three stores, then renders the Stack. Until ready, renders a blank `Screen`.

- [ ] **Step 1: Create `src/theme.ts`**

```ts
export const colors = {
  bg: '#0E1113',
  card: '#181C1F',
  cardAlt: '#1F2428',
  border: '#2A3136',
  text: '#F2F4F5',
  textDim: '#8C969E',
  accent: '#3DDC97',
  accentText: '#062A1C',
  pos: '#3DDC97',
  neg: '#FF6B6B',
  warn: '#F5B841',
  warnBg: '#3A2E12',
  danger: '#FF6B6B',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };

const AVATAR_PALETTE = ['#E4572E', '#17BEBB', '#FFC914', '#76B041', '#A05EB5', '#F26D85', '#3A86FF', '#FF9F1C'];

export function avatarColor(seed: number): string {
  return AVATAR_PALETTE[Math.abs(seed) % AVATAR_PALETTE.length];
}
```

- [ ] **Step 2: Create `src/components/ui.tsx`**

```tsx
import React from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, space, avatarColor } from '@/theme';

export function Screen({ children, scroll = false, padded = true }: { children: React.ReactNode; scroll?: boolean; padded?: boolean }) {
  const inner = <View style={[{ flex: 1 }, padded && { paddingHorizontal: space.lg }]}>{children}</View>;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'left', 'right']}>
      {scroll ? <ScrollView contentContainerStyle={{ paddingBottom: space.xl * 2 }} keyboardShouldPersistTaps="handled">{inner}</ScrollView> : inner}
    </SafeAreaView>
  );
}

export const Title = ({ children }: { children: React.ReactNode }) => <Text style={s.title}>{children}</Text>;
export const Subtitle = ({ children }: { children: React.ReactNode }) => <Text style={s.subtitle}>{children}</Text>;
export const Body = ({ children, dim = false, style }: { children: React.ReactNode; dim?: boolean; style?: StyleProp<any> }) => (
  <Text style={[s.body, dim && { color: colors.textDim }, style]}>{children}</Text>
);
export const Caption = ({ children }: { children: React.ReactNode }) => <Text style={s.caption}>{children}</Text>;

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
export function Button({ label, onPress, variant = 'primary', disabled = false, style }: {
  label: string; onPress: () => void; variant?: Variant; disabled?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const bg = { primary: colors.accent, secondary: colors.cardAlt, danger: colors.danger, ghost: 'transparent' }[variant];
  const fg = { primary: colors.accentText, secondary: colors.text, danger: '#fff', ghost: colors.accent }[variant];
  return (
    <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [s.btn, { backgroundColor: bg, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 }, style]}>
      <Text style={[s.btnText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export const Row = ({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) => (
  <View style={[{ flexDirection: 'row', alignItems: 'center' }, style]}>{children}</View>
);

export function Card({ children, style, onPress, onLongPress }: {
  children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; onLongPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} disabled={!onPress && !onLongPress}
      style={({ pressed }) => [s.card, pressed && { opacity: 0.8 }, style]}>
      {children}
    </Pressable>
  );
}

export function Banner({ kind, text }: { kind: 'warn' | 'info'; text: string }) {
  const bg = kind === 'warn' ? colors.warnBg : colors.cardAlt;
  const fg = kind === 'warn' ? colors.warn : colors.textDim;
  return (
    <View style={[s.banner, { backgroundColor: bg }]}>
      <Text style={{ color: fg, fontWeight: '600' }}>{text}</Text>
    </View>
  );
}

export function Avatar({ name, seed, size = 36 }: { name: string; seed: number; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: avatarColor(seed), alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.45 }}>{name.trim().charAt(0).toUpperCase()}</Text>
    </View>
  );
}

export function Pill({ label, onPress, onLongPress, tone = 'default' }: {
  label: string; onPress?: () => void; onLongPress?: () => void; tone?: 'default' | 'accent';
}) {
  const accent = tone === 'accent';
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress}
      style={({ pressed }) => [s.pill, accent && { backgroundColor: colors.accent, borderColor: colors.accent }, pressed && { opacity: 0.7 }]}>
      <Text style={{ color: accent ? colors.accentText : colors.text, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

export function IconButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={({ pressed }) => [s.iconBtn, pressed && { opacity: 0.6 }]}>
      <Text style={{ color: colors.text, fontSize: 20 }}>{label}</Text>
    </Pressable>
  );
}

export function toastError(e: unknown): void {
  const msg = e instanceof Error ? e.message : String(e);
  Alert.alert('Error', msg);
}

const s = StyleSheet.create({
  title: { color: colors.text, fontSize: 28, fontWeight: '800', marginBottom: space.sm },
  subtitle: { color: colors.textDim, fontSize: 14, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginTop: space.lg, marginBottom: space.sm },
  body: { color: colors.text, fontSize: 16 },
  caption: { color: colors.textDim, fontSize: 12 },
  btn: { paddingVertical: 14, paddingHorizontal: 20, borderRadius: radius.md, alignItems: 'center' },
  btnText: { fontSize: 16, fontWeight: '700' },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: space.lg, marginBottom: space.md, borderWidth: 1, borderColor: colors.border },
  banner: { padding: space.md, borderRadius: radius.md, marginBottom: space.md },
  pill: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border, marginRight: 6, marginBottom: 6 },
  iconBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
});
```

- [ ] **Step 3: Create `src/components/MoneyText.tsx`**

```tsx
import React from 'react';
import { Text } from 'react-native';
import { formatCents, formatSigned } from '@/domain/money';
import { useSettingsStore } from '@/store/useSettingsStore';
import { colors } from '@/theme';

export function MoneyText({ cents, signed = false, size = 16, dimZero = false, bold = true }: {
  cents: number; signed?: boolean; size?: number; dimZero?: boolean; bold?: boolean;
}) {
  const symbol = useSettingsStore((s) => s.settings.currencySymbol);
  const color = cents > 0 ? colors.pos : cents < 0 ? colors.neg : dimZero ? colors.textDim : colors.text;
  const text = signed ? formatSigned(cents, symbol) : formatCents(cents, symbol);
  return <Text style={{ color: signed ? color : colors.text, fontSize: size, fontWeight: bold ? '700' : '400', fontVariant: ['tabular-nums'] }}>{text}</Text>;
}
```

- [ ] **Step 4: Replace `src/app/_layout.tsx`**

```tsx
import React, { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Text, View } from 'react-native';
import { openExpoDb } from '@/db/expo-adapter';
import { migrate } from '@/db/schema';
import { setDb } from '@/db/connection';
import { usePlayersStore } from '@/store/usePlayersStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useSessionsStore } from '@/store/useSessionsStore';
import { colors } from '@/theme';

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const db = openExpoDb();
      migrate(db);
      setDb(db);
      useSettingsStore.getState().load();
      usePlayersStore.getState().load();
      useSessionsStore.getState().loadSummaries();
      setReady(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: colors.neg, fontSize: 16 }}>Failed to open database: {error}</Text>
      </View>
    );
  }
  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        <Stack.Screen name="new-session" options={{ presentation: 'modal' }} />
      </Stack>
    </>
  );
}
```

- [ ] **Step 5: Temporary home to verify shell**

Replace `src/app/index.tsx`:

```tsx
import { Screen, Title, Body, Button } from '@/components/ui';
import { MoneyText } from '@/components/MoneyText';
import { useSettingsStore } from '@/store/useSettingsStore';

export default function Home() {
  const buyin = useSettingsStore((s) => s.settings.defaultBuyinCents);
  return (
    <Screen>
      <Title>Chips</Title>
      <Body dim>Default buy-in:</Body>
      <MoneyText cents={buyin} />
      <MoneyText cents={-725} signed />
      <Button label="Primary" onPress={() => {}} />
    </Screen>
  );
}
```

- [ ] **Step 6: Run type check, tests, and app**

Run: `npx tsc --noEmit && npm test`
Expected: no type errors, all tests pass.

Run: `npx expo start --ios`. Expected: dark screen, "Chips" title, "$20" in white, "-$7.25" in red, green button. No red error box. Kill the DB between runs if schema changes: uninstall app from simulator.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(app): app shell with DB init, theme, UI primitives

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Home sessions list and New Night modal

**Files:**
- Create: `src/components/SessionCard.tsx`, `src/components/PlayerPicker.tsx`, `src/app/new-session.tsx`
- Modify: `src/app/index.tsx`

**Interfaces:**
- Consumes: `useSessionsStore`, `usePlayersStore`, `useSettingsStore`, `formatCents`, `parseMoneyInput`, ui primitives.
- Produces:
  ```tsx
  export function SessionCard({ summary, onPress, onLongPress }: { summary: SessionSummary; onPress(): void; onLongPress(): void })
  export function PlayerPicker({ selectedIds, onChange, excludeIds? }: { selectedIds: string[]; onChange(ids: string[]): void; excludeIds?: string[] })
  // PlayerPicker shows non-archived players as Pills (accent when selected) and an inline "New player" TextInput + Add.
  export function formatDate(iso: string): string  // in SessionCard.tsx: "Tue, Sep 16" style, local
  ```

- [ ] **Step 1: Create `src/components/SessionCard.tsx`**

```tsx
import React from 'react';
import { View } from 'react-native';
import { Card, Body, Caption, Row } from '@/components/ui';
import { MoneyText } from '@/components/MoneyText';
import type { SessionSummary } from '@/domain/types';

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function SessionCard({ summary, onPress, onLongPress }: { summary: SessionSummary; onPress: () => void; onLongPress: () => void }) {
  const { session, playerCount, topWinner } = summary;
  return (
    <Card onPress={onPress} onLongPress={onLongPress}>
      <Row style={{ justifyContent: 'space-between' }}>
        <View>
          <Body style={{ fontWeight: '700' }}>{session.title ?? formatDate(session.date)}</Body>
          {session.title ? <Caption>{formatDate(session.date)}</Caption> : null}
          <Caption>{playerCount} player{playerCount === 1 ? '' : 's'}</Caption>
        </View>
        {topWinner ? (
          <View style={{ alignItems: 'flex-end' }}>
            <Caption>{topWinner.name}</Caption>
            <MoneyText cents={topWinner.netCents} signed />
          </View>
        ) : (
          <Caption>In progress</Caption>
        )}
      </Row>
    </Card>
  );
}
```

- [ ] **Step 2: Create `src/components/PlayerPicker.tsx`**

```tsx
import React, { useState } from 'react';
import { TextInput, View } from 'react-native';
import { Pill, Button, Row, toastError } from '@/components/ui';
import { usePlayersStore } from '@/store/usePlayersStore';
import { colors, radius, space } from '@/theme';

export function PlayerPicker({ selectedIds, onChange, excludeIds = [] }: {
  selectedIds: string[]; onChange: (ids: string[]) => void; excludeIds?: string[];
}) {
  const players = usePlayersStore((s) => s.players.filter((p) => !p.archived && !excludeIds.includes(p.id)));
  const add = usePlayersStore((s) => s.add);
  const [newName, setNewName] = useState('');

  const toggle = (id: string) =>
    onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);

  const addNew = () => {
    try {
      const p = add(newName);
      setNewName('');
      onChange([...selectedIds, p.id]);
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {players.map((p) => (
          <Pill key={p.id} label={p.name} tone={selectedIds.includes(p.id) ? 'accent' : 'default'} onPress={() => toggle(p.id)} />
        ))}
      </View>
      <Row style={{ marginTop: space.sm }}>
        <TextInput
          value={newName}
          onChangeText={setNewName}
          placeholder="New player"
          placeholderTextColor={colors.textDim}
          onSubmitEditing={addNew}
          returnKeyType="done"
          style={{ flex: 1, color: colors.text, backgroundColor: colors.cardAlt, borderRadius: radius.md, padding: 12, marginRight: space.sm }}
        />
        <Button label="Add" variant="secondary" onPress={addNew} disabled={!newName.trim()} />
      </Row>
    </View>
  );
}
```

- [ ] **Step 3: Create `src/app/new-session.tsx`**

```tsx
import React, { useState } from 'react';
import { Platform, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Screen, Title, Subtitle, Button, Row, toastError, Body } from '@/components/ui';
import { PlayerPicker } from '@/components/PlayerPicker';
import { formatDate } from '@/components/SessionCard';
import { useSessionsStore } from '@/store/useSessionsStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { formatCents, parseMoneyInput } from '@/domain/money';
import { colors, radius, space } from '@/theme';

function todayIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function toIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export default function NewSession() {
  const router = useRouter();
  const settings = useSettingsStore((s) => s.settings);
  const create = useSessionsStore((s) => s.create);
  const lastPlayerIds = useSessionsStore((s) => s.lastPlayerIds);

  const [date, setDate] = useState(todayIso());
  const [showPicker, setShowPicker] = useState(Platform.OS === 'ios');
  const [title, setTitle] = useState('');
  const [buyinText, setBuyinText] = useState(formatCents(settings.defaultBuyinCents, ''));
  const [playerIds, setPlayerIds] = useState<string[]>(() => lastPlayerIds());

  const buyinCents = parseMoneyInput(buyinText);
  const canStart = playerIds.length > 0 && buyinCents !== null && buyinCents > 0;

  const start = () => {
    if (!canStart || buyinCents === null) return;
    try {
      const s = create({ date, title: title.trim() || null, defaultBuyinCents: buyinCents, playerIds });
      router.replace(`/session/${s.id}`);
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <Screen scroll>
      <Title>New night</Title>

      <Subtitle>Date</Subtitle>
      {Platform.OS === 'android' && <Button label={formatDate(date)} variant="secondary" onPress={() => setShowPicker(true)} />}
      {showPicker && (
        <DateTimePicker
          value={new Date(date + 'T12:00:00')}
          mode="date"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          themeVariant="dark"
          onChange={(_, d) => {
            if (Platform.OS === 'android') setShowPicker(false);
            if (d) setDate(toIso(d));
          }}
        />
      )}

      <Subtitle>Title (optional)</Subtitle>
      <TextInput value={title} onChangeText={setTitle} placeholder="e.g. Dave's place" placeholderTextColor={colors.textDim} style={inputStyle} />

      <Subtitle>Default buy-in</Subtitle>
      <Row>
        <Body style={{ marginRight: 4 }}>{settings.currencySymbol}</Body>
        <TextInput value={buyinText} onChangeText={setBuyinText} keyboardType="decimal-pad" style={[inputStyle, { flex: 1 }]} />
      </Row>

      <Subtitle>Players</Subtitle>
      <PlayerPicker selectedIds={playerIds} onChange={setPlayerIds} />

      <View style={{ height: space.xl }} />
      <Button label="Start" onPress={start} disabled={!canStart} />
      <Button label="Cancel" variant="ghost" onPress={() => router.back()} style={{ marginTop: space.sm }} />
    </Screen>
  );
}

const inputStyle = { color: colors.text, backgroundColor: colors.cardAlt, borderRadius: radius.md, padding: 12, fontSize: 16 } as const;
```

- [ ] **Step 4: Replace `src/app/index.tsx` with the sessions list**

```tsx
import React from 'react';
import { Alert, FlatList, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Title, Body, Row, IconButton, toastError } from '@/components/ui';
import { SessionCard } from '@/components/SessionCard';
import { useSessionsStore } from '@/store/useSessionsStore';
import { colors, space } from '@/theme';

export default function Home() {
  const router = useRouter();
  const summaries = useSessionsStore((s) => s.summaries);
  const deleteSession = useSessionsStore((s) => s.deleteSession);

  const onLongPress = (id: string) => {
    Alert.alert('Session', undefined, [
      { text: 'Share', onPress: () => router.push(`/session/${id}/settle?share=1`) },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Delete this night?', 'This cannot be undone.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => { try { deleteSession(id); } catch (e) { toastError(e); } } },
          ]),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between', marginTop: space.sm }}>
        <Title>Chips</Title>
        <Row>
          <IconButton label="👥" onPress={() => router.push('/players')} />
          <IconButton label="⚙︎" onPress={() => router.push('/settings')} />
        </Row>
      </Row>

      <FlatList
        data={summaries}
        keyExtractor={(s) => s.session.id}
        renderItem={({ item }) => (
          <SessionCard summary={item} onPress={() => router.push(`/session/${item.session.id}`)} onLongPress={() => onLongPress(item.session.id)} />
        )}
        ListEmptyComponent={
          <View style={{ marginTop: 80, alignItems: 'center' }}>
            <Body dim>No nights yet. Tap + to start one.</Body>
          </View>
        }
        contentContainerStyle={{ paddingBottom: 120 }}
      />

      <Pressable
        onPress={() => router.push('/new-session')}
        style={({ pressed }) => ({
          position: 'absolute', right: space.lg, bottom: space.xl, width: 60, height: 60, borderRadius: 30,
          backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.8 : 1,
          shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6,
        })}>
        <Text style={{ color: colors.accentText, fontSize: 32, lineHeight: 34, fontWeight: '700' }}>+</Text>
      </Pressable>
    </Screen>
  );
}
```

- [ ] **Step 5: Stub the session route so navigation works**

Create `src/app/session/[id]/index.tsx` (temporary; replaced in Task 12):

```tsx
import { useLocalSearchParams } from 'expo-router';
import { Screen, Title } from '@/components/ui';

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Screen><Title>Session {id}</Title></Screen>;
}
```

Create `src/app/players.tsx` and `src/app/settings.tsx` stubs the same way with titles "Players" and "Settings" (replaced in Tasks 16–17). Create `src/app/session/[id]/settle.tsx` stub with title "Settle" (replaced in Task 14).

- [ ] **Step 6: Type check and run**

Run: `npx tsc --noEmit && npm test`
Expected: clean.

Run app: empty state shows. Tap +, add players "Ann", "Bob", pick date, Start → lands on "Session <id>". Back → card appears with "In progress". Long-press → Share/Delete sheet; Delete removes card.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(app): sessions list and new night modal

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: Session editor with buy-in pills and amount pad

**Files:**
- Create: `src/components/AmountPad.tsx`, `src/components/PlayerRow.tsx`
- Modify: `src/app/session/[id]/index.tsx` (replace stub)

**Interfaces:**
- Consumes: `useSessionsStore`, `summarize`, `MoneyText`, `Pill`, `Avatar`, `Banner`, `PlayerPicker`.
- Produces:
  ```tsx
  export function AmountPad({ visible, title, initialCents, allowZero?, onConfirm, onCancel, onDelete?, extraAction? }: {
    visible: boolean; title: string; initialCents: number | null; allowZero?: boolean;
    onConfirm(cents: number): void; onCancel(): void; onDelete?(): void;
    extraAction?: { label: string; onPress(): void };   // used by Task 13 for "Use chips"
  })
  export function PlayerRow({ row, detail, onAddDefaultBuyin, onCustomBuyin, onEditBuyin, onEditCashout, onLongPress }: {
    row: PlayerNetRow; detail: SessionPlayerDetail;
    onAddDefaultBuyin(): void; onCustomBuyin(): void; onEditBuyin(buyin: Buyin): void; onEditCashout(): void; onLongPress(): void;
  })
  ```

- [ ] **Step 1: Create `src/components/AmountPad.tsx`**

```tsx
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, TextInput, View } from 'react-native';
import { Button, Body, Row, Subtitle } from '@/components/ui';
import { formatCents, parseMoneyInput } from '@/domain/money';
import { useSettingsStore } from '@/store/useSettingsStore';
import { colors, radius, space } from '@/theme';

export function AmountPad({ visible, title, initialCents, allowZero = false, onConfirm, onCancel, onDelete, extraAction }: {
  visible: boolean; title: string; initialCents: number | null; allowZero?: boolean;
  onConfirm: (cents: number) => void; onCancel: () => void; onDelete?: () => void;
  extraAction?: { label: string; onPress: () => void };
}) {
  const symbol = useSettingsStore((s) => s.settings.currencySymbol);
  const [text, setText] = useState('');

  useEffect(() => {
    if (visible) setText(initialCents === null ? '' : formatCents(initialCents, ''));
  }, [visible, initialCents]);

  const cents = parseMoneyInput(text);
  const valid = cents !== null && (allowZero ? cents >= 0 : cents > 0);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' }} onPress={onCancel} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={{ backgroundColor: colors.card, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: space.lg, paddingBottom: space.xl * 1.5 }}>
          <Subtitle>{title}</Subtitle>
          <Row>
            <Body style={{ fontSize: 28, marginRight: 4 }}>{symbol}</Body>
            <TextInput
              value={text}
              onChangeText={setText}
              autoFocus
              keyboardType="decimal-pad"
              selectTextOnFocus
              onSubmitEditing={() => valid && cents !== null && onConfirm(cents)}
              style={{ flex: 1, color: colors.text, fontSize: 28, fontWeight: '700', padding: 12, backgroundColor: colors.cardAlt, borderRadius: radius.md }}
            />
          </Row>
          {extraAction && <Button label={extraAction.label} variant="secondary" onPress={extraAction.onPress} style={{ marginTop: space.md }} />}
          <Row style={{ marginTop: space.md }}>
            {onDelete && <Button label="Remove" variant="danger" onPress={onDelete} style={{ marginRight: space.sm }} />}
            <Button label="Cancel" variant="secondary" onPress={onCancel} style={{ flex: 1, marginRight: space.sm }} />
            <Button label="Save" onPress={() => cents !== null && onConfirm(cents)} disabled={!valid} style={{ flex: 1 }} />
          </Row>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
```

- [ ] **Step 2: Create `src/components/PlayerRow.tsx`**

```tsx
import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Avatar, Body, Caption, Pill, Row } from '@/components/ui';
import { MoneyText } from '@/components/MoneyText';
import type { PlayerNetRow } from '@/domain/nets';
import type { Buyin, SessionPlayerDetail } from '@/domain/types';
import { formatCents } from '@/domain/money';
import { useSettingsStore } from '@/store/useSettingsStore';
import { colors, radius, space } from '@/theme';

export function PlayerRow({ row, detail, onAddDefaultBuyin, onCustomBuyin, onEditBuyin, onEditCashout, onLongPress }: {
  row: PlayerNetRow; detail: SessionPlayerDetail;
  onAddDefaultBuyin: () => void; onCustomBuyin: () => void; onEditBuyin: (b: Buyin) => void; onEditCashout: () => void; onLongPress: () => void;
}) {
  const symbol = useSettingsStore((s) => s.settings.currencySymbol);
  return (
    <Pressable onLongPress={onLongPress} style={{ backgroundColor: colors.card, borderRadius: radius.lg, padding: space.md, marginBottom: space.md, borderWidth: 1, borderColor: colors.border }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row>
          <Avatar name={row.name} seed={row.colorSeed} />
          <Body style={{ fontWeight: '700', marginLeft: space.sm }}>{row.name}</Body>
        </Row>
        {row.netCents === null ? <Caption>—</Caption> : <MoneyText cents={row.netCents} signed size={18} />}
      </Row>

      <Caption>Buy-ins · {formatCents(row.buyinCents, symbol)}</Caption>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 }}>
        {detail.buyins.map((b) => (
          <Pill key={b.id} label={formatCents(b.amountCents, symbol)} onPress={() => onEditBuyin(b)} />
        ))}
        <Pill label="+" tone="accent" onPress={onAddDefaultBuyin} onLongPress={onCustomBuyin} />
      </View>

      <Pressable onPress={onEditCashout} style={{ marginTop: space.sm, backgroundColor: colors.cardAlt, borderRadius: radius.md, padding: 10 }}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Caption>Cash-out</Caption>
          <Text style={{ color: row.cashoutCents === null ? colors.textDim : colors.text, fontWeight: '700', fontSize: 16 }}>
            {row.cashoutCents === null ? 'Tap to enter' : formatCents(row.cashoutCents, symbol)}
          </Text>
        </Row>
      </Pressable>
    </Pressable>
  );
}
```

- [ ] **Step 3: Replace `src/app/session/[id]/index.tsx`**

```tsx
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Modal, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen, Title, Body, Caption, Row, IconButton, Button, Banner, toastError, Subtitle } from '@/components/ui';
import { PlayerRow } from '@/components/PlayerRow';
import { AmountPad } from '@/components/AmountPad';
import { PlayerPicker } from '@/components/PlayerPicker';
import { formatDate } from '@/components/SessionCard';
import { useSessionsStore } from '@/store/useSessionsStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { summarize } from '@/domain/nets';
import { formatCents } from '@/domain/money';
import type { Buyin } from '@/domain/types';
import { colors, space } from '@/theme';

type PadState =
  | { kind: 'none' }
  | { kind: 'customBuyin'; spId: string }
  | { kind: 'editBuyin'; buyin: Buyin }
  | { kind: 'cashout'; spId: string; current: number | null };

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const store = useSessionsStore();
  const symbol = useSettingsStore((s) => s.settings.currencySymbol);
  const [pad, setPad] = useState<PadState>({ kind: 'none' });
  const [addingPlayer, setAddingPlayer] = useState(false);

  useEffect(() => {
    if (id) store.open(id);
  }, [id]);

  const detail = store.detail;
  const math = useMemo(() => (detail ? summarize(detail) : null), [detail]);

  if (!detail || !math || detail.session.id !== id) {
    return <Screen><Body dim>Loading…</Body></Screen>;
  }

  const safe = (fn: () => void) => { try { fn(); } catch (e) { toastError(e); } };
  const closePad = () => setPad({ kind: 'none' });

  const onRowLongPress = (spId: string, name: string, hasBuyins: boolean) => {
    const doRemove = () => safe(() => store.removePlayer(spId));
    Alert.alert(name, undefined, [
      {
        text: 'Remove from night',
        style: 'destructive',
        onPress: () => hasBuyins
          ? Alert.alert('Remove player?', 'Their buy-ins will be removed too.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: doRemove }])
          : doRemove(),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const discrepancy = math.settlement.discrepancyCents;
  const inSession = detail.players.map((p) => p.player.id);

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between', marginTop: space.sm }}>
        <Row>
          <IconButton label="←" onPress={() => router.back()} />
          <View>
            <Title>{detail.session.title ?? formatDate(detail.session.date)}</Title>
            {detail.session.title ? <Caption>{formatDate(detail.session.date)}</Caption> : null}
          </View>
        </Row>
        <Button label="Settle up" onPress={() => router.push(`/session/${id}/settle`)} />
      </Row>

      <FlatList
        data={math.rows}
        keyExtractor={(r) => r.playerId}
        renderItem={({ item }) => {
          const d = detail.players.find((p) => p.player.id === item.playerId)!;
          return (
            <PlayerRow
              row={item}
              detail={d}
              onAddDefaultBuyin={() => safe(() => store.addBuyin(d.sp.id, detail.session.defaultBuyinCents))}
              onCustomBuyin={() => setPad({ kind: 'customBuyin', spId: d.sp.id })}
              onEditBuyin={(b) => setPad({ kind: 'editBuyin', buyin: b })}
              onEditCashout={() => setPad({ kind: 'cashout', spId: d.sp.id, current: d.sp.cashoutCents })}
              onLongPress={() => onRowLongPress(d.sp.id, d.player.name, d.buyins.length > 0)}
            />
          );
        }}
        ListFooterComponent={
          <View style={{ paddingBottom: 40 }}>
            <Button label="+ Add player" variant="secondary" onPress={() => setAddingPlayer(true)} />
            <View style={{ marginTop: space.lg }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <Caption>Total buy-ins</Caption><Body>{formatCents(math.totalBuyinCents, symbol)}</Body>
              </Row>
              <Row style={{ justifyContent: 'space-between' }}>
                <Caption>Total cash-out</Caption><Body>{formatCents(math.totalCashoutCents, symbol)}</Body>
              </Row>
            </View>
            {math.pendingCount > 0 && <View style={{ marginTop: space.md }}><Banner kind="info" text={`${math.pendingCount} not cashed out`} /></View>}
            {math.pendingCount === 0 && discrepancy !== 0 && (
              <View style={{ marginTop: space.md }}>
                <Banner kind="warn" text={`Off by ${formatCents(Math.abs(discrepancy), symbol)} — ${discrepancy > 0 ? 'too much cashed out' : 'cash missing'}. Recount?`} />
              </View>
            )}
          </View>
        }
      />

      <AmountPad
        visible={pad.kind === 'customBuyin'}
        title="Buy-in amount"
        initialCents={detail.session.defaultBuyinCents}
        onCancel={closePad}
        onConfirm={(c) => { if (pad.kind === 'customBuyin') safe(() => store.addBuyin(pad.spId, c)); closePad(); }}
      />
      <AmountPad
        visible={pad.kind === 'editBuyin'}
        title="Edit buy-in"
        initialCents={pad.kind === 'editBuyin' ? pad.buyin.amountCents : null}
        onCancel={closePad}
        onConfirm={(c) => { if (pad.kind === 'editBuyin') safe(() => store.updateBuyin(pad.buyin.id, c)); closePad(); }}
        onDelete={() => { if (pad.kind === 'editBuyin') safe(() => store.removeBuyin(pad.buyin.id)); closePad(); }}
      />
      <AmountPad
        visible={pad.kind === 'cashout'}
        title="Cash-out"
        allowZero
        initialCents={pad.kind === 'cashout' ? pad.current : null}
        onCancel={closePad}
        onConfirm={(c) => { if (pad.kind === 'cashout') safe(() => store.setCashout(pad.spId, c)); closePad(); }}
        onDelete={pad.kind === 'cashout' && pad.current !== null ? () => { if (pad.kind === 'cashout') safe(() => store.setCashout(pad.spId, null)); closePad(); } : undefined}
      />

      <Modal visible={addingPlayer} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setAddingPlayer(false)}>
        <Screen>
          <Subtitle>Add player</Subtitle>
          <PlayerPicker
            selectedIds={[]}
            excludeIds={inSession}
            onChange={(ids) => { const pid = ids[0]; if (pid) { safe(() => store.addPlayer(pid)); setAddingPlayer(false); } }}
          />
          <Button label="Done" variant="ghost" onPress={() => setAddingPlayer(false)} style={{ marginTop: space.lg }} />
        </Screen>
      </Modal>
    </Screen>
  );
}
```

- [ ] **Step 4: Type check and manual test**

Run: `npx tsc --noEmit`
Expected: clean.

Run app: open a session. Tap `+` on a player → `$20` pill appears instantly. Long-press `+` → pad with 20 prefilled, enter 35 → `$35` pill. Tap a pill → edit pad, "Remove" deletes it. Tap cash-out → pad, enter 50 → net shows green. Set all cash-outs → banner shows "Off by …" when totals mismatch, disappears when they balance. Long-press row → Remove from night. "+ Add player" → pick a player not yet in session. Back → home card shows top winner.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(app): session editor with buy-ins, cash-out, amount pad

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 13: Chip calculator sheet

**Files:**
- Create: `src/components/ChipSheet.tsx`
- Modify: `src/app/session/[id]/index.tsx` (wire "Use chips" into cash-out pad)

**Interfaces:**
- Consumes: `useSettingsStore.denoms`, `chipsToCents`.
- Produces:
  ```tsx
  export function ChipSheet({ visible, onUse, onCancel }: { visible: boolean; onUse(cents: number): void; onCancel(): void })
  ```

- [ ] **Step 1: Create `src/components/ChipSheet.tsx`**

```tsx
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, TextInput, View } from 'react-native';
import { Body, Button, Caption, Row, Subtitle } from '@/components/ui';
import { chipsToCents } from '@/domain/chips';
import { formatCents } from '@/domain/money';
import { useSettingsStore } from '@/store/useSettingsStore';
import { colors, radius, space } from '@/theme';

export function ChipSheet({ visible, onUse, onCancel }: { visible: boolean; onUse: (cents: number) => void; onCancel: () => void }) {
  const denoms = useSettingsStore((s) => s.denoms);
  const symbol = useSettingsStore((s) => s.settings.currencySymbol);
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => { if (visible) setCounts({}); }, [visible]);

  const total = useMemo(() => chipsToCents(counts, denoms), [counts, denoms]);
  const setCount = (id: string, n: number) => setCounts((c) => ({ ...c, [id]: Math.max(0, Math.floor(n) || 0) }));

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: colors.bg, padding: space.lg }}>
        <Subtitle>Count chips</Subtitle>
        <ScrollView keyboardShouldPersistTaps="handled">
          {denoms.map((d) => (
            <Row key={d.id} style={{ justifyContent: 'space-between', marginBottom: space.md, backgroundColor: colors.card, padding: space.md, borderRadius: radius.md }}>
              <Row>
                <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: d.colorHex, borderWidth: 2, borderColor: colors.border, marginRight: space.sm }} />
                <View>
                  <Body style={{ fontWeight: '700' }}>{d.label}</Body>
                  <Caption>{formatCents(d.valueCents, symbol)} each</Caption>
                </View>
              </Row>
              <Row>
                <Pressable onPress={() => setCount(d.id, (counts[d.id] ?? 0) - 1)} hitSlop={8} style={stepBtn}><Body>−</Body></Pressable>
                <TextInput
                  value={String(counts[d.id] ?? 0)}
                  onChangeText={(t) => setCount(d.id, parseInt(t, 10))}
                  keyboardType="number-pad"
                  selectTextOnFocus
                  style={{ width: 56, textAlign: 'center', color: colors.text, fontSize: 18, fontWeight: '700' }}
                />
                <Pressable onPress={() => setCount(d.id, (counts[d.id] ?? 0) + 1)} hitSlop={8} style={stepBtn}><Body>+</Body></Pressable>
              </Row>
            </Row>
          ))}
        </ScrollView>
        <Row style={{ justifyContent: 'space-between', marginVertical: space.md }}>
          <Caption>Total</Caption>
          <Body style={{ fontSize: 24, fontWeight: '800' }}>{formatCents(total, symbol)}</Body>
        </Row>
        <Button label={`Use ${formatCents(total, symbol)}`} onPress={() => onUse(total)} />
        <Button label="Cancel" variant="ghost" onPress={onCancel} style={{ marginTop: space.sm }} />
      </View>
    </Modal>
  );
}

const stepBtn = { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.cardAlt, alignItems: 'center', justifyContent: 'center' } as const;
```

- [ ] **Step 2: Wire into session editor**

In `src/app/session/[id]/index.tsx`:
- Add imports: `import { ChipSheet } from '@/components/ChipSheet';` and `const denoms = useSettingsStore((s) => s.denoms);`
- Add state: `const [chipFor, setChipFor] = useState<string | null>(null);`
- On the cash-out `AmountPad`, add prop:
  ```tsx
  extraAction={denoms.length > 0 && pad.kind === 'cashout' ? { label: 'Use chips', onPress: () => { const spId = pad.spId; closePad(); setChipFor(spId); } } : undefined}
  ```
- After the three `AmountPad`s render:
  ```tsx
  <ChipSheet
    visible={chipFor !== null}
    onCancel={() => setChipFor(null)}
    onUse={(c) => { if (chipFor) safe(() => store.setCashout(chipFor, c)); setChipFor(null); }}
  />
  ```

- [ ] **Step 3: Type check and manual test**

Run: `npx tsc --noEmit`. Expected: clean.

Manual: with no denoms configured, cash-out pad has no "Use chips" button. Temporarily insert denoms by running in the app console is awkward, so this is verified fully after Task 17 (Settings). For now confirm the button is absent and no errors.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(app): chip calculator sheet for cash-out

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 14: Settlement screen

**Files:**
- Modify: `src/app/session/[id]/settle.tsx` (replace stub)

**Interfaces:**
- Consumes: `useSessionsStore.detail`, `summarize`, `MoneyText`, `Banner`, `Avatar`.
- Produces: screen at `/session/[id]/settle` accepting optional `?share=1` query (used in Task 15 to auto-trigger share). Exposes nothing else.

- [ ] **Step 1: Replace `src/app/session/[id]/settle.tsx`**

```tsx
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Screen, Title, Subtitle, Body, Caption, Row, IconButton, Banner, Avatar, Button } from '@/components/ui';
import { MoneyText } from '@/components/MoneyText';
import { formatDate } from '@/components/SessionCard';
import { useSessionsStore } from '@/store/useSessionsStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { summarize } from '@/domain/nets';
import { formatCents } from '@/domain/money';
import { colors, radius, space } from '@/theme';

export default function SettleScreen() {
  const { id } = useLocalSearchParams<{ id: string; share?: string }>();
  const router = useRouter();
  const detail = useSessionsStore((s) => s.detail);
  const open = useSessionsStore((s) => s.open);
  const symbol = useSettingsStore((s) => s.settings.currencySymbol);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => { if (id && detail?.session.id !== id) open(id); }, [id]);

  const math = useMemo(() => (detail ? summarize(detail) : null), [detail]);
  if (!detail || !math || detail.session.id !== id) return <Screen><Body dim>Loading…</Body></Screen>;

  const nameOf = (pid: string) => math.rows.find((r) => r.playerId === pid)?.name ?? '?';
  const seedOf = (pid: string) => math.rows.find((r) => r.playerId === pid)?.colorSeed ?? 0;
  const disc = math.settlement.discrepancyCents;
  const sorted = [...math.rows].filter((r) => r.netCents !== null).sort((a, b) => (b.netCents ?? 0) - (a.netCents ?? 0));

  return (
    <Screen scroll>
      <Row style={{ marginTop: space.sm }}>
        <IconButton label="←" onPress={() => router.back()} />
        <View>
          <Title>{detail.session.title ?? 'Settle up'}</Title>
          <Caption>{formatDate(detail.session.date)}</Caption>
        </View>
      </Row>

      {math.pendingCount > 0 && <Banner kind="info" text={`${math.pendingCount} player${math.pendingCount === 1 ? '' : 's'} not cashed out — excluded below`} />}
      {disc !== 0 && <Banner kind="warn" text={`Books off by ${formatCents(Math.abs(disc), symbol)} (${disc > 0 ? 'too much cashed out' : 'cash missing'})`} />}

      <Subtitle>Who pays who</Subtitle>
      {math.settlement.transfers.length === 0 ? (
        <Body dim>Nobody owes anything.</Body>
      ) : (
        math.settlement.transfers.map((t, i) => (
          <Row key={i} style={{ justifyContent: 'space-between', backgroundColor: colors.card, padding: space.md, borderRadius: radius.md, marginBottom: space.sm }}>
            <Row>
              <Avatar name={nameOf(t.from)} seed={seedOf(t.from)} size={28} />
              <Body style={{ marginHorizontal: 6 }}>{nameOf(t.from)}</Body>
              <Caption>pays</Caption>
              <Body style={{ marginHorizontal: 6 }}>{nameOf(t.to)}</Body>
              <Avatar name={nameOf(t.to)} seed={seedOf(t.to)} size={28} />
            </Row>
            <MoneyText cents={t.amountCents} size={18} />
          </Row>
        ))
      )}

      <Subtitle>Results</Subtitle>
      {sorted.map((r) => (
        <Row key={r.playerId} style={{ justifyContent: 'space-between', paddingVertical: 8 }}>
          <Row><Avatar name={r.name} seed={r.colorSeed} size={28} /><Body style={{ marginLeft: 8 }}>{r.name}</Body></Row>
          <MoneyText cents={r.netCents ?? 0} signed />
        </Row>
      ))}

      <Pressable onPress={() => setShowDetails((v) => !v)}>
        <Subtitle>{showDetails ? 'Details ▾' : 'Details ▸'}</Subtitle>
      </Pressable>
      {showDetails && (
        <View>
          <Row style={{ justifyContent: 'space-between', paddingVertical: 4 }}>
            <Caption>Player</Caption><Caption>Buy-ins · Cash-out · Net</Caption>
          </Row>
          {math.rows.map((r) => (
            <Row key={r.playerId} style={{ justifyContent: 'space-between', paddingVertical: 6 }}>
              <Body>{r.name}</Body>
              <Body style={{ fontVariant: ['tabular-nums'] }}>
                {formatCents(r.buyinCents, symbol)} · {r.cashoutCents === null ? '—' : formatCents(r.cashoutCents, symbol)} · {r.netCents === null ? '—' : formatCents(r.netCents, symbol)}
              </Body>
            </Row>
          ))}
        </View>
      )}

      <View style={{ height: space.xl }} />
      <Button label="Share" onPress={() => {}} />
    </Screen>
  );
}
```

- [ ] **Step 2: Type check and manual test**

Run: `npx tsc --noEmit`. Expected: clean.

Manual: session with 3 players, two cashed out → info banner, transfers list, results sorted. Make totals mismatch → amber banner. Details toggles.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(app): settlement screen

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 15: Share card and share flow

**Files:**
- Create: `src/components/ShareCard.tsx`, `src/share.ts`
- Modify: `src/app/session/[id]/settle.tsx` (render hidden card, wire Share button, honour `?share=1`)

**Interfaces:**
- Produces:
  ```tsx
  export const ShareCard = React.forwardRef<View, { detail: SessionDetail; math: SessionSummaryMath; symbol: string }>(...)
  // share.ts
  export async function captureAndShare(ref: React.RefObject<View | null>): Promise<void>   // throws Error with message on failure
  ```

- [ ] **Step 1: Create `src/share.ts`**

```ts
import type { RefObject } from 'react';
import type { View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';

export async function captureAndShare(ref: RefObject<View | null>): Promise<void> {
  if (!ref.current) throw new Error('Nothing to share yet');
  const uri = await captureRef(ref, { format: 'png', quality: 1, result: 'tmpfile' });
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device');
  await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share settlement' });
}
```

- [ ] **Step 2: Create `src/components/ShareCard.tsx`**

```tsx
import React, { forwardRef } from 'react';
import { Text, View } from 'react-native';
import type { SessionDetail } from '@/domain/types';
import type { SessionSummaryMath } from '@/domain/nets';
import { formatCents, formatSigned } from '@/domain/money';
import { formatDate } from '@/components/SessionCard';
import { colors, avatarColor } from '@/theme';

const W = 1080;
const PAD = 64;
const F = { title: 64, h: 40, body: 44, small: 32 };

export const ShareCard = forwardRef<View, { detail: SessionDetail; math: SessionSummaryMath; symbol: string }>(
  function ShareCard({ detail, math, symbol }, ref) {
    const nameOf = (pid: string) => math.rows.find((r) => r.playerId === pid)?.name ?? '?';
    const disc = math.settlement.discrepancyCents;
    const sorted = [...math.rows].filter((r) => r.netCents !== null).sort((a, b) => (b.netCents ?? 0) - (a.netCents ?? 0));

    return (
      <View ref={ref} collapsable={false} style={{ width: W, backgroundColor: '#0E1113', padding: PAD }}>
        <Text style={{ color: colors.text, fontSize: F.title, fontWeight: '800' }}>{detail.session.title ?? 'Poker night'}</Text>
        <Text style={{ color: colors.textDim, fontSize: F.h, marginBottom: PAD / 2 }}>{formatDate(detail.session.date)}</Text>

        <Text style={{ color: colors.textDim, fontSize: F.small, fontWeight: '700', letterSpacing: 2, marginBottom: 16 }}>WHO PAYS WHO</Text>
        {math.settlement.transfers.length === 0 && <Text style={{ color: colors.textDim, fontSize: F.body }}>Nobody owes anything.</Text>}
        {math.settlement.transfers.map((t, i) => (
          <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: colors.card, padding: 28, borderRadius: 24, marginBottom: 16 }}>
            <Text style={{ color: colors.text, fontSize: F.body }}>
              <Text style={{ fontWeight: '700' }}>{nameOf(t.from)}</Text>
              <Text style={{ color: colors.textDim }}>  pays  </Text>
              <Text style={{ fontWeight: '700' }}>{nameOf(t.to)}</Text>
            </Text>
            <Text style={{ color: colors.text, fontSize: F.body, fontWeight: '800' }}>{formatCents(t.amountCents, symbol)}</Text>
          </View>
        ))}

        <Text style={{ color: colors.textDim, fontSize: F.small, fontWeight: '700', letterSpacing: 2, marginTop: PAD / 2, marginBottom: 16 }}>RESULTS</Text>
        {sorted.map((r) => (
          <View key={r.playerId} style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: avatarColor(r.colorSeed), marginRight: 20 }} />
              <Text style={{ color: colors.text, fontSize: F.body }}>{r.name}</Text>
            </View>
            <Text style={{ color: (r.netCents ?? 0) > 0 ? colors.pos : (r.netCents ?? 0) < 0 ? colors.neg : colors.textDim, fontSize: F.body, fontWeight: '800' }}>
              {formatSigned(r.netCents ?? 0, symbol)}
            </Text>
          </View>
        ))}

        <Text style={{ color: colors.textDim, fontSize: F.small, fontWeight: '700', letterSpacing: 2, marginTop: PAD / 2, marginBottom: 16 }}>DETAILS</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 8, borderBottomWidth: 2, borderBottomColor: colors.border }}>
          <Text style={{ color: colors.textDim, fontSize: F.small, flex: 2 }}>Player</Text>
          <Text style={{ color: colors.textDim, fontSize: F.small, flex: 1, textAlign: 'right' }}>In</Text>
          <Text style={{ color: colors.textDim, fontSize: F.small, flex: 1, textAlign: 'right' }}>Out</Text>
          <Text style={{ color: colors.textDim, fontSize: F.small, flex: 1, textAlign: 'right' }}>Net</Text>
        </View>
        {math.rows.map((r) => (
          <View key={r.playerId} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10 }}>
            <Text style={{ color: colors.text, fontSize: F.small, flex: 2 }}>{r.name}</Text>
            <Text style={{ color: colors.text, fontSize: F.small, flex: 1, textAlign: 'right' }}>{formatCents(r.buyinCents, symbol)}</Text>
            <Text style={{ color: colors.text, fontSize: F.small, flex: 1, textAlign: 'right' }}>{r.cashoutCents === null ? '—' : formatCents(r.cashoutCents, symbol)}</Text>
            <Text style={{ color: colors.text, fontSize: F.small, flex: 1, textAlign: 'right' }}>{r.netCents === null ? '—' : formatSigned(r.netCents, symbol)}</Text>
          </View>
        ))}

        {disc !== 0 && (
          <Text style={{ color: colors.warn, fontSize: F.small, marginTop: 24 }}>
            Books off by {formatCents(Math.abs(disc), symbol)} ({disc > 0 ? 'too much cashed out' : 'cash missing'})
          </Text>
        )}

        <Text style={{ color: colors.textDim, fontSize: F.small, marginTop: PAD / 2, textAlign: 'right' }}>Chips</Text>
      </View>
    );
  },
);
```

- [ ] **Step 3: Wire into settle screen**

In `src/app/session/[id]/settle.tsx`:
- Imports: `import { useRef } from 'react';` (merge with existing React import), `import { ShareCard } from '@/components/ShareCard';`, `import { captureAndShare } from '@/share';`, `import { toastError } from '@/components/ui';` (add to existing ui import), and `import { View } from 'react-native'` already present.
- Read `share` param: `const { id, share } = useLocalSearchParams<{ id: string; share?: string }>();`
- Add `const cardRef = useRef<View>(null);` and `const [sharing, setSharing] = useState(false);`
- Add:
  ```tsx
  const doShare = async () => {
    setSharing(true);
    try { await captureAndShare(cardRef); } catch (e) { toastError(e); } finally { setSharing(false); }
  };
  useEffect(() => {
    if (share === '1' && math && detail?.session.id === id) {
      const t = setTimeout(doShare, 300); // let the offscreen card lay out first
      return () => clearTimeout(t);
    }
  }, [share, math, detail?.session.id]);
  ```
- Replace `<Button label="Share" onPress={() => {}} />` with `<Button label={sharing ? 'Preparing…' : 'Share'} onPress={doShare} disabled={sharing} />`.
- Render the card offscreen, outside the ScrollView content but inside the component return. Easiest: wrap the existing return in a fragment and add after `</Screen>`:
  ```tsx
  <View style={{ position: 'absolute', left: -5000, top: 0 }} pointerEvents="none">
    <ShareCard ref={cardRef} detail={detail} math={math} symbol={symbol} />
  </View>
  ```

- [ ] **Step 4: Type check and manual test**

Run: `npx tsc --noEmit`. Expected: clean.

Manual (iOS simulator): tap Share → iOS share sheet opens with a PNG; choose "Save Image", open Photos, confirm the card is 1080px wide, dark, shows transfers, results, details. Home → long-press a card → Share → lands on settle screen and share sheet opens automatically.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(app): shareable settlement card via native share sheet

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 16: Players screen

**Files:**
- Modify: `src/app/players.tsx` (replace stub)

**Interfaces:**
- Consumes: `usePlayersStore`, `AmountPad`-style inline editing not needed; uses `Alert.prompt` on iOS and a small modal TextInput on Android for rename.

- [ ] **Step 1: Replace `src/app/players.tsx`**

```tsx
import React, { useState } from 'react';
import { Alert, FlatList, Modal, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Title, Row, IconButton, Body, Caption, Avatar, Button, Card, toastError, Subtitle } from '@/components/ui';
import { usePlayersStore } from '@/store/usePlayersStore';
import type { Player } from '@/domain/types';
import { colors, radius, space } from '@/theme';

export default function PlayersScreen() {
  const router = useRouter();
  const players = usePlayersStore((s) => s.players);
  const { add, rename, setArchived, remove } = usePlayersStore.getState();
  const [editing, setEditing] = useState<{ player: Player | null; name: string } | null>(null);

  const safe = (fn: () => void) => { try { fn(); } catch (e) { toastError(e); } };

  const onLongPress = (p: Player) =>
    Alert.alert(p.name, undefined, [
      { text: 'Rename', onPress: () => setEditing({ player: p, name: p.name }) },
      { text: p.archived ? 'Unarchive' : 'Archive', onPress: () => safe(() => setArchived(p.id, !p.archived)) },
      {
        text: 'Delete', style: 'destructive',
        onPress: () => Alert.alert('Delete player?', 'Only possible if they never played.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => safe(() => remove(p.id)) },
        ]),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);

  const save = () => {
    if (!editing) return;
    safe(() => {
      if (editing.player) rename(editing.player.id, editing.name);
      else add(editing.name);
      setEditing(null);
    });
  };

  const active = players.filter((p) => !p.archived);
  const archived = players.filter((p) => p.archived);

  const item = (p: Player) => (
    <Card key={p.id} onPress={() => setEditing({ player: p, name: p.name })} onLongPress={() => onLongPress(p)} style={{ padding: space.md }}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Row><Avatar name={p.name} seed={p.colorSeed} /><Body style={{ marginLeft: space.sm, fontWeight: '600' }}>{p.name}</Body></Row>
        {p.archived && <Caption>archived</Caption>}
      </Row>
    </Card>
  );

  return (
    <Screen>
      <Row style={{ justifyContent: 'space-between', marginTop: space.sm }}>
        <Row><IconButton label="←" onPress={() => router.back()} /><Title>Players</Title></Row>
        <Button label="+ New" variant="secondary" onPress={() => setEditing({ player: null, name: '' })} />
      </Row>
      <FlatList
        data={[...active, ...archived]}
        keyExtractor={(p) => p.id}
        renderItem={({ item: p }) => item(p)}
        ListEmptyComponent={<Body dim>No players yet.</Body>}
        ListHeaderComponent={<Caption>Tap to rename · long-press for more</Caption>}
        contentContainerStyle={{ paddingBottom: 80, paddingTop: space.sm }}
      />

      <Modal visible={editing !== null} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: space.xl }}>
          <View style={{ backgroundColor: colors.card, borderRadius: radius.lg, padding: space.lg }}>
            <Subtitle>{editing?.player ? 'Rename player' : 'New player'}</Subtitle>
            <TextInput
              value={editing?.name ?? ''}
              onChangeText={(t) => setEditing((e) => (e ? { ...e, name: t } : e))}
              autoFocus
              onSubmitEditing={save}
              placeholder="Name"
              placeholderTextColor={colors.textDim}
              style={{ color: colors.text, backgroundColor: colors.cardAlt, borderRadius: radius.md, padding: 12, fontSize: 18 }}
            />
            <Row style={{ marginTop: space.md }}>
              <Button label="Cancel" variant="secondary" onPress={() => setEditing(null)} style={{ flex: 1, marginRight: space.sm }} />
              <Button label="Save" onPress={save} disabled={!editing?.name.trim()} style={{ flex: 1 }} />
            </Row>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}
```

- [ ] **Step 2: Type check and manual test**

Run: `npx tsc --noEmit`. Expected: clean.

Manual: from home tap 👥. "+ New" adds; duplicate name shows Error alert. Tap → rename. Long-press → Archive hides from New Night picker; Delete on a player with history shows "Player has sessions".

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(app): players roster screen

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 17: Settings screen (default buy-in, chip denominations)

**Files:**
- Modify: `src/app/settings.tsx` (replace stub)

**Interfaces:**
- Consumes: `useSettingsStore`, `AmountPad`, `parseMoneyInput`.

- [ ] **Step 1: Replace `src/app/settings.tsx`**

```tsx
import React, { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen, Title, Subtitle, Row, IconButton, Body, Caption, Button, Card, toastError } from '@/components/ui';
import { AmountPad } from '@/components/AmountPad';
import { useSettingsStore } from '@/store/useSettingsStore';
import { formatCents, parseMoneyInput } from '@/domain/money';
import type { ChipDenom } from '@/domain/types';
import { colors, radius, space } from '@/theme';

const SWATCHES = ['#F5F5F5', '#E53935', '#43A047', '#1E88E5', '#000000', '#8E24AA', '#FB8C00', '#FDD835', '#00897B', '#6D4C41'];

type DenomDraft = { id: string | null; label: string; colorHex: string; valueText: string };

export default function SettingsScreen() {
  const router = useRouter();
  const { settings, denoms } = useSettingsStore();
  const { setDefaultBuyin, addDenom, updateDenom, removeDenom, reorderDenoms } = useSettingsStore.getState();
  const [buyinPad, setBuyinPad] = useState(false);
  const [draft, setDraft] = useState<DenomDraft | null>(null);

  const safe = (fn: () => void) => { try { fn(); } catch (e) { toastError(e); } };

  const saveDenom = () => {
    if (!draft) return;
    const valueCents = parseMoneyInput(draft.valueText);
    if (valueCents === null) return toastError(new Error('Enter a valid value'));
    safe(() => {
      if (draft.id) updateDenom(draft.id, { label: draft.label, colorHex: draft.colorHex, valueCents });
      else addDenom({ label: draft.label, colorHex: draft.colorHex, valueCents });
      setDraft(null);
    });
  };

  const move = (d: ChipDenom, dir: -1 | 1) => {
    const ids = denoms.map((x) => x.id);
    const i = ids.indexOf(d.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    safe(() => reorderDenoms(ids));
  };

  const onLongPress = (d: ChipDenom) =>
    Alert.alert(d.label, undefined, [
      { text: 'Move up', onPress: () => move(d, -1) },
      { text: 'Move down', onPress: () => move(d, 1) },
      { text: 'Delete', style: 'destructive', onPress: () => safe(() => removeDenom(d.id)) },
      { text: 'Cancel', style: 'cancel' },
    ]);

  return (
    <Screen scroll>
      <Row style={{ marginTop: space.sm }}>
        <IconButton label="←" onPress={() => router.back()} />
        <Title>Settings</Title>
      </Row>

      <Subtitle>Default buy-in</Subtitle>
      <Card onPress={() => setBuyinPad(true)}>
        <Row style={{ justifyContent: 'space-between' }}>
          <Body>Amount added when you tap +</Body>
          <Body style={{ fontWeight: '700' }}>{formatCents(settings.defaultBuyinCents, settings.currencySymbol)}</Body>
        </Row>
      </Card>

      <Subtitle>Chip denominations</Subtitle>
      <Caption>Optional. Lets you count chips at cash-out. Tap to edit, long-press to reorder or delete.</Caption>
      <View style={{ height: space.sm }} />
      {denoms.map((d) => (
        <Card key={d.id} onPress={() => setDraft({ id: d.id, label: d.label, colorHex: d.colorHex, valueText: formatCents(d.valueCents, '') })} onLongPress={() => onLongPress(d)} style={{ padding: space.md }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Row>
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: d.colorHex, borderWidth: 2, borderColor: colors.border, marginRight: space.sm }} />
              <Body style={{ fontWeight: '600' }}>{d.label}</Body>
            </Row>
            <Body>{formatCents(d.valueCents, settings.currencySymbol)}</Body>
          </Row>
        </Card>
      ))}
      <Button label="+ Add denomination" variant="secondary" onPress={() => setDraft({ id: null, label: '', colorHex: SWATCHES[1], valueText: '' })} />

      <AmountPad
        visible={buyinPad}
        title="Default buy-in"
        initialCents={settings.defaultBuyinCents}
        onCancel={() => setBuyinPad(false)}
        onConfirm={(c) => { safe(() => setDefaultBuyin(c)); setBuyinPad(false); }}
      />

      <Modal visible={draft !== null} transparent animationType="fade" onRequestClose={() => setDraft(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: space.xl }}>
          <View style={{ backgroundColor: colors.card, borderRadius: radius.lg, padding: space.lg }}>
            <Subtitle>{draft?.id ? 'Edit denomination' : 'New denomination'}</Subtitle>
            <TextInput value={draft?.label ?? ''} onChangeText={(t) => setDraft((d) => (d ? { ...d, label: t } : d))} placeholder="Label (e.g. Red)" placeholderTextColor={colors.textDim} style={input} />
            <Row style={{ marginTop: space.sm }}>
              <Body style={{ marginRight: 4 }}>{settings.currencySymbol}</Body>
              <TextInput value={draft?.valueText ?? ''} onChangeText={(t) => setDraft((d) => (d ? { ...d, valueText: t } : d))} keyboardType="decimal-pad" placeholder="Value" placeholderTextColor={colors.textDim} style={[input, { flex: 1 }]} />
            </Row>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: space.md }}>
              {SWATCHES.map((c) => (
                <Pressable key={c} onPress={() => setDraft((d) => (d ? { ...d, colorHex: c } : d))}
                  style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c, marginRight: 10, borderWidth: draft?.colorHex === c ? 3 : 1, borderColor: draft?.colorHex === c ? colors.accent : colors.border }} />
              ))}
            </ScrollView>
            <Row style={{ marginTop: space.md }}>
              <Button label="Cancel" variant="secondary" onPress={() => setDraft(null)} style={{ flex: 1, marginRight: space.sm }} />
              <Button label="Save" onPress={saveDenom} disabled={!draft?.label.trim() || !draft?.valueText.trim()} style={{ flex: 1 }} />
            </Row>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const input = { color: colors.text, backgroundColor: colors.cardAlt, borderRadius: radius.md, padding: 12, fontSize: 16 } as const;
```

- [ ] **Step 2: Type check and manual test**

Run: `npx tsc --noEmit`. Expected: clean.

Manual: change default buy-in to $25 → New Night prefills 25, session `+` adds $25 (for new sessions). Add denoms White $0.25, Red $1, Green $5. Open a session → cash-out pad shows "Use chips" → ChipSheet → counts → "Use $X" fills cash-out. Long-press denom → reorder/delete.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(app): settings screen with chip denominations

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 18: Full manual checklist, README, Android check

**Files:**
- Create: `README.md`
- Modify: none unless bugs found

- [ ] **Step 1: Run the full automated suite**

Run: `npx tsc --noEmit && npm test`
Expected: clean, all tests pass. Paste the summary line into the commit body.

- [ ] **Step 2: iOS manual checklist (fresh install)**

Uninstall the app from the simulator first so the DB is fresh, then `npx expo start --ios`:

1. Empty home. Tap + → add players Ann, Bob, Cat → Start.
2. Ann: + + (two $20). Bob: + then long-press + → 35. Cat: +.
3. Cash-out: Ann 10, Bob 80, Cat 5. Footer shows "Off by …" (95 vs 115 in → cash missing $20). Fix Cat → 25. Banner gone.
4. Settle up: exactly 2 transfers (Ann pays Bob 30, Cat pays Bob 15... verify math: Ann −30, Bob +25, Cat +5 → Ann pays Bob 25, Ann pays Cat 5). Results sorted. Details toggles.
5. Share → share sheet → Save Image → open Photos, card legible.
6. Back to home → card shows Bob +$25. Long-press → Share → auto opens sheet.
7. Players: rename Cat → Catherine; archive Bob → not in New Night picker; try delete Ann → error alert.
8. Settings: default buy-in 25; add 3 denoms; in session cash-out → Use chips → total fills.
9. Kill app, relaunch → all data still there.

- [ ] **Step 3: Android check**

If an Android emulator or device with Expo Go is available: `npx expo start --android`, repeat steps 1–5. Note any layout issue and fix inline (commit as `fix(android): …`). If no Android environment is present, record that in the README under "Status" and move on.

- [ ] **Step 4: Write `README.md`**

```markdown
# Chips

Poker-night balance tracker. Log buy-ins and cash-outs per player, get the fewest transfers to settle, share a settlement card.

## Run

    npm install
    npx expo start        # then press i (iOS simulator) or a (Android)

## Test

    npm test              # Jest: domain math, repositories, stores
    npx tsc --noEmit

## Layout

- `src/domain` pure math (nets, minimal-transfer settlement, money, chips)
- `src/db` SQLite schema, migrations, adapters (expo-sqlite on device, node:sqlite in tests)
- `src/repo` SQL-backed CRUD
- `src/store` Zustand stores
- `src/app` Expo Router screens
- `src/components` UI

Design spec: `docs/superpowers/specs/2026-09-16-poker-balance-tracker-design.md`
Plan: `docs/superpowers/plans/2026-09-16-poker-balance-tracker.md`

## Build for a phone

    npm install -g eas-cli
    eas login
    eas build:configure
    eas build --profile preview --platform ios      # or android → APK

## Status

v1 on-device only. Sync, leaderboard and charts deferred (see spec §11).
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "docs: README with run, test, and build instructions

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Self-review notes

- Spec §6.3 "swipe row → remove" implemented as long-press action sheet (recorded in Global Constraints).
- Spec §7 fallback "save to media library" replaced by an error toast when sharing is unavailable; on iOS/Android the share sheet itself offers "Save Image". No `expo-media-library` permission prompt needed.
- Spec §6.1 top-winner summary: implemented in `listSessionSummaries` via `computeRows`.
- Spec §5.2 determinism: `greedy` uses stable sort over `sort_order`-ordered rows; subset search prefers lowest bitmask.
- All types referenced across tasks: `Net`, `Transfer`, `SettlementResult` (Task 3); `PlayerNetRow`, `SessionSummaryMath` (Task 4); `Db`, `SqlParam` (Task 5); `CreateSessionInput` (Task 8); stores (Task 9); `AmountPad`, `PlayerRow` (Task 12); `ChipSheet` (13); `ShareCard`, `captureAndShare` (15).
