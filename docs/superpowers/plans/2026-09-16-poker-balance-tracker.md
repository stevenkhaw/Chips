# Poker Balance Tracker ("Chips") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an on-device iOS/Android app that records poker-night buy-ins and cash-outs per player, computes the fewest transfers to settle, and shares a settlement image.

**Architecture:** Expo (React Native + TypeScript) app with Expo Router screens. Pure domain functions (nets, minimal-transfer settlement, chip math, money formatting) are isolated in `src/domain` with no IO. A tiny `Db` interface abstracts SQLite so repositories run against `expo-sqlite` on device and Node's built-in `node:sqlite` in Jest. Zustand stores call repositories and hold UI state.

**Tech Stack:** Expo SDK 57, expo-router, expo-sqlite (sync API), expo-crypto, expo-sharing, expo-clipboard, react-native-view-shot, @react-native-community/datetimepicker, expo-font with `@expo-google-fonts/manrope` + `@expo-google-fonts/hanken-grotesk`, zustand 5, jest-expo, TypeScript strict. Node 25 (`node:sqlite`) for tests.

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
- No gesture libraries. Removing a player from a night, sharing/deleting a night, and reordering chip denominations are all long-press → `Alert` action sheets (spec §6.1, §6.3, §6.8).
- UI follows the Stitch export in `docs/design/stitch/` with the Felt & Ledger system (`docs/design/stitch/felt_ledger/DESIGN.md`). `src/theme.ts` is the single source for colors, spacing, radii, fonts, text styles, `avatarColor` and the chip swatches; no component contains a raw hex value. All money renders with `fontVariant: ['tabular-nums']`.
- Features are governed by the spec, not the mockups: no hosts, no WhatsApp-specific integration, no leaderboards, charts, login or sync.

---

## File Structure

```
package.json, app.json, tsconfig.json, babel.config.js, jest.config.js, jest.setup.ts
src/
  app/
    _layout.tsx                 Root Stack; loads fonts, opens DB, migrates, hydrates stores
    index.tsx                   Home: CHIPS wordmark, stat tiles, "Ready to deal?", past nights
    new-session/
      index.tsx                 New night step 1 of 2: title, date, buy-in presets
      players.tsx               New night step 2 of 2: roster checklist, "Confirm & Start Game"
    session/[id]/index.tsx      Open night: Buy-ins | Cash-out | Settle segmented spine
    session/[id]/settle.tsx     Settlements, share card preview, share + copy
    players.tsx                 Roster
    settings.tsx                Default buy-in + chip denominations
  components/
    ui.tsx                      Screen, NavHeader, text scale, Button, Card, Row, Banner, Avatar,
                                Pill, IconButton, SegmentedControl, StatTile, StatusPill, Checkbox,
                                ChipGlyph, Divider, toastError
    MoneyText.tsx               Tabular, sign-coloured money display
    AmountPad.tsx               Bottom-sheet numeric entry for cents
    ChipSheet.tsx               Chip-by-colour counter (calculator only, never persisted)
    PlayerChecklist.tsx         Roster rows with checkbox / add glyph
    NightRow.tsx                Home past-night row (title, date · players, pot pool)
    BuyinRow.tsx                Live-table row: avatar, buy-in pills, orange +
    CashoutRow.tsx              Cash-out row: avatar, In total, cash-out, net
    TransferRow.tsx             "Ann pays → Bob   $25"
    ShareCard.tsx               1080px message-style settlement card for capture
  domain/
    types.ts                    Row and aggregate types
    money.ts                    formatCents, formatSigned, parseMoneyInput
    settle.ts                   settle(): two-phase minimal transfers
    nets.ts                     computeRows, summarize (nets, totals, pending, settlement)
    chips.ts                    chipsToCents
  db/
    types.ts                    Db interface
    schema.ts                   MIGRATIONS array + migrate(db)
    connection.ts               setDb / getDb
    expo-adapter.ts             Db over expo-sqlite (imported only from _layout)
    ids.ts                      newId() via expo-crypto
    map.ts                      snake_case row -> camelCase object
  repo/
    players.ts
    settings.ts                 settings row + chip_denoms
    sessions.ts                 sessions, session_players, buyins, summaries, detail
  store/
    usePlayersStore.ts
    useSettingsStore.ts
    useSessionsStore.ts
    useNewNightDraft.ts         UI-only draft for the two-step new-night flow
  theme.ts                      colors, spacing, radii, fonts, textStyles, avatarColor, CHIP_SWATCHES
  date.ts                       todayIso, toIso, fromIso, formatDate, formatShortDate
  share.ts                      captureAndShare, buildShareText, copyToClipboard
test/
  nodeDb.ts                     Db over node:sqlite, in-memory, for Jest
```

**Visual design:** every screen follows the Stitch export in `docs/design/stitch/` with the
Felt & Ledger design system (`docs/design/stitch/felt_ledger/DESIGN.md`) as the source of truth for
colour, type and elevation. Per-screen hex values in the exported HTML are normalized to the token
set in `src/theme.ts`; components never contain raw hex.

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

  it('9 players where peel-smallest-subset heuristic gives 7; optimum is 6', () => {
    const vals = [-900, 500, -700, 600, 600, 200, 100, -800, 400];
    const nets = vals.map((v, i) => n(`p${i}`, v));
    const r = settle(nets);
    expect(r.transfers).toHaveLength(6);
    assertSettles(nets, r.transfers);
  });

  it('12 players: exact partition still runs and settles', () => {
    const nets: Net[] = [];
    for (let i = 0; i < 6; i++) nets.push(n(`w${i}`, 100 * (i + 1)));
    for (let i = 0; i < 6; i++) nets.push(n(`l${i}`, -100 * (i + 1)));
    const r = settle(nets);
    expect(r.discrepancyCents).toBe(0);
    expect(r.transfers).toHaveLength(6); // six exact pairs
    assertSettles(nets, r.transfers);
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

/** Above this many non-zero players, skip the exact partition search (O(n·2^n)). */
const SUBSET_LIMIT = 12;

export function settle(nets: Net[]): SettlementResult {
  const discrepancyCents = nets.reduce((s, x) => s + x.netCents, 0);
  const active = nets.filter((x) => x.netCents !== 0);
  const transfers: Transfer[] = [];
  let remainder = active;

  if (active.length > 0 && active.length <= SUBSET_LIMIT) {
    const { blocks, rest } = partitionZeroSum(active);
    for (const block of blocks) transfers.push(...greedy(block));
    remainder = rest;
  }

  transfers.push(...greedy(remainder));
  return { transfers, discrepancyCents };
}

/**
 * Splits nets into the maximum number of disjoint zero-sum blocks (exact), plus a
 * remainder that does not sum to zero (empty when the books balance).
 * Transfers = players − blocks, so maximising blocks minimises transfers.
 * dp[mask] = max number of complete zero-sum blocks inside mask.
 * Ties: lowest player index wins at every step, so output is deterministic.
 */
function partitionZeroSum(nets: Net[]): { blocks: Net[][]; rest: Net[] } {
  const n = nets.length;
  const size = 1 << n;
  const full = size - 1;

  const sum = new Int32Array(size);
  for (let mask = 1; mask < size; mask++) {
    const low = mask & -mask;
    const i = 31 - Math.clz32(low);
    sum[mask] = sum[mask ^ low] + nets[i].netCents;
  }

  const dp = new Int8Array(size);
  const choice = new Int8Array(size);
  for (let mask = 1; mask < size; mask++) {
    let best = -1;
    let bestI = 0;
    for (let i = 0; i < n; i++) {
      if (!(mask & (1 << i))) continue;
      const v = dp[mask ^ (1 << i)];
      if (v > best) {
        best = v;
        bestI = i;
      }
    }
    dp[mask] = best + (sum[mask] === 0 ? 1 : 0);
    choice[mask] = bestI;
  }

  // Walk the chosen path from full down to 0. Every zero-sum mask on the path closes a
  // segment: the first segment (above the first zero-sum mask) is the remainder, later
  // ones are blocks.
  const blocks: Net[][] = [];
  let rest: number[] = [];
  let segment: number[] = [];
  let seenZero = false;
  let mask = full;
  while (mask !== 0) {
    if (sum[mask] === 0) {
      if (seenZero) blocks.push(toBlock(segment, nets));
      else rest = segment;
      seenZero = true;
      segment = [];
    }
    const i = choice[mask];
    segment.push(i);
    mask ^= 1 << i;
  }
  if (seenZero) blocks.push(toBlock(segment, nets));
  else rest = segment;

  blocks.sort((a, b) => nets.indexOf(a[0]) - nets.indexOf(b[0]));
  return { blocks, rest: toBlock(rest, nets) };
}

function toBlock(indices: number[], nets: Net[]): Net[] {
  return [...indices].sort((a, b) => a - b).map((i) => nets[i]);
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
- Modify: `src/domain/types.ts` (add `totalBuyinCents` to `SessionSummary`)

**Interfaces:**
- Consumes: `computeRows` from `@/domain/nets`, `Player` types, players repo not needed (raw SQL).
- Produces:
  ```ts
  export interface CreateSessionInput { date: string; title: string | null; defaultBuyinCents: number; playerIds: string[] }
  export function createSession(db: Db, input: CreateSessionInput): Session
  export function updateSession(db: Db, id: string, patch: Partial<Pick<Session, 'date' | 'title' | 'defaultBuyinCents' | 'notes'>>): void
  export function deleteSession(db: Db, id: string): void            // soft-deletes session, its session_players and their buyins
  export function listSessionSummaries(db: Db): SessionSummary[]     // date DESC, created_at DESC
                                                                    // each carries totalBuyinCents (the night's pot pool)
  export function getSessionDetail(db: Db, id: string): SessionDetail | null
  export function addPlayerToSession(db: Db, sessionId: string, playerId: string): SessionPlayer   // throws Error('Player already in session')
  export function removePlayerFromSession(db: Db, sessionPlayerId: string): void   // soft-deletes sp + its buyins
  export function setCashout(db: Db, sessionPlayerId: string, cents: number | null): void   // throws Error('Amount must be non-negative') if cents<0 or non-integer
  export function addBuyin(db: Db, sessionPlayerId: string, amountCents: number): Buyin        // throws Error('Amount must be positive')
  export function updateBuyin(db: Db, buyinId: string, amountCents: number): void
  export function removeBuyin(db: Db, buyinId: string): void
  export function lastSessionPlayerIds(db: Db): string[]  // player ids from most recent session, [] if none
  ```

- [ ] **Step 1: Add `totalBuyinCents` to `SessionSummary` in `src/domain/types.ts`**

The home screen shows each night's pot pool and an all-time volume tile, both of which are the sum
of the night's buy-ins. Replace the `SessionSummary` interface with:

```ts
export interface SessionSummary {
  session: Session;
  playerCount: number;
  totalBuyinCents: number;
  topWinner: { name: string; netCents: number } | null;
}
```

Nothing else in `types.ts` changes.

- [ ] **Step 2: Write failing tests `src/repo/sessions.test.ts`**

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
    expect(sums[0].totalBuyinCents).toBe(4000);
    expect(sums[0].topWinner).toEqual({ name: 'Bob', netCents: 1500 });
    expect(sums[1].totalBuyinCents).toBe(0);
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

- [ ] **Step 3: Run to verify failure**

Run: `npm test -- repo/sessions`
Expected: FAIL, module not found.

- [ ] **Step 4: Implement `src/repo/sessions.ts`**

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

- [ ] **Step 5: Run tests**

Run: `npm test -- repo/sessions`
Expected: PASS. Note the `topWinner` test depends on `createSession` for `recent` being created after `old` (created_at tiebreak is irrelevant since dates differ).

- [ ] **Step 6: Commit**

```bash
git add src/domain/types.ts src/repo/sessions.ts src/repo/sessions.test.ts
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

### Task 10: Design tokens, fonts, and shared UI primitives (Felt & Ledger)

Implements the visual foundation for every screen: the normalized Felt & Ledger palette, the
Manrope / Hanken Grotesk type scale, and the primitive components the Stitch screens are built
from (nav header, segmented control, status pill, stat tile, checkbox, chip glyph).

Reference: `docs/design/stitch/felt_ledger/DESIGN.md`.

**Files:**
- Create: `src/theme.ts`, `src/date.ts`, `src/components/ui.tsx`, `src/components/MoneyText.tsx`
- Modify: `package.json` (font packages), `src/app/_layout.tsx`, `src/app/index.tsx`

**Interfaces:**
- Consumes: `formatCents`, `formatSigned` from `@/domain/money`; `useSettingsStore` (Task 9) for the currency symbol; `openExpoDb`, `migrate`, `setDb` (Task 5).
- Produces:
  ```ts
  // src/theme.ts
  export const colors: { bg, card, cardAlt, border, borderStrong, text, textDim, textMuted,
    accent, accentSoft, accentBorder, onAccent, orange, orangeSoft, orangeBorder, onOrange,
    info, infoSoft, pos, neg, negSoft, warn, warnSoft, warnBorder, danger, overlay }   // all string
  export const space: { xs: 4; sm: 8; md: 12; lg: 16; xl: 24; xxl: 32 }
  export const radius: { sm: 8; md: 12; lg: 16; xl: 20; pill: 999 }
  export const TAP: 44                               // minimum tap target
  export const fonts: { headline, headlineBold, title, numeric, numericMd, body, bodyMedium, bodySemi, bodyBold, mono }
  export const textStyles: { headlineXl, headlineLg, headlineMd, titleLg, bodyLg, bodyMd, bodySm,
    numericLg, numericMd, numericSm, labelMd, labelCaps }   // TextStyle each
  export const sheetShadow: ViewStyle
  export const CHIP_SWATCHES: readonly string[]
  export function avatarColor(seed: number): string
  // src/date.ts
  export function todayIso(): string                 // 'YYYY-MM-DD' local
  export function toIso(d: Date): string
  export function fromIso(iso: string): Date         // local noon, safe for pickers
  export function formatDate(iso: string): string    // 'Oct 12, 2024'
  export function formatShortDate(iso: string): string // 'Tue, Oct 12'
  ```
  ```tsx
  // src/components/ui.tsx
  export function Screen(p: { children: React.ReactNode; scroll?: boolean; padded?: boolean; footer?: React.ReactNode }): JSX.Element
  export function NavHeader(p: { title: string; onBack?: () => void; onClose?: () => void; overline?: string;
    overlineTone?: 'dim' | 'accent' | 'orange'; dot?: boolean; center?: boolean; right?: React.ReactNode; onTitlePress?: () => void }): JSX.Element
  export const Headline: (p: { children: React.ReactNode; style?: StyleProp<TextStyle>; numberOfLines?: number }) => JSX.Element
  export const Title: (same props) => JSX.Element
  export const Body: (props & { dim?: boolean }) => JSX.Element
  export const Caption: (props & { tone?: 'dim' | 'muted' }) => JSX.Element
  export const Overline: (props & { tone?: 'dim' | 'accent' | 'orange' }) => JSX.Element
  export const Label: (same props) => JSX.Element
  export function Button(p: { label: string; onPress: () => void; variant?: 'primary' | 'orange' | 'secondary' | 'ghost' | 'danger';
    size?: 'lg' | 'md'; disabled?: boolean; style?: StyleProp<ViewStyle> }): JSX.Element
  export function Row(p: { children: React.ReactNode; style?: StyleProp<ViewStyle> }): JSX.Element
  export function Card(p: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; onLongPress?: () => void }): JSX.Element
  export function Banner(p: { kind: 'info' | 'warn' | 'success'; text: string; style?: StyleProp<ViewStyle> }): JSX.Element
  export function Avatar(p: { name: string; seed: number; size?: number }): JSX.Element
  export function Pill(p: { label: string; tone?: 'default' | 'accent' | 'orange' | 'muted'; onPress?: () => void; onLongPress?: () => void; style?: StyleProp<ViewStyle> }): JSX.Element
  export function IconButton(p: { glyph: string; onPress: () => void; accessibilityLabel: string; variant?: 'plain' | 'circle' }): JSX.Element
  export function SegmentedControl<T extends string>(p: { segments: { key: T; label: string }[]; value: T; onChange: (key: T) => void; style?: StyleProp<ViewStyle> }): JSX.Element
  export function StatTile(p: { label: string; value: string; style?: StyleProp<ViewStyle> }): JSX.Element
  export function StatusPill(p: { tone: 'ok' | 'warn'; label: string; value: string; style?: StyleProp<ViewStyle> }): JSX.Element
  export function Checkbox(p: { checked: boolean }): JSX.Element
  export function ChipGlyph(p: { size?: number }): JSX.Element
  export function Divider(p?: { style?: StyleProp<ViewStyle> }): JSX.Element
  export function toastError(e: unknown): void
  // src/components/MoneyText.tsx
  export function MoneyText(p: { cents: number; signed?: boolean; variant?: 'lg' | 'md' | 'sm';
    color?: 'auto' | 'default' | 'accent' | 'dim'; style?: StyleProp<TextStyle> }): JSX.Element
  ```
  `_layout.tsx` loads the Google fonts, opens the DB, migrates, hydrates the three stores, then
  renders the Stack. All screens are `headerShown: false` (every screen draws its own `NavHeader`).

- [ ] **Step 1: Install the font packages**

```bash
cd /Users/stevenkhaw/Documents/GitHub/Chips
npm install @expo-google-fonts/manrope@0.4.2 @expo-google-fonts/hanken-grotesk@0.4.3
npx expo install expo-font
```

`expo-font` is already in `package.json`; the `npx expo install` call pins it to the version that
matches the installed Expo SDK. Confirm afterwards that `package.json` lists all three.

- [ ] **Step 2: Create `src/theme.ts`**

This file is the only place in the app (besides `CHIP_SWATCHES` below, which is the chip palette)
that may contain raw hex values. Every component imports tokens from here.

```ts
import { Platform, type TextStyle, type ViewStyle } from 'react-native';

/**
 * Felt & Ledger palette, normalized.
 * See docs/design/stitch/felt_ledger/DESIGN.md — "Colors".
 */
export const colors = {
  bg: '#0D0D0E',            // canvas
  card: '#18191B',          // level 1 container
  cardAlt: '#222427',       // level 2 module (inputs, steppers, wells)
  border: '#2A2C30',        // hairline
  borderStrong: '#374151',  // sheet top hairline
  text: '#FFFFFF',
  textDim: '#9CA3AF',
  textMuted: '#4B5563',

  accent: '#10B981',                        // Felt Emerald
  accentSoft: 'rgba(16, 185, 129, 0.15)',
  accentBorder: 'rgba(16, 185, 129, 0.30)',
  onAccent: '#0D0D0E',

  orange: '#FF7A00',                        // Casino Orange
  orangeSoft: 'rgba(255, 122, 0, 0.15)',
  orangeBorder: 'rgba(255, 122, 0, 0.35)',
  onOrange: '#0D0D0E',

  info: '#3B82F6',                          // Chip Blue
  infoSoft: 'rgba(59, 130, 246, 0.15)',

  pos: '#10B981',
  neg: '#F43F5E',
  negSoft: 'rgba(244, 63, 94, 0.15)',
  warn: '#F59E0B',
  warnSoft: 'rgba(245, 158, 11, 0.15)',
  warnBorder: 'rgba(245, 158, 11, 0.35)',
  danger: '#F43F5E',

  overlay: 'rgba(0, 0, 0, 0.6)',
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 };

/** Minimum tap target, per the design brief. */
export const TAP = 44;

export const fonts = {
  headline: 'Manrope_800ExtraBold',
  headlineBold: 'Manrope_700Bold',
  title: 'Manrope_600SemiBold',
  numeric: 'Manrope_800ExtraBold',
  numericMd: 'Manrope_700Bold',
  body: 'HankenGrotesk_400Regular',
  bodyMedium: 'HankenGrotesk_500Medium',
  bodySemi: 'HankenGrotesk_600SemiBold',
  bodyBold: 'HankenGrotesk_700Bold',
  mono: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }) as string,
};

/**
 * Type scale from the Felt & Ledger front-matter. Every money value carries
 * tabular figures so digits do not jitter while steppers run.
 */
export const textStyles = {
  headlineXl: { fontFamily: fonts.headline, fontSize: 32, lineHeight: 38, letterSpacing: -0.9 },
  headlineLg: { fontFamily: fonts.headlineBold, fontSize: 24, lineHeight: 30, letterSpacing: -0.5 },
  headlineMd: { fontFamily: fonts.headlineBold, fontSize: 20, lineHeight: 26, letterSpacing: -0.2 },
  titleLg: { fontFamily: fonts.title, fontSize: 18, lineHeight: 24 },
  bodyLg: { fontFamily: fonts.bodyMedium, fontSize: 16, lineHeight: 22 },
  bodyMd: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20 },
  bodySm: { fontFamily: fonts.body, fontSize: 12, lineHeight: 16 },
  numericLg: { fontFamily: fonts.numeric, fontSize: 28, lineHeight: 32, letterSpacing: -0.6, fontVariant: ['tabular-nums'] },
  numericMd: { fontFamily: fonts.numericMd, fontSize: 18, lineHeight: 22, fontVariant: ['tabular-nums'] },
  numericSm: { fontFamily: fonts.bodySemi, fontSize: 13, lineHeight: 18, fontVariant: ['tabular-nums'] },
  labelMd: { fontFamily: fonts.bodySemi, fontSize: 13, lineHeight: 18, letterSpacing: 0.2 },
  labelCaps: { fontFamily: fonts.bodyBold, fontSize: 10, lineHeight: 14, letterSpacing: 0.9, textTransform: 'uppercase' },
} satisfies Record<string, TextStyle>;

/** Bottom sheets and pinned footers: ambient upward glow, no blur-lift. */
export const sheetShadow: ViewStyle = {
  shadowColor: '#000000',
  shadowOpacity: 0.6,
  shadowRadius: 32,
  shadowOffset: { width: 0, height: -12 },
  elevation: 24,
};

/** Chip token palette (Felt & Ledger "Chip Token Semantics" plus five spares). */
export const CHIP_SWATCHES = [
  '#F3F4F6', // white chip
  '#EF4444', // red chip
  '#3B82F6', // blue chip
  '#10B981', // green chip
  '#111827', // black chip
  '#F59E0B',
  '#A855F7',
  '#14B8A6',
  '#F43F5E',
  '#6B7280',
];

const AVATAR_PALETTE = ['#FF7A00', '#10B981', '#3B82F6', '#F59E0B', '#A855F7', '#F43F5E', '#14B8A6', '#E879F9'];

export function avatarColor(seed: number): string {
  return AVATAR_PALETTE[Math.abs(seed) % AVATAR_PALETTE.length];
}
```

- [ ] **Step 3: Create `src/date.ts`**

```ts
/** Local-date helpers. Sessions store dates as 'YYYY-MM-DD' in local time. */

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function toIso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayIso(): string {
  return toIso(new Date());
}

/** Local noon, so timezone shifts never move the calendar day inside a picker. */
export function fromIso(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1, 12, 0, 0, 0);
}

export function formatDate(iso: string): string {
  return fromIso(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatShortDate(iso: string): string {
  return fromIso(iso).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
```

- [ ] **Step 4: Create `src/components/ui.tsx`**

```tsx
import React from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { avatarColor, colors, radius, sheetShadow, space, TAP, textStyles } from '@/theme';

type TextProps = { children: React.ReactNode; style?: StyleProp<TextStyle>; numberOfLines?: number };

export function Screen({
  children,
  scroll = false,
  padded = true,
  footer,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  footer?: React.ReactNode;
}) {
  const pad: ViewStyle = padded ? { paddingHorizontal: space.lg } : {};
  return (
    <SafeAreaView style={s.screen} edges={['top', 'left', 'right', 'bottom']}>
      {scroll ? (
        <ScrollView
          style={s.flex}
          contentContainerStyle={[pad, { paddingBottom: space.xl }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      ) : (
        <View style={[s.flex, pad]}>{children}</View>
      )}
      {footer ? <View style={[s.footer, pad]}>{footer}</View> : null}
    </SafeAreaView>
  );
}

export function NavHeader({
  title,
  onBack,
  onClose,
  overline,
  overlineTone = 'dim',
  dot = false,
  center = false,
  right,
  onTitlePress,
}: {
  title: string;
  onBack?: () => void;
  onClose?: () => void;
  overline?: string;
  overlineTone?: 'dim' | 'accent' | 'orange';
  dot?: boolean;
  center?: boolean;
  right?: React.ReactNode;
  onTitlePress?: () => void;
}) {
  const dotColor = overlineTone === 'accent' ? colors.accent : overlineTone === 'orange' ? colors.orange : colors.textDim;
  const middle = (
    <View style={center ? s.headerMiddleCenter : s.headerMiddleLeft}>
      {overline ? (
        <Row style={{ justifyContent: center ? 'center' : 'flex-start' }}>
          {dot ? <View style={[s.dot, { backgroundColor: dotColor }]} /> : null}
          <Overline tone={overlineTone}>{overline}</Overline>
        </Row>
      ) : null}
      <Headline numberOfLines={1} style={center ? { textAlign: 'center' } : undefined}>
        {title}
      </Headline>
    </View>
  );
  return (
    <Row style={s.header}>
      {onBack ? (
        <IconButton glyph="‹" onPress={onBack} accessibilityLabel="Go back" />
      ) : (
        <View style={s.headerSlot} />
      )}
      {onTitlePress ? (
        <Pressable onPress={onTitlePress} style={s.flex} accessibilityRole="button" accessibilityLabel={`Edit ${title}`}>
          {middle}
        </Pressable>
      ) : (
        middle
      )}
      {right ? (
        <View style={s.headerRight}>{right}</View>
      ) : onClose ? (
        <IconButton glyph="✕" onPress={onClose} accessibilityLabel="Close" />
      ) : (
        <View style={s.headerSlot} />
      )}
    </Row>
  );
}

export const Headline = ({ children, style, numberOfLines }: TextProps) => (
  <Text style={[s.headline, style]} numberOfLines={numberOfLines}>
    {children}
  </Text>
);

export const Title = ({ children, style, numberOfLines }: TextProps) => (
  <Text style={[s.title, style]} numberOfLines={numberOfLines}>
    {children}
  </Text>
);

export const Body = ({ children, dim = false, style, numberOfLines }: TextProps & { dim?: boolean }) => (
  <Text style={[s.body, dim && { color: colors.textDim }, style]} numberOfLines={numberOfLines}>
    {children}
  </Text>
);

export const Caption = ({ children, tone = 'dim', style, numberOfLines }: TextProps & { tone?: 'dim' | 'muted' }) => (
  <Text style={[s.caption, tone === 'muted' && { color: colors.textMuted }, style]} numberOfLines={numberOfLines}>
    {children}
  </Text>
);

export const Overline = ({ children, tone = 'dim', style }: TextProps & { tone?: 'dim' | 'accent' | 'orange' }) => (
  <Text
    style={[
      s.overline,
      tone === 'accent' && { color: colors.accent },
      tone === 'orange' && { color: colors.orange },
      style,
    ]}>
    {children}
  </Text>
);

export const Label = ({ children, style, numberOfLines }: TextProps) => (
  <Text style={[s.label, style]} numberOfLines={numberOfLines}>
    {children}
  </Text>
);

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'lg',
  disabled = false,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'orange' | 'secondary' | 'ghost' | 'danger';
  size?: 'lg' | 'md';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const bg = {
    primary: colors.accent,
    orange: colors.orange,
    secondary: colors.cardAlt,
    ghost: 'transparent',
    danger: colors.danger,
  }[variant];
  const fg = {
    primary: colors.onAccent,
    orange: colors.onOrange,
    secondary: colors.text,
    ghost: colors.text,
    danger: colors.text,
  }[variant];
  const borderColor = variant === 'secondary' || variant === 'ghost' ? colors.border : bg;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        s.btn,
        { backgroundColor: bg, borderColor, height: size === 'lg' ? 52 : TAP, opacity: disabled ? 0.4 : pressed ? 0.85 : 1 },
        style,
      ]}>
      <Text style={[s.btnLabel, { color: fg }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export const Row = ({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) => (
  <View style={[s.row, style]}>{children}</View>
);

export function Card({
  children,
  style,
  onPress,
  onLongPress,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  onLongPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={!onPress && !onLongPress}
      style={({ pressed }) => [s.card, pressed && (onPress || onLongPress) ? { backgroundColor: colors.cardAlt } : null, style]}>
      {children}
    </Pressable>
  );
}

export function Banner({ kind, text, style }: { kind: 'info' | 'warn' | 'success'; text: string; style?: StyleProp<ViewStyle> }) {
  const bg = { info: colors.infoSoft, warn: colors.warnSoft, success: colors.accentSoft }[kind];
  const fg = { info: colors.info, warn: colors.warn, success: colors.accent }[kind];
  const bc = { info: colors.border, warn: colors.warnBorder, success: colors.accentBorder }[kind];
  return (
    <View style={[s.banner, { backgroundColor: bg, borderColor: bc }, style]}>
      <Text style={[s.bannerText, { color: fg }]}>{text}</Text>
    </View>
  );
}

export function Avatar({ name, seed, size = 40 }: { name: string; seed: number; size?: number }) {
  return (
    <View style={[s.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={{ ...textStyles.labelMd, color: avatarColor(seed), fontSize: size * 0.4 }}>
        {name.trim().charAt(0).toUpperCase() || '?'}
      </Text>
    </View>
  );
}

export function Pill({
  label,
  tone = 'default',
  onPress,
  onLongPress,
  style,
}: {
  label: string;
  tone?: 'default' | 'accent' | 'orange' | 'muted';
  onPress?: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const bg = { default: colors.cardAlt, accent: colors.accent, orange: colors.orange, muted: 'transparent' }[tone];
  const fg = { default: colors.text, accent: colors.onAccent, orange: colors.onOrange, muted: colors.textDim }[tone];
  const bc = { default: colors.border, accent: colors.accent, orange: colors.orange, muted: colors.border }[tone];
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={!onPress && !onLongPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [s.pill, { backgroundColor: bg, borderColor: bc, opacity: pressed ? 0.8 : 1 }, style]}>
      <Text style={[s.pillLabel, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export function IconButton({
  glyph,
  onPress,
  accessibilityLabel,
  variant = 'plain',
}: {
  glyph: string;
  onPress: () => void;
  accessibilityLabel: string;
  variant?: 'plain' | 'circle';
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        s.iconBtn,
        variant === 'circle' && { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
        pressed && { opacity: 0.6 },
      ]}>
      <Text style={s.iconGlyph}>{glyph}</Text>
    </Pressable>
  );
}

export function SegmentedControl<T extends string>({
  segments,
  value,
  onChange,
  style,
}: {
  segments: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[s.segmentWrap, style]}>
      {segments.map((seg) => {
        const active = seg.key === value;
        return (
          <Pressable
            key={seg.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(seg.key)}
            style={({ pressed }) => [s.segment, active && { backgroundColor: colors.accent }, pressed && !active && { backgroundColor: colors.cardAlt }]}>
            <Text style={[s.segmentLabel, { color: active ? colors.onAccent : colors.textDim }]} numberOfLines={1}>
              {seg.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function StatTile({ label, value, style }: { label: string; value: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[s.card, s.statTile, style]}>
      <Overline>{label}</Overline>
      <Text style={s.statValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {value}
      </Text>
    </View>
  );
}

export function StatusPill({
  tone,
  label,
  value,
  style,
}: {
  tone: 'ok' | 'warn';
  label: string;
  value: string;
  style?: StyleProp<ViewStyle>;
}) {
  const fg = tone === 'ok' ? colors.accent : colors.warn;
  const bg = tone === 'ok' ? colors.accentSoft : colors.warnSoft;
  const bc = tone === 'ok' ? colors.accentBorder : colors.warnBorder;
  return (
    <Row style={[s.statusPill, { backgroundColor: bg, borderColor: bc }, style]}>
      <View style={[s.dot, { backgroundColor: fg }]} />
      <Text style={[s.statusLabel, { color: fg }]}>{label}</Text>
      <View style={s.flex} />
      <Text style={[s.statusValue, { color: fg }]}>{value}</Text>
    </Row>
  );
}

export function Checkbox({ checked }: { checked: boolean }) {
  return (
    <View style={[s.checkbox, checked && { backgroundColor: colors.accent, borderColor: colors.accent }]}>
      {checked ? <Text style={s.checkGlyph}>✓</Text> : null}
    </View>
  );
}

export function ChipGlyph({ size = 32 }: { size?: number }) {
  const inner = Math.round(size * 0.42);
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.orange, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: inner, height: inner, borderRadius: inner / 2, borderWidth: 2, borderColor: colors.text }} />
    </View>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> } = {}) {
  return <View style={[s.divider, style]} />;
}

export function toastError(e: unknown): void {
  const msg = e instanceof Error ? e.message : String(e);
  Alert.alert('Error', msg);
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  footer: {
    borderTopWidth: 1,
    borderTopColor: colors.borderStrong,
    backgroundColor: colors.bg,
    paddingTop: space.md,
    paddingBottom: space.sm,
    ...sheetShadow,
  },
  header: { minHeight: 56, paddingTop: space.sm, paddingBottom: space.md, alignItems: 'flex-start' },
  headerSlot: { width: TAP },
  headerRight: { marginLeft: space.sm },
  headerMiddleLeft: { flex: 1, justifyContent: 'center' },
  headerMiddleCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headline: { ...textStyles.headlineLg, color: colors.text },
  title: { ...textStyles.headlineMd, color: colors.text },
  body: { ...textStyles.bodyLg, color: colors.text },
  caption: { ...textStyles.bodySm, color: colors.textDim },
  overline: { ...textStyles.labelCaps, color: colors.textDim },
  label: { ...textStyles.labelMd, color: colors.textDim },
  btn: {
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  btnLabel: { ...textStyles.bodyLg, fontFamily: textStyles.labelMd.fontFamily, fontSize: 16 },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
  },
  banner: { borderRadius: radius.md, borderWidth: 1, paddingHorizontal: space.md, paddingVertical: space.sm },
  bannerText: { ...textStyles.labelMd },
  avatar: {
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: space.md,
    paddingVertical: 6,
    marginRight: space.sm,
    marginBottom: space.sm,
  },
  pillLabel: { ...textStyles.numericSm },
  iconBtn: { width: TAP, height: TAP, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  iconGlyph: { ...textStyles.headlineMd, color: colors.text },
  segmentWrap: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.xs,
  },
  segment: { flex: 1, height: 36, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  segmentLabel: { ...textStyles.labelMd },
  statTile: { flex: 1, padding: space.lg, justifyContent: 'center' },
  statValue: { ...textStyles.numericLg, color: colors.text, marginTop: space.xs },
  statusPill: { borderRadius: radius.md, borderWidth: 1, paddingHorizontal: space.md, paddingVertical: space.sm },
  statusLabel: { ...textStyles.labelMd },
  statusValue: { ...textStyles.numericSm },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: space.sm },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkGlyph: { ...textStyles.labelMd, color: colors.onAccent, fontSize: 14, lineHeight: 16 },
  divider: { height: 1, backgroundColor: colors.border },
});
```

- [ ] **Step 5: Create `src/components/MoneyText.tsx`**

```tsx
import React from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { formatCents, formatSigned } from '@/domain/money';
import { useSettingsStore } from '@/store/useSettingsStore';
import { colors, textStyles } from '@/theme';

export function MoneyText({
  cents,
  signed = false,
  variant = 'md',
  color = 'auto',
  style,
}: {
  cents: number;
  signed?: boolean;
  variant?: 'lg' | 'md' | 'sm';
  color?: 'auto' | 'default' | 'accent' | 'dim';
  style?: StyleProp<TextStyle>;
}) {
  const symbol = useSettingsStore((st) => st.settings.currencySymbol);
  const base = { lg: textStyles.numericLg, md: textStyles.numericMd, sm: textStyles.numericSm }[variant];
  const autoColor = signed ? (cents > 0 ? colors.pos : cents < 0 ? colors.neg : colors.textDim) : colors.text;
  const resolved = {
    auto: autoColor,
    default: colors.text,
    accent: colors.accent,
    dim: colors.textDim,
  }[color];
  return (
    <Text style={[base, { color: resolved }, style]} numberOfLines={1}>
      {signed ? formatSigned(cents, symbol) : formatCents(cents, symbol)}
    </Text>
  );
}
```

- [ ] **Step 6: Replace `src/app/_layout.tsx`**

```tsx
import React, { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import { Manrope_600SemiBold, Manrope_700Bold, Manrope_800ExtraBold } from '@expo-google-fonts/manrope';
import {
  HankenGrotesk_400Regular,
  HankenGrotesk_500Medium,
  HankenGrotesk_600SemiBold,
  HankenGrotesk_700Bold,
} from '@expo-google-fonts/hanken-grotesk';
import { openExpoDb } from '@/db/expo-adapter';
import { migrate } from '@/db/schema';
import { setDb } from '@/db/connection';
import { usePlayersStore } from '@/store/usePlayersStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useSessionsStore } from '@/store/useSessionsStore';
import { colors, textStyles } from '@/theme';

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If a font fails to download, React Native falls back to the system face for
  // that family; the app still renders, so we never block on fontError.
  const [fontsLoaded, fontError] = useFonts({
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
    HankenGrotesk_400Regular,
    HankenGrotesk_500Medium,
    HankenGrotesk_600SemiBold,
    HankenGrotesk_700Bold,
  });

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

  useEffect(() => {
    if (fontError) console.warn('Font load failed, falling back to system fonts:', fontError);
  }, [fontError]);

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <Text style={{ ...textStyles.bodyLg, color: colors.neg }}>Failed to open database: {error}</Text>
      </View>
    );
  }
  if (!ready || (!fontsLoaded && !fontError)) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: 'slide_from_right',
        }}
      />
    </SafeAreaProvider>
  );
}
```

- [ ] **Step 7: Temporary token preview in `src/app/index.tsx`**

Replaced by the real home screen in Task 11; this exists only so the shell can be eyeballed.

```tsx
import React from 'react';
import { View } from 'react-native';
import {
  Avatar, Banner, Body, Button, Caption, Card, ChipGlyph, Checkbox, Divider, Headline,
  Label, Overline, Pill, Row, Screen, SegmentedControl, StatTile, StatusPill, Title,
} from '@/components/ui';
import { MoneyText } from '@/components/MoneyText';
import { space } from '@/theme';

export default function Home() {
  const [tab, setTab] = React.useState<'a' | 'b'>('a');
  return (
    <Screen scroll>
      <Row style={{ marginBottom: space.lg }}>
        <ChipGlyph />
        <Headline style={{ marginLeft: space.sm }}>CHIPS</Headline>
      </Row>
      <Row style={{ marginBottom: space.md }}>
        <StatTile label="All-time nights" value="42" style={{ marginRight: space.md }} />
        <StatTile label="Total volume" value="$4,820" />
      </Row>
      <Card style={{ marginBottom: space.md }}>
        <Title>Ready to deal?</Title>
        <Caption style={{ marginTop: space.xs }}>Token preview screen.</Caption>
        <Divider style={{ marginVertical: space.md }} />
        <Row>
          <Avatar name="Ann" seed={1} />
          <Body style={{ marginLeft: space.sm }}>Ann</Body>
          <View style={{ flex: 1 }} />
          <MoneyText cents={-725} signed />
        </Row>
      </Card>
      <SegmentedControl
        segments={[{ key: 'a', label: 'Buy-ins' }, { key: 'b', label: 'Cash-out' }]}
        value={tab}
        onChange={setTab}
        style={{ marginBottom: space.md }}
      />
      <StatusPill tone="ok" label="Balanced Pool" value="$230 / $230" style={{ marginBottom: space.md }} />
      <Banner kind="warn" text="Off by $20 — recount?" style={{ marginBottom: space.md }} />
      <Row style={{ flexWrap: 'wrap' }}>
        <Pill label="$20" />
        <Pill label="$20" tone="orange" />
        <Pill label="$20" tone="muted" />
        <Checkbox checked />
      </Row>
      <Label style={{ marginTop: space.md }}>Label</Label>
      <Overline tone="orange">Active night</Overline>
      <Button label="Start New Night" onPress={() => {}} style={{ marginTop: space.md }} />
      <Button label="Go to Cash-Out  →" variant="orange" onPress={() => {}} style={{ marginTop: space.sm }} />
      <Button label="Secondary" variant="secondary" onPress={() => {}} style={{ marginTop: space.sm }} />
    </Screen>
  );
}
```

- [ ] **Step 8: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test`
Expected: all existing suites pass (Tasks 2–9 unchanged).

Manual (iOS simulator, `npx expo start --ios`):
1. Screen background is near-black `#0D0D0E`, not grey.
2. "CHIPS" renders in Manrope ExtraBold (geometric, tight) — clearly not the system font.
3. Stat tiles sit side by side with uppercase 10px labels and 28px numbers.
4. `-$7.25` is rose (`#F43F5E`); digits are tabular (swap to `-$11.11` mentally — column width identical).
5. Segmented control: "Buy-ins" is emerald with near-black text, "Cash-out" grey; tapping swaps them.
6. Status pill shows a green dot, "Balanced Pool" left, "$230 / $230" right.
7. Buttons are full pill shape, 52pt tall; the orange one has near-black text.
8. No red error box, no "Unrecognized font family" warnings in the Metro log.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(ui): Felt & Ledger tokens, fonts, and shared primitives

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 11: Home — wordmark, stat tiles, "Ready to deal?", past nights

Implements `docs/design/stitch/chips_home_reference_style/screen.png`: the orange chip wordmark,
two stat tiles, the "Ready to deal?" card whose green button replaces the old FAB, and the grouped
"PAST NIGHTS" list with the pot pool on the right.

**Files:**
- Create: `src/components/NightRow.tsx`, `src/app/new-session/index.tsx` (stub), `src/app/new-session/players.tsx` (stub), `src/app/session/[id]/index.tsx` (stub), `src/app/session/[id]/settle.tsx` (stub), `src/app/players.tsx` (stub), `src/app/settings.tsx` (stub)
- Modify: `src/app/index.tsx` (replace the Task 10 token preview)

**Interfaces:**
- Consumes: `Screen`, `Row`, `Card`, `Overline`, `Title`, `Caption`, `Body`, `Button`, `IconButton`, `ChipGlyph`, `StatTile`, `Divider`, `toastError` from `@/components/ui`; `MoneyText`; `formatDate` from `@/date`; `useSessionsStore` (`summaries`, `deleteSession`), `useSettingsStore` (`settings.currencySymbol`); `formatCents` from `@/domain/money`; `SessionSummary` from `@/domain/types` (now carrying `totalBuyinCents`, Task 8).
- Produces:
  ```tsx
  export function NightRow(p: { summary: SessionSummary; onPress(): void; onLongPress(): void }): JSX.Element
  ```
  Routes reachable from home: `/new-session`, `/session/[id]`, `/session/[id]/settle?share=1`, `/players`, `/settings`.

- [ ] **Step 1: Create `src/components/NightRow.tsx`**

Pot pool for a night is its total buy-ins (`summary.totalBuyinCents`) — the money that actually
crossed the table.

```tsx
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Caption, Row } from '@/components/ui';
import { MoneyText } from '@/components/MoneyText';
import { formatDate } from '@/date';
import type { SessionSummary } from '@/domain/types';
import { colors, space, textStyles } from '@/theme';

export function NightRow({
  summary,
  onPress,
  onLongPress,
}: {
  summary: SessionSummary;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const { session, playerCount, totalBuyinCents } = summary;
  const title = session.title?.trim() ? session.title : formatDate(session.date);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [s.row, pressed && { backgroundColor: colors.cardAlt }]}>
      <View style={s.left}>
        <Text style={s.title} numberOfLines={1}>
          {title}
        </Text>
        <Caption numberOfLines={1}>
          {formatDate(session.date)} · {playerCount} player{playerCount === 1 ? '' : 's'}
        </Caption>
      </View>
      <Row style={s.right}>
        <View style={{ alignItems: 'flex-end' }}>
          <MoneyText cents={totalBuyinCents} color="accent" />
          <Caption tone="muted">Pot Pool</Caption>
        </View>
      </Row>
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, paddingVertical: space.md },
  left: { flex: 1, paddingRight: space.md },
  right: { alignItems: 'flex-end' },
  title: { ...textStyles.bodyLg, fontFamily: textStyles.labelMd.fontFamily, fontSize: 15, color: colors.text, marginBottom: 2 },
});
```

- [ ] **Step 2: Replace `src/app/index.tsx`**

```tsx
import React from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Body, Button, Caption, Card, ChipGlyph, Divider, Headline, IconButton, Overline, Row, Screen, StatTile, Title, toastError,
} from '@/components/ui';
import { NightRow } from '@/components/NightRow';
import { useSessionsStore } from '@/store/useSessionsStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { formatCents } from '@/domain/money';
import { colors, radius, space, textStyles } from '@/theme';

export default function Home() {
  const router = useRouter();
  const summaries = useSessionsStore((s) => s.summaries);
  const deleteSession = useSessionsStore((s) => s.deleteSession);
  const symbol = useSettingsStore((s) => s.settings.currencySymbol);

  const totalVolumeCents = summaries.reduce((sum, x) => sum + x.totalBuyinCents, 0);
  const hasNights = summaries.length > 0;

  const onLongPress = (id: string, title: string) => {
    Alert.alert(title, undefined, [
      { text: 'Share', onPress: () => router.push(`/session/${id}/settle?share=1`) },
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
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  return (
    <Screen scroll>
      <Row style={s.header}>
        <ChipGlyph />
        <Headline style={s.wordmark}>CHIPS</Headline>
        <View style={{ flex: 1 }} />
        <IconButton glyph="👤" onPress={() => router.push('/players')} accessibilityLabel="Players" variant="circle" />
        <View style={{ width: space.sm }} />
        <IconButton glyph="⚙︎" onPress={() => router.push('/settings')} accessibilityLabel="Settings" variant="circle" />
      </Row>

      {hasNights ? (
        <Row style={{ marginBottom: space.md }}>
          <StatTile label="All-time nights" value={String(summaries.length)} style={{ marginRight: space.md }} />
          <StatTile label="Total volume" value={formatCents(totalVolumeCents, symbol)} />
        </Row>
      ) : null}

      <Card style={{ marginBottom: space.xl }}>
        <Title>Ready to deal?</Title>
        <Caption style={{ marginTop: space.xs, marginBottom: space.lg }}>
          Start a new night, track buy-ins, calculate splits instantly.
        </Caption>
        <Button label="Start New Night" onPress={() => router.push('/new-session')} />
      </Card>

      {hasNights ? (
        <>
          <Overline style={{ marginBottom: space.sm, marginLeft: space.xs }}>Past nights</Overline>
          <View style={s.list}>
            {summaries.map((summary, i) => (
              <View key={summary.session.id}>
                {i > 0 ? <Divider /> : null}
                <NightRow
                  summary={summary}
                  onPress={() => router.push(`/session/${summary.session.id}`)}
                  onLongPress={() =>
                    onLongPress(summary.session.id, summary.session.title?.trim() ? summary.session.title : 'Night')
                  }
                />
              </View>
            ))}
          </View>
          <Caption tone="muted" style={{ marginTop: space.sm, marginLeft: space.xs }}>
            Long-press a night to share or delete it.
          </Caption>
        </>
      ) : (
        <Body dim>No nights yet.</Body>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  header: { paddingTop: space.sm, paddingBottom: space.lg },
  wordmark: { ...textStyles.headlineLg, color: colors.text, letterSpacing: 2, marginLeft: space.sm },
  list: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
});
```

- [ ] **Step 3: Create route stubs so every navigation target resolves**

Each is replaced by a later task. Create the directories first:

```bash
cd /Users/stevenkhaw/Documents/GitHub/Chips
mkdir -p src/app/new-session "src/app/session/[id]"
```

`src/app/new-session/index.tsx` (replaced in Task 12):

```tsx
import { Headline, Screen } from '@/components/ui';

export default function NewSessionStep1() {
  return (
    <Screen>
      <Headline>New Night</Headline>
    </Screen>
  );
}
```

`src/app/new-session/players.tsx` (replaced in Task 12):

```tsx
import { Headline, Screen } from '@/components/ui';

export default function NewSessionStep2() {
  return (
    <Screen>
      <Headline>Select Players</Headline>
    </Screen>
  );
}
```

`src/app/session/[id]/index.tsx` (replaced in Task 13):

```tsx
import { useLocalSearchParams } from 'expo-router';
import { Headline, Screen } from '@/components/ui';

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Screen>
      <Headline>Session {id}</Headline>
    </Screen>
  );
}
```

`src/app/session/[id]/settle.tsx` (replaced in Task 15):

```tsx
import { Headline, Screen } from '@/components/ui';

export default function SettleScreen() {
  return (
    <Screen>
      <Headline>Settlements</Headline>
    </Screen>
  );
}
```

`src/app/players.tsx` (replaced in Task 17):

```tsx
import { Headline, Screen } from '@/components/ui';

export default function PlayersScreen() {
  return (
    <Screen>
      <Headline>Players</Headline>
    </Screen>
  );
}
```

`src/app/settings.tsx` (replaced in Task 17):

```tsx
import { Headline, Screen } from '@/components/ui';

export default function SettingsScreen() {
  return (
    <Screen>
      <Headline>Settings</Headline>
    </Screen>
  );
}
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test`
Expected: all suites pass (Task 8 already provides `totalBuyinCents`; if `summary.totalBuyinCents`
does not type-check, Task 8's amendment was skipped — implement it before continuing).

Manual (iOS simulator):
1. Fresh install → no stat tiles, only the "Ready to deal?" card and "No nights yet."
2. Header: orange chip glyph, "CHIPS" in wide-tracked ExtraBold, two circular icon buttons right.
3. Tap 👤 → "Players" stub; back. Tap ⚙︎ → "Settings" stub; back.
4. "Start New Night" (green, full width) → "New Night" stub; back.
5. With at least one night present (create one after Task 12, or re-check then): stat tiles appear,
   "PAST NIGHTS" list is one rounded card with hairline dividers, each row shows the title, the
   "Oct 12, 2024 · 8 players" caption, and the green pot pool with "Pot Pool" beneath.
6. Long-press a row → Share / Delete / Cancel. Delete asks to confirm and removes the row.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(app): home screen with stat tiles and past nights list

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 12: New night in two steps (setup → select players)

Implements `docs/design/stitch/chips_new_night_setup/screen.png` (step 1 of 2) and
`docs/design/stitch/chips_select_players_step_2_of_2/screen.png` (step 2 of 2), plus the shared
bottom-sheet `AmountPad` that every later screen reuses.

Step-1 values travel to step 2 through a tiny zustand **draft store** (`useNewNightDraft`). It holds
UI draft state only — it never touches the repo layer, and it is reset every time step 1 mounts.
Router params are not used for this: the draft carries a cents integer and must not round-trip
through a string.

**Files:**
- Create: `src/store/useNewNightDraft.ts`, `src/components/AmountPad.tsx`, `src/components/PlayerChecklist.tsx`
- Modify: `src/app/new-session/index.tsx` (replace stub), `src/app/new-session/players.tsx` (replace stub)

**Interfaces:**
- Consumes: ui primitives + `MoneyText` (Task 10); `todayIso`, `toIso`, `fromIso`, `formatDate` from `@/date`; `formatCents`, `parseMoneyInput` from `@/domain/money`; `useSettingsStore` (`settings`), `usePlayersStore` (`players`, `add`), `useSessionsStore` (`create`, `lastPlayerIds`) from Task 9; `Player` from `@/domain/types`.
- Produces:
  ```ts
  // src/store/useNewNightDraft.ts
  interface NewNightDraft {
    date: string;                 // 'YYYY-MM-DD'
    title: string;                // raw text, trimmed at create time
    defaultBuyinCents: number;
    start(init: { date: string; defaultBuyinCents: number }): void;   // resets title to ''
    patch(p: Partial<Pick<NewNightDraft, 'date' | 'title' | 'defaultBuyinCents'>>): void;
  }
  export const useNewNightDraft: UseBoundStore<StoreApi<NewNightDraft>>
  ```
  ```tsx
  // src/components/AmountPad.tsx
  export function AmountPad(p: {
    visible: boolean; title: string; initialCents: number | null; allowZero?: boolean;
    confirmLabel?: string;                       // default 'Save'
    onConfirm(cents: number): void; onCancel(): void; onDelete?(): void;
    extraAction?: { label: string; onPress(): void };
  }): JSX.Element
  // src/components/PlayerChecklist.tsx
  export function PlayerChecklist(p: {
    players: Player[]; selectedIds: string[]; onToggle(id: string): void; mode?: 'check' | 'add';
  }): JSX.Element
  ```
  Routes: `/new-session` (step 1) → `/new-session/players` (step 2) → `/session/[id]`.

- [ ] **Step 1: Create `src/store/useNewNightDraft.ts`**

```ts
import { create } from 'zustand';

interface NewNightDraft {
  date: string;
  title: string;
  defaultBuyinCents: number;
  start(init: { date: string; defaultBuyinCents: number }): void;
  patch(p: Partial<Pick<NewNightDraft, 'date' | 'title' | 'defaultBuyinCents'>>): void;
}

/** UI-only draft for the two-step "new night" flow. Never reads or writes the database. */
export const useNewNightDraft = create<NewNightDraft>((set) => ({
  date: '',
  title: '',
  defaultBuyinCents: 2000,
  start: ({ date, defaultBuyinCents }) => set({ date, title: '', defaultBuyinCents }),
  patch: (p) => set(p),
}));
```

- [ ] **Step 2: Create `src/components/AmountPad.tsx`**

Bottom sheet: top hairline `borderStrong` plus the upward ambient glow from `sheetShadow`, an
uppercase overline title, the currency symbol and a big tabular input in a level-2 well.

```tsx
import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Overline, Row } from '@/components/ui';
import { formatCents, parseMoneyInput } from '@/domain/money';
import { useSettingsStore } from '@/store/useSettingsStore';
import { colors, radius, sheetShadow, space, textStyles } from '@/theme';

export function AmountPad({
  visible,
  title,
  initialCents,
  allowZero = false,
  confirmLabel = 'Save',
  onConfirm,
  onCancel,
  onDelete,
  extraAction,
}: {
  visible: boolean;
  title: string;
  initialCents: number | null;
  allowZero?: boolean;
  confirmLabel?: string;
  onConfirm: (cents: number) => void;
  onCancel: () => void;
  onDelete?: () => void;
  extraAction?: { label: string; onPress: () => void };
}) {
  const symbol = useSettingsStore((s) => s.settings.currencySymbol);
  const [text, setText] = useState('');

  useEffect(() => {
    if (visible) setText(initialCents === null ? '' : formatCents(initialCents, ''));
  }, [visible, initialCents]);

  const cents = parseMoneyInput(text);
  const valid = cents !== null && (allowZero ? cents >= 0 : cents > 0);
  const submit = () => {
    if (valid && cents !== null) onConfirm(cents);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <Pressable style={s.scrim} onPress={onCancel} accessibilityLabel="Dismiss" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.sheet}>
          <Overline style={{ marginBottom: space.md }}>{title}</Overline>
          <Row style={s.well}>
            <Text style={s.symbol}>{symbol}</Text>
            <TextInput
              value={text}
              onChangeText={setText}
              autoFocus
              keyboardType="decimal-pad"
              selectTextOnFocus
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              onSubmitEditing={submit}
              style={s.input}
            />
          </Row>
          {extraAction ? (
            <Button label={extraAction.label} variant="secondary" onPress={extraAction.onPress} style={{ marginTop: space.md }} />
          ) : null}
          {onDelete ? (
            <Button label="Remove" variant="ghost" onPress={onDelete} size="md" style={{ marginTop: space.md }} />
          ) : null}
          <Row style={{ marginTop: space.md }}>
            <Button label="Cancel" variant="secondary" onPress={onCancel} style={{ flex: 1, marginRight: space.sm }} />
            <Button label={confirmLabel} onPress={submit} disabled={!valid} style={{ flex: 1 }} />
          </Row>
        </View>
      </KeyboardAvoidingView>
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
    ...sheetShadow,
  },
  well: {
    backgroundColor: colors.cardAlt,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.md,
  },
  symbol: { ...textStyles.numericLg, color: colors.textDim, marginRight: space.sm },
  input: { ...textStyles.numericLg, color: colors.text, flex: 1, paddingVertical: space.md },
});
```

- [ ] **Step 3: Create `src/components/PlayerChecklist.tsx`**

Presentational only — it takes the player array and the selection, and reports taps. `mode="add"`
swaps the checkbox for an orange `+` glyph (used by the session screen's add-player sheet in Task 13).

```tsx
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar, Checkbox } from '@/components/ui';
import type { Player } from '@/domain/types';
import { colors, radius, space, textStyles } from '@/theme';

export function PlayerChecklist({
  players,
  selectedIds,
  onToggle,
  mode = 'check',
}: {
  players: Player[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  mode?: 'check' | 'add';
}) {
  return (
    <View>
      {players.map((p) => {
        const checked = selectedIds.includes(p.id);
        return (
          <Pressable
            key={p.id}
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
            accessibilityLabel={p.name}
            onPress={() => onToggle(p.id)}
            style={({ pressed }) => [s.row, checked && s.rowSelected, pressed && { opacity: 0.8 }]}>
            <Avatar name={p.name} seed={p.colorSeed} size={36} />
            <Text style={[s.name, !checked && mode === 'check' && { color: colors.textDim }]} numberOfLines={1}>
              {p.name}
            </Text>
            {mode === 'check' ? <Checkbox checked={checked} /> : <Text style={s.addGlyph}>+</Text>}
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 56,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.md,
    marginBottom: space.sm,
  },
  rowSelected: { borderColor: colors.accentBorder, backgroundColor: colors.accentSoft },
  name: { ...textStyles.labelMd, fontSize: 15, color: colors.text, flex: 1, marginLeft: space.md },
  addGlyph: { ...textStyles.headlineMd, color: colors.orange },
});
```

- [ ] **Step 4: Replace `src/app/new-session/index.tsx` (step 1 of 2)**

Preset buy-ins are $10 / $20 / $50 / Custom. "Custom" is highlighted whenever the draft amount is
not one of the three presets, and tapping it opens the `AmountPad`.

```tsx
import React, { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Button, Caption, NavHeader, Overline, Row, Screen } from '@/components/ui';
import { AmountPad } from '@/components/AmountPad';
import { useNewNightDraft } from '@/store/useNewNightDraft';
import { useSettingsStore } from '@/store/useSettingsStore';
import { formatCents } from '@/domain/money';
import { formatDate, fromIso, toIso, todayIso } from '@/date';
import { colors, radius, space, textStyles } from '@/theme';

const PRESETS = [1000, 2000, 5000];

export default function NewSessionStep1() {
  const router = useRouter();
  const settings = useSettingsStore((s) => s.settings);
  const draft = useNewNightDraft();
  const [showPicker, setShowPicker] = useState(false);
  const [showPad, setShowPad] = useState(false);

  useEffect(() => {
    draft.start({ date: todayIso(), defaultBuyinCents: settings.defaultBuyinCents });
    // Runs once per visit to step 1; the draft is deliberately reset each time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isCustom = draft.date !== '' && !PRESETS.includes(draft.defaultBuyinCents);
  const canContinue = draft.date !== '' && draft.defaultBuyinCents > 0;

  return (
    <Screen
      scroll
      footer={
        <Button
          label="Select Players  →"
          onPress={() => router.push('/new-session/players')}
          disabled={!canContinue}
        />
      }>
      <NavHeader
        center
        overline="Step 1 of 2"
        title="New Night"
        onBack={() => router.back()}
        onClose={() => router.dismissAll()}
      />

      <Overline style={s.label}>Night title</Overline>
      <TextInput
        value={draft.title}
        onChangeText={(t) => draft.patch({ title: t })}
        placeholder="Dave's place"
        placeholderTextColor={colors.textMuted}
        style={s.field}
        returnKeyType="done"
      />
      <Caption style={{ marginTop: space.xs }}>Optional. Falls back to the date.</Caption>

      <Overline style={s.label}>Game date</Overline>
      <Pressable
        accessibilityRole="button"
        onPress={() => setShowPicker(true)}
        style={({ pressed }) => [s.field, s.fieldRow, pressed && { backgroundColor: colors.cardAlt }]}>
        <Text style={s.fieldText}>{draft.date ? formatDate(draft.date) : ''}</Text>
        <Text style={s.calendarGlyph}>🗓</Text>
      </Pressable>

      <Overline style={s.label}>Default buy-in</Overline>
      <Row style={{ gap: space.sm }}>
        {PRESETS.map((cents) => {
          const active = draft.defaultBuyinCents === cents;
          return (
            <Pressable
              key={cents}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              onPress={() => draft.patch({ defaultBuyinCents: cents })}
              style={({ pressed }) => [s.preset, active && s.presetActive, pressed && { opacity: 0.85 }]}>
              <Text style={[s.presetLabel, active && { color: colors.onAccent }]}>
                {formatCents(cents, settings.currencySymbol)}
              </Text>
            </Pressable>
          );
        })}
        <Pressable
          accessibilityRole="radio"
          accessibilityState={{ selected: isCustom }}
          onPress={() => setShowPad(true)}
          style={({ pressed }) => [s.preset, isCustom && s.presetActive, pressed && { opacity: 0.85 }]}>
          <Text style={[s.presetLabel, isCustom && { color: colors.onAccent }]}>
            {isCustom ? formatCents(draft.defaultBuyinCents, settings.currencySymbol) : 'Custom'}
          </Text>
        </Pressable>
      </Row>
      <Caption style={{ marginTop: space.sm }}>
        Tapping + on a player during the night logs this amount instantly.
      </Caption>

      {showPicker && Platform.OS === 'android' ? (
        <DateTimePicker
          value={fromIso(draft.date || todayIso())}
          mode="date"
          onChange={(_e, d) => {
            setShowPicker(false);
            if (d) draft.patch({ date: toIso(d) });
          }}
        />
      ) : null}

      <Modal
        visible={showPicker && Platform.OS === 'ios'}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPicker(false)}>
        <Pressable style={s.scrim} onPress={() => setShowPicker(false)} accessibilityLabel="Dismiss" />
        <View style={s.sheet}>
          <Overline style={{ marginBottom: space.sm }}>Game date</Overline>
          <DateTimePicker
            value={fromIso(draft.date || todayIso())}
            mode="date"
            display="inline"
            themeVariant="dark"
            accentColor={colors.accent}
            onChange={(_e, d) => {
              if (d) draft.patch({ date: toIso(d) });
            }}
          />
          <Button label="Done" onPress={() => setShowPicker(false)} style={{ marginTop: space.md }} />
        </View>
      </Modal>

      <AmountPad
        visible={showPad}
        title="Custom buy-in"
        initialCents={draft.defaultBuyinCents}
        confirmLabel="Use amount"
        onCancel={() => setShowPad(false)}
        onConfirm={(c) => {
          draft.patch({ defaultBuyinCents: c });
          setShowPad(false);
        }}
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  label: { marginTop: space.xl, marginBottom: space.sm },
  field: {
    ...textStyles.bodyLg,
    color: colors.text,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    minHeight: 52,
  },
  fieldRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fieldText: { ...textStyles.bodyLg, color: colors.text },
  calendarGlyph: { ...textStyles.bodyLg, color: colors.textDim },
  preset: {
    flex: 1,
    minHeight: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  presetLabel: { ...textStyles.labelMd, fontSize: 14, color: colors.text },
  scrim: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: 1,
    borderTopColor: colors.borderStrong,
    padding: space.lg,
    paddingBottom: space.xxl,
  },
});
```

- [ ] **Step 5: Replace `src/app/new-session/players.tsx` (step 2 of 2)**

Pre-selects the roster from the most recent night (`lastPlayerIds()`), filtered to players that are
still active. Archived players are hidden.

```tsx
import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Body, Button, Caption, NavHeader, Row, Screen, toastError } from '@/components/ui';
import { PlayerChecklist } from '@/components/PlayerChecklist';
import { useNewNightDraft } from '@/store/useNewNightDraft';
import { usePlayersStore } from '@/store/usePlayersStore';
import { useSessionsStore } from '@/store/useSessionsStore';
import { colors, radius, space, textStyles } from '@/theme';

export default function NewSessionStep2() {
  const router = useRouter();
  const draft = useNewNightDraft();
  const players = usePlayersStore((s) => s.players);
  const addPlayer = usePlayersStore((s) => s.add);
  const create = useSessionsStore((s) => s.create);
  const lastPlayerIds = useSessionsStore((s) => s.lastPlayerIds);

  const roster = useMemo(() => players.filter((p) => !p.archived), [players]);
  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    const active = new Set(players.filter((p) => !p.archived).map((p) => p.id));
    return lastPlayerIds().filter((id) => active.has(id));
  });
  const [newName, setNewName] = useState('');

  const toggle = (id: string) =>
    setSelectedIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const addNew = () => {
    const name = newName.trim();
    if (!name) return;
    try {
      const p = addPlayer(name);
      setNewName('');
      setSelectedIds((cur) => [...cur, p.id]);
    } catch (e) {
      toastError(e);
    }
  };

  const confirm = () => {
    if (selectedIds.length === 0) return;
    try {
      const session = create({
        date: draft.date,
        title: draft.title.trim() || null,
        defaultBuyinCents: draft.defaultBuyinCents,
        playerIds: selectedIds,
      });
      // Leave the two setup steps behind, then open the night, so "back" from the
      // session returns to home rather than to step 1.
      router.dismissAll();
      requestAnimationFrame(() => router.push(`/session/${session.id}`));
    } catch (e) {
      toastError(e);
    }
  };

  return (
    <Screen
      scroll
      footer={
        <Button
          label="Confirm & Start Game  →"
          variant="orange"
          onPress={confirm}
          disabled={selectedIds.length === 0}
        />
      }>
      <NavHeader
        center
        overline="Step 2 of 2"
        title="Select Players"
        onBack={() => router.back()}
        onClose={() => router.dismissAll()}
      />

      <Row style={{ marginBottom: space.lg }}>
        <TextInput
          value={newName}
          onChangeText={setNewName}
          placeholder="Add new player name..."
          placeholderTextColor={colors.textMuted}
          onSubmitEditing={addNew}
          returnKeyType="done"
          style={s.input}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add player"
          onPress={addNew}
          disabled={!newName.trim()}
          style={({ pressed }) => [s.addBtn, { opacity: !newName.trim() ? 0.4 : pressed ? 0.8 : 1 }]}>
          <Text style={s.addGlyph}>+</Text>
        </Pressable>
      </Row>

      <Row style={{ marginBottom: space.md, paddingHorizontal: space.xs }}>
        <Caption>
          {selectedIds.length} of {roster.length} players selected
        </Caption>
        <View style={{ flex: 1 }} />
        <Pressable
          accessibilityRole="button"
          onPress={() => setSelectedIds([])}
          disabled={selectedIds.length === 0}
          hitSlop={8}>
          <Text style={[s.clearAll, { opacity: selectedIds.length === 0 ? 0.4 : 1 }]}>CLEAR ALL</Text>
        </Pressable>
      </Row>

      {roster.length === 0 ? (
        <Body dim>No players yet — add the first one above.</Body>
      ) : (
        <PlayerChecklist players={roster} selectedIds={selectedIds} onToggle={toggle} />
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  input: {
    ...textStyles.bodyLg,
    flex: 1,
    height: 48,
    color: colors.text,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: space.lg,
    marginRight: space.sm,
  },
  addBtn: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addGlyph: { ...textStyles.headlineMd, color: colors.text },
  clearAll: { ...textStyles.labelCaps, color: colors.orange },
});
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test`
Expected: all suites pass (no domain/repo/store code changed).

Manual (iOS simulator):
1. Home → "Start New Night" → header reads "STEP 1 OF 2 / New Night", centered, with ‹ and ✕.
2. Title field placeholder "Dave's place"; typing persists when you go to step 2 and back.
3. Tap the date field → dark inline calendar sheet → pick tomorrow → "Done" → field updates.
4. Buy-in presets: $20 is emerald (it matches the seeded default). Tap $50 → selection moves.
   Tap "Custom" → amount pad → enter 35 → the fourth pill now reads "$35" and is emerald.
5. "Select Players →" (green) → step 2. Header reads "STEP 2 OF 2 / Select Players".
6. Type "Ann" → tap + → row appears already selected with an emerald check and tinted border.
   Add "Bob", "Cat". Counter reads "3 of 3 players selected".
7. "CLEAR ALL" (orange) empties the selection and disables the orange CTA.
8. Re-select 3 → "Confirm & Start Game →" → lands on the session screen. Press back once →
   home (not step 1).
9. Start another night: the players from the night you just created are pre-checked.
10. Android: the date field opens the platform date dialog instead of the sheet.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(app): two-step new night flow with buy-in presets and roster checklist

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 13: Session screen — segmented spine, live table, cash-out list

Implements `docs/design/stitch/chips_live_table_active_night/screen.png` (and its dimmed variant
`chips_live_session_table`) plus the cash-out half of the flow. The segmented control from the chip
counter mockup becomes the navigation spine of an open night: **Buy-ins | Cash-out | Settle**, where
the third segment pushes `settle.tsx` instead of switching views.

Nothing in this flow locks: buy-in pills stay editable and cash-outs can be re-entered at any time.

**Files:**
- Create: `src/components/BuyinRow.tsx`, `src/components/CashoutRow.tsx`
- Modify: `src/app/session/[id]/index.tsx` (replace the Task 11 stub)

**Interfaces:**
- Consumes: ui primitives, `MoneyText`, `AmountPad` (Task 12), `PlayerChecklist` (Task 12); `summarize`, `PlayerNetRow` from `@/domain/nets`; `formatCents` from `@/domain/money`; `formatDate`, `fromIso`, `toIso` from `@/date`; `useSessionsStore` (`open`, `detail`, `addBuyin`, `updateBuyin`, `removeBuyin`, `setCashout`, `addPlayer`, `removePlayer`, `updateSession`), `useSettingsStore`, `usePlayersStore`.
- Produces:
  ```tsx
  export function BuyinRow(p: {
    row: PlayerNetRow; buyins: Buyin[];
    onAddDefault(): void; onCustomBuyin(): void; onEditBuyin(b: Buyin): void; onLongPress(): void;
  }): JSX.Element
  export function CashoutRow(p: { row: PlayerNetRow; onPress(): void; onLongPress(): void }): JSX.Element
  ```
  Route `/session/[id]` renders both views; `/session/[id]/settle` is pushed by the third segment
  and by the cash-out footer CTA.

- [ ] **Step 1: Create `src/components/BuyinRow.tsx`**

```tsx
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar, Caption, Pill, Row } from '@/components/ui';
import { formatCents } from '@/domain/money';
import type { PlayerNetRow } from '@/domain/nets';
import type { Buyin } from '@/domain/types';
import { useSettingsStore } from '@/store/useSettingsStore';
import { colors, radius, space, TAP, textStyles } from '@/theme';

export function BuyinRow({
  row,
  buyins,
  onAddDefault,
  onCustomBuyin,
  onEditBuyin,
  onLongPress,
}: {
  row: PlayerNetRow;
  buyins: Buyin[];
  onAddDefault: () => void;
  onCustomBuyin: () => void;
  onEditBuyin: (b: Buyin) => void;
  onLongPress: () => void;
}) {
  const symbol = useSettingsStore((s) => s.settings.currencySymbol);
  return (
    <Pressable
      accessibilityLabel={`${row.name}, bought in for ${formatCents(row.buyinCents, symbol)}`}
      onLongPress={onLongPress}
      style={({ pressed }) => [s.card, pressed && { borderColor: colors.orangeBorder }]}>
      <Avatar name={row.name} seed={row.colorSeed} />
      <View style={s.middle}>
        <Text style={s.name} numberOfLines={1}>
          {row.name}
        </Text>
        <Row style={s.pills}>
          <Caption style={{ marginRight: space.xs, marginBottom: space.xs }}>In:</Caption>
          {buyins.length === 0 ? (
            <Caption tone="muted" style={{ marginBottom: space.xs }}>
              —
            </Caption>
          ) : (
            buyins.map((b) => (
              <Pill
                key={b.id}
                label={formatCents(b.amountCents, symbol)}
                onPress={() => onEditBuyin(b)}
                style={s.buyinPill}
              />
            ))
          )}
        </Row>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Add buy-in for ${row.name}`}
        onPress={onAddDefault}
        onLongPress={onCustomBuyin}
        style={({ pressed }) => [s.plus, pressed && { opacity: 0.8 }]}>
        <Text style={s.plusGlyph}>+</Text>
      </Pressable>
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    marginBottom: space.sm,
  },
  middle: { flex: 1, marginLeft: space.md, marginRight: space.sm },
  name: { ...textStyles.labelMd, fontSize: 15, color: colors.text, marginBottom: space.xs },
  pills: { flexWrap: 'wrap' },
  buyinPill: { paddingHorizontal: space.sm, paddingVertical: 2, marginRight: space.xs, marginBottom: space.xs },
  plus: {
    width: TAP,
    height: TAP,
    borderRadius: radius.md,
    backgroundColor: colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusGlyph: { ...textStyles.headlineMd, color: colors.onOrange, fontSize: 24, lineHeight: 28 },
});
```

- [ ] **Step 2: Create `src/components/CashoutRow.tsx`**

```tsx
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Avatar, Caption } from '@/components/ui';
import { MoneyText } from '@/components/MoneyText';
import { formatCents } from '@/domain/money';
import type { PlayerNetRow } from '@/domain/nets';
import { useSettingsStore } from '@/store/useSettingsStore';
import { colors, radius, space, textStyles } from '@/theme';

export function CashoutRow({
  row,
  onPress,
  onLongPress,
}: {
  row: PlayerNetRow;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const symbol = useSettingsStore((s) => s.settings.currencySymbol);
  const pending = row.cashoutCents === null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Cash-out for ${row.name}`}
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [s.card, pending && s.cardPending, pressed && { borderColor: colors.accentBorder }]}>
      <Avatar name={row.name} seed={row.colorSeed} />
      <View style={s.middle}>
        <Text style={s.name} numberOfLines={1}>
          {row.name}
        </Text>
        <Caption>In: {formatCents(row.buyinCents, symbol)}</Caption>
      </View>
      <View style={s.right}>
        {pending ? (
          <Text style={s.placeholder}>Tap to enter</Text>
        ) : (
          <MoneyText cents={row.cashoutCents as number} color="accent" />
        )}
        {row.netCents === null ? (
          <Caption tone="muted">net —</Caption>
        ) : (
          <MoneyText cents={row.netCents} signed variant="sm" />
        )}
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    marginBottom: space.sm,
  },
  cardPending: { borderStyle: 'dashed' },
  middle: { flex: 1, marginLeft: space.md, marginRight: space.sm },
  name: { ...textStyles.labelMd, fontSize: 15, color: colors.text, marginBottom: 2 },
  right: { alignItems: 'flex-end' },
  placeholder: { ...textStyles.labelMd, color: colors.textMuted },
});
```

- [ ] **Step 3: Replace `src/app/session/[id]/index.tsx`**

```tsx
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  Banner, Body, Button, Caption, NavHeader, Overline, Row, Screen, SegmentedControl, StatusPill, toastError,
} from '@/components/ui';
import { BuyinRow } from '@/components/BuyinRow';
import { CashoutRow } from '@/components/CashoutRow';
import { AmountPad } from '@/components/AmountPad';
import { PlayerChecklist } from '@/components/PlayerChecklist';
import { useSessionsStore } from '@/store/useSessionsStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { usePlayersStore } from '@/store/usePlayersStore';
import { summarize } from '@/domain/nets';
import { formatCents } from '@/domain/money';
import { formatDate, fromIso, toIso } from '@/date';
import type { Buyin, Player } from '@/domain/types';
import { colors, radius, space, textStyles } from '@/theme';

type Tab = 'buyins' | 'cashout';

type PadState =
  | { kind: 'none' }
  | { kind: 'customBuyin'; spId: string; name: string }
  | { kind: 'editBuyin'; buyin: Buyin }
  | { kind: 'cashout'; spId: string; name: string; current: number | null };

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const store = useSessionsStore();
  const symbol = useSettingsStore((s) => s.settings.currencySymbol);
  const players = usePlayersStore((s) => s.players);

  const [tab, setTab] = useState<Tab>('buyins');
  const [pad, setPad] = useState<PadState>({ kind: 'none' });
  const [addingPlayer, setAddingPlayer] = useState(false);
  const [editingNight, setEditingNight] = useState(false);

  useEffect(() => {
    if (id) store.open(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const detail = store.detail;
  const math = useMemo(() => (detail ? summarize(detail) : null), [detail]);

  if (!detail || !math || detail.session.id !== id) {
    return (
      <Screen>
        <Body dim>Loading…</Body>
      </Screen>
    );
  }

  const safe = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      toastError(e);
    }
  };
  const closePad = () => setPad({ kind: 'none' });
  const detailOf = (playerId: string) => detail.players.find((p) => p.player.id === playerId)!;
  const title = detail.session.title?.trim() ? detail.session.title : formatDate(detail.session.date);

  const onRowLongPress = (spId: string, name: string, hasBuyins: boolean) => {
    const doRemove = () => safe(() => store.removePlayer(spId));
    Alert.alert(name, undefined, [
      {
        text: 'Remove from night',
        style: 'destructive',
        onPress: () =>
          hasBuyins
            ? Alert.alert('Remove player?', 'Their buy-ins will be removed too.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Remove', style: 'destructive', onPress: doRemove },
              ])
            : doRemove(),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const balanced = math.pendingCount === 0 && math.totalCashoutCents === math.totalBuyinCents;
  const offBy = Math.abs(math.totalCashoutCents - math.totalBuyinCents);
  const notInSession = players.filter(
    (p) => !p.archived && !detail.players.some((sp) => sp.player.id === p.id),
  );

  return (
    <Screen
      scroll
      footer={
        tab === 'buyins' ? (
          <Button label="Go to Cash-Out  →" variant="orange" onPress={() => setTab('cashout')} />
        ) : (
          <Button
            label="Settle up  →"
            onPress={() => router.push(`/session/${id}/settle`)}
            disabled={math.pendingCount > 0}
          />
        )
      }>
      <NavHeader
        overline="Active night"
        overlineTone="orange"
        dot
        title={title}
        onBack={() => router.back()}
        onTitlePress={() => setEditingNight(true)}
        right={
          <View style={s.potPool}>
            <Text style={s.potValue}>{formatCents(math.totalBuyinCents, symbol)}</Text>
            <Text style={s.potLabel}>Pot Pool</Text>
          </View>
        }
      />

      <SegmentedControl
        segments={[
          { key: 'buyins', label: 'Buy-ins' },
          { key: 'cashout', label: 'Cash-out' },
          { key: 'settle', label: 'Settle' },
        ]}
        value={tab}
        onChange={(key) => {
          if (key === 'settle') router.push(`/session/${id}/settle`);
          else setTab(key as Tab);
        }}
        style={{ marginBottom: space.md }}
      />

      {tab === 'buyins' ? (
        <>
          <Banner
            kind="info"
            text={`Tap + to log the default rebuy (${formatCents(detail.session.defaultBuyinCents, symbol)})`}
            style={{ alignItems: 'center', marginBottom: space.md }}
          />
          {math.rows.map((row) => {
            const d = detailOf(row.playerId);
            return (
              <BuyinRow
                key={row.playerId}
                row={row}
                buyins={d.buyins}
                onAddDefault={() => safe(() => store.addBuyin(d.sp.id, detail.session.defaultBuyinCents))}
                onCustomBuyin={() => setPad({ kind: 'customBuyin', spId: d.sp.id, name: row.name })}
                onEditBuyin={(b) => setPad({ kind: 'editBuyin', buyin: b })}
                onLongPress={() => onRowLongPress(d.sp.id, row.name, d.buyins.length > 0)}
              />
            );
          })}
          <Button
            label="+ Add player"
            variant="secondary"
            size="md"
            onPress={() => setAddingPlayer(true)}
            style={{ marginTop: space.sm }}
          />
          <Caption tone="muted" style={{ marginTop: space.sm }}>
            Long-press + for a custom amount · tap a pill to edit or remove it · long-press a row to
            remove the player.
          </Caption>
        </>
      ) : (
        <>
          <StatusPill
            tone={balanced ? 'ok' : 'warn'}
            label={
              math.pendingCount > 0
                ? `${math.pendingCount} still to cash out`
                : balanced
                  ? 'Balanced Pool'
                  : `Off by ${formatCents(offBy, symbol)}`
            }
            value={`${formatCents(math.totalCashoutCents, symbol)} / ${formatCents(math.totalBuyinCents, symbol)}`}
            style={{ marginBottom: space.md }}
          />
          {math.rows.map((row) => {
            const d = detailOf(row.playerId);
            return (
              <CashoutRow
                key={row.playerId}
                row={row}
                onPress={() => setPad({ kind: 'cashout', spId: d.sp.id, name: row.name, current: d.sp.cashoutCents })}
                onLongPress={() => onRowLongPress(d.sp.id, row.name, d.buyins.length > 0)}
              />
            );
          })}
          {math.pendingCount === 0 && !balanced ? (
            <Banner
              kind="warn"
              text={`Off by ${formatCents(offBy, symbol)} — ${
                math.totalCashoutCents > math.totalBuyinCents ? 'too much cashed out' : 'cash missing'
              }. Recount?`}
              style={{ marginTop: space.sm }}
            />
          ) : null}
          <Caption tone="muted" style={{ marginTop: space.sm }}>
            Tap a row to type a cash-out. Amounts stay editable after settling.
          </Caption>
        </>
      )}

      <AmountPad
        visible={pad.kind === 'customBuyin'}
        title={pad.kind === 'customBuyin' ? `Buy-in · ${pad.name}` : 'Buy-in'}
        initialCents={detail.session.defaultBuyinCents}
        onCancel={closePad}
        onConfirm={(c) => {
          if (pad.kind === 'customBuyin') safe(() => store.addBuyin(pad.spId, c));
          closePad();
        }}
      />
      <AmountPad
        visible={pad.kind === 'editBuyin'}
        title="Edit buy-in"
        initialCents={pad.kind === 'editBuyin' ? pad.buyin.amountCents : null}
        onCancel={closePad}
        onConfirm={(c) => {
          if (pad.kind === 'editBuyin') safe(() => store.updateBuyin(pad.buyin.id, c));
          closePad();
        }}
        onDelete={() => {
          if (pad.kind === 'editBuyin') safe(() => store.removeBuyin(pad.buyin.id));
          closePad();
        }}
      />
      <AmountPad
        visible={pad.kind === 'cashout'}
        title={pad.kind === 'cashout' ? `Cash-out · ${pad.name}` : 'Cash-out'}
        allowZero
        initialCents={pad.kind === 'cashout' ? pad.current : null}
        onCancel={closePad}
        onConfirm={(c) => {
          if (pad.kind === 'cashout') safe(() => store.setCashout(pad.spId, c));
          closePad();
        }}
        onDelete={
          pad.kind === 'cashout' && pad.current !== null
            ? () => {
                if (pad.kind === 'cashout') safe(() => store.setCashout(pad.spId, null));
                closePad();
              }
            : undefined
        }
      />

      <AddPlayerSheet
        visible={addingPlayer}
        candidates={notInSession}
        onClose={() => setAddingPlayer(false)}
        onPick={(playerId) => {
          safe(() => store.addPlayer(playerId));
          setAddingPlayer(false);
        }}
      />

      <EditNightSheet
        visible={editingNight}
        initialTitle={detail.session.title ?? ''}
        initialDate={detail.session.date}
        onClose={() => setEditingNight(false)}
        onSave={(next) => {
          safe(() => store.updateSession({ title: next.title.trim() || null, date: next.date }));
          setEditingNight(false);
        }}
      />
    </Screen>
  );
}

function AddPlayerSheet({
  visible,
  candidates,
  onPick,
  onClose,
}: {
  visible: boolean;
  candidates: Player[];
  onPick: (playerId: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.scrim} onPress={onClose} accessibilityLabel="Dismiss" />
      <View style={s.sheet}>
        <Overline style={{ marginBottom: space.md }}>Add player to this night</Overline>
        {candidates.length === 0 ? (
          <Body dim>Everyone on the roster is already in. Add new players from the Players screen.</Body>
        ) : (
          <PlayerChecklist players={candidates} selectedIds={[]} onToggle={onPick} mode="add" />
        )}
        <Button label="Done" variant="secondary" onPress={onClose} style={{ marginTop: space.sm }} />
      </View>
    </Modal>
  );
}

function EditNightSheet({
  visible,
  initialTitle,
  initialDate,
  onSave,
  onClose,
}: {
  visible: boolean;
  initialTitle: string;
  initialDate: string;
  onSave: (next: { title: string; date: string }) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(initialTitle);
  const [date, setDate] = useState(initialDate);
  const [showPicker, setShowPicker] = useState(false);

  useEffect(() => {
    if (visible) {
      setTitle(initialTitle);
      setDate(initialDate);
      setShowPicker(false);
    }
  }, [visible, initialTitle, initialDate]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={s.scrim} onPress={onClose} accessibilityLabel="Dismiss" />
      <View style={s.sheet}>
        <Overline style={{ marginBottom: space.md }}>Edit night</Overline>
        <TextInput
          value={title}
          onChangeText={setTitle}
          placeholder="Night title"
          placeholderTextColor={colors.textMuted}
          style={s.input}
          returnKeyType="done"
        />
        <Row style={{ marginTop: space.md }}>
          <Caption style={{ flex: 1 }}>Date</Caption>
          {Platform.OS === 'ios' ? (
            <DateTimePicker
              value={fromIso(date)}
              mode="date"
              display="compact"
              themeVariant="dark"
              accentColor={colors.accent}
              onChange={(_e, d) => {
                if (d) setDate(toIso(d));
              }}
            />
          ) : (
            <Button label={formatDate(date)} variant="secondary" size="md" onPress={() => setShowPicker(true)} />
          )}
        </Row>
        {showPicker && Platform.OS === 'android' ? (
          <DateTimePicker
            value={fromIso(date)}
            mode="date"
            onChange={(_e, d) => {
              setShowPicker(false);
              if (d) setDate(toIso(d));
            }}
          />
        ) : null}
        <Row style={{ marginTop: space.lg }}>
          <Button label="Cancel" variant="secondary" onPress={onClose} style={{ flex: 1, marginRight: space.sm }} />
          <Button label="Save" onPress={() => onSave({ title, date })} style={{ flex: 1 }} />
        </Row>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  potPool: {
    alignItems: 'flex-end',
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentBorder,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  potValue: { ...textStyles.numericMd, color: colors.accent },
  potLabel: { ...textStyles.labelCaps, color: colors.accent },
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

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test`
Expected: all suites pass.

Manual (iOS simulator), on a night with Ann, Bob, Cat:
1. Header: orange dot + "ACTIVE NIGHT", the night title, and a green "Pot Pool $0" badge top-right.
2. Segmented control reads Buy-ins | Cash-out | Settle with "Buy-ins" emerald.
3. Info banner: "Tap + to log the default rebuy ($20)".
4. Tap Ann's orange `+` twice → her row reads "In: $20 $20" and the Pot Pool badge climbs to $40.
5. Long-press Bob's `+` → amount pad prefilled 20 → enter 35 → "In: $35".
6. Tap one of Ann's `$20` pills → "Edit buy-in" pad → change to 25 → pill updates. Reopen → "Remove"
   deletes it.
7. "+ Add player" → sheet lists roster members not in the night, each with an orange `+`; picking one
   appends their row. With nobody left it explains that instead.
8. Long-press a row → "Remove from night" (confirms when the player has buy-ins).
9. Tap the header title → Edit night sheet → rename to "Dave's place", change the date, Save →
   header and home row both update.
10. Footer "Go to Cash-Out →" (orange) switches to the Cash-out view; the segment highlight follows.
11. Cash-out view: status pill shows "3 still to cash out" in amber. Each row is dashed with
    "Tap to enter". Enter 10 / 80 / 25 → pill turns green "Balanced Pool $115 / $115" once the sums
    match; enter a wrong number to see the amber "Off by $X — …" banner.
12. "Settle up →" is disabled until every player has a cash-out, then pushes the settle screen.
13. "Settle" segment also pushes the settle screen and leaves the highlight on the current view when
    you come back.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(app): session screen with buy-in table and cash-out list

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 14: Chip counter sheet

Implements `docs/design/stitch/chips_chip_counter_settlements/screen.png`: the chip-by-colour
counter with chip badges, `Value: $5.00` sub-labels, `−  count  +` steppers (orange `+`), a live
tally total, and the green "Apply to <name>'s cash-out" action.

Chip counts are a calculator only — nothing here is persisted. Confirming writes a single
`setCashout` for that player.

**Files:**
- Create: `src/components/ChipSheet.tsx`
- Modify: `src/app/session/[id]/index.tsx` (wire "Use chips" into the cash-out pad)

**Interfaces:**
- Consumes: `chipsToCents` from `@/domain/chips`; `formatCents` from `@/domain/money`; `useSettingsStore` (`denoms`, `settings.currencySymbol`); ui primitives.
- Produces:
  ```tsx
  export function ChipSheet(p: {
    visible: boolean; playerName: string; onUse(cents: number): void; onCancel(): void;
  }): JSX.Element
  ```

- [ ] **Step 1: Create `src/components/ChipSheet.tsx`**

```tsx
import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Body, Button, Caption, NavHeader, Overline, Row, Screen } from '@/components/ui';
import { chipsToCents } from '@/domain/chips';
import { formatCents } from '@/domain/money';
import { useSettingsStore } from '@/store/useSettingsStore';
import { colors, fonts, radius, space, TAP, textStyles } from '@/theme';

export function ChipSheet({
  visible,
  playerName,
  onUse,
  onCancel,
}: {
  visible: boolean;
  playerName: string;
  onUse: (cents: number) => void;
  onCancel: () => void;
}) {
  const denoms = useSettingsStore((s) => s.denoms);
  const symbol = useSettingsStore((s) => s.settings.currencySymbol);
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (visible) setCounts({});
  }, [visible]);

  const total = useMemo(() => chipsToCents(counts, denoms), [counts, denoms]);
  const setCount = (id: string, n: number) =>
    setCounts((c) => ({ ...c, [id]: Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0 }));

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onCancel}>
      <Screen
        footer={
          <>
            <Button label={`Apply to ${playerName}'s cash-out`} onPress={() => onUse(total)} />
            <Button label="Cancel" variant="ghost" size="md" onPress={onCancel} style={{ marginTop: space.sm }} />
          </>
        }>
        <NavHeader overline="Chip counter" overlineTone="accent" title={`${playerName}'s chips`} onClose={onCancel} />

        <Row style={{ marginBottom: space.md }}>
          <View style={{ flex: 1 }}>
            <Overline>Chip by colour counter</Overline>
            <Caption tone="muted">Tap + or − to tally the stack</Caption>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Overline>Tally total</Overline>
            <Text style={s.total}>{formatCents(total, symbol)}</Text>
          </View>
        </Row>

        {denoms.length === 0 ? (
          <Body dim>No chip denominations yet. Add them in Settings.</Body>
        ) : (
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {denoms.map((d) => {
              const count = counts[d.id] ?? 0;
              return (
                <Row key={d.id} style={s.row}>
                  <View style={[s.badge, { backgroundColor: d.colorHex }]}>
                    <View style={s.badgeRing} />
                  </View>
                  <View style={s.labels}>
                    <Text style={s.label}>{d.label}</Text>
                    <Text style={s.value}>Value: {formatCents(d.valueCents, symbol)}</Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`One less ${d.label} chip`}
                    onPress={() => setCount(d.id, count - 1)}
                    style={({ pressed }) => [s.step, s.stepMinus, pressed && { opacity: 0.7 }]}>
                    <Text style={s.stepMinusGlyph}>−</Text>
                  </Pressable>
                  <TextInput
                    value={String(count)}
                    onChangeText={(t) => setCount(d.id, parseInt(t, 10))}
                    keyboardType="number-pad"
                    selectTextOnFocus
                    accessibilityLabel={`${d.label} chip count`}
                    style={s.count}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`One more ${d.label} chip`}
                    onPress={() => setCount(d.id, count + 1)}
                    style={({ pressed }) => [s.step, s.stepPlus, pressed && { opacity: 0.85 }]}>
                    <Text style={s.stepPlusGlyph}>+</Text>
                  </Pressable>
                </Row>
              );
            })}
            <Caption tone="muted" style={{ marginTop: space.sm }}>
              Counts are never saved — only the total is written to the cash-out.
            </Caption>
          </ScrollView>
        )}
      </Screen>
    </Modal>
  );
}

const s = StyleSheet.create({
  total: { ...textStyles.numericLg, color: colors.accent },
  row: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    marginBottom: space.sm,
  },
  badge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeRing: { width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: colors.bg, opacity: 0.4 },
  labels: { flex: 1, marginLeft: space.md },
  label: { ...textStyles.labelMd, fontSize: 15, color: colors.text },
  value: { ...textStyles.bodySm, fontFamily: fonts.mono, color: colors.textDim },
  step: { width: TAP, height: TAP, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  stepMinus: { backgroundColor: colors.cardAlt, borderWidth: 1, borderColor: colors.border },
  stepPlus: { backgroundColor: colors.orange },
  stepMinusGlyph: { ...textStyles.headlineMd, color: colors.textDim },
  stepPlusGlyph: { ...textStyles.headlineMd, color: colors.onOrange },
  count: {
    width: 44,
    textAlign: 'center',
    ...textStyles.numericMd,
    fontFamily: fonts.mono,
    color: colors.text,
    paddingVertical: space.xs,
  },
});
```

- [ ] **Step 2: Wire "Use chips" into the session cash-out pad**

Four edits in `src/app/session/[id]/index.tsx`.

Edit 1 — add the import next to the other component imports:

```tsx
import { ChipSheet } from '@/components/ChipSheet';
```

Edit 2 — add state and the denominations list right after `const [editingNight, setEditingNight] = useState(false);`:

```tsx
  const [chipFor, setChipFor] = useState<{ spId: string; name: string } | null>(null);
  const denoms = useSettingsStore((s) => s.denoms);
```

Edit 3 — on the **cash-out** `AmountPad` (the one with `allowZero`), add the `extraAction` prop
immediately after `initialCents`:

```tsx
        extraAction={
          denoms.length > 0 && pad.kind === 'cashout'
            ? {
                label: 'Use chips',
                onPress: () => {
                  if (pad.kind !== 'cashout') return;
                  const target = { spId: pad.spId, name: pad.name };
                  closePad();
                  setChipFor(target);
                },
              }
            : undefined
        }
```

Edit 4 — render the sheet directly after the `<EditNightSheet … />` element:

```tsx
      <ChipSheet
        visible={chipFor !== null}
        playerName={chipFor?.name ?? ''}
        onCancel={() => setChipFor(null)}
        onUse={(cents) => {
          if (chipFor) safe(() => store.setCashout(chipFor.spId, cents));
          setChipFor(null);
        }}
      />
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test`
Expected: all suites pass (`chipsToCents` is already covered by Task 4).

Manual (iOS simulator):
1. With no denominations configured (fresh install), open a cash-out pad → there is **no**
   "Use chips" button, and no errors appear.
2. Full verification runs after Task 17 adds the Settings editor. Once denominations exist
   (White $1, Red $5, Blue $10): cash-out pad → "Use chips" → the counter opens with the player's
   name in the header, all counts 0, tally `$0`.
3. Tap `+` on Red five times → count 5, tally `$25.00`, and the tally is emerald.
4. Type `12` into the White count field → tally recomputes.
5. `−` never goes below 0.
6. "Apply to Bob's cash-out" closes the sheet and fills Bob's cash-out with the tally; the
   Balanced Pool pill updates.
7. Reopening the counter starts from zero again (counts are not persisted).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(app): chip-by-colour counter sheet for cash-out

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 15: Settlement screen

Implements the top half of `docs/design/stitch/chips_settlements_share_results/screen.png`: the
"Total cash handled" card, the "FEWEST TRANSFERS REQUIRED" header with a transaction-count badge,
the transfer cards, plus the spec's RESULTS list and collapsible DETAILS table. The share card and
its buttons arrive in Task 16.

**Files:**
- Create: `src/components/TransferRow.tsx`
- Modify: `src/app/session/[id]/settle.tsx` (replace the Task 11 stub)

**Interfaces:**
- Consumes: `summarize` from `@/domain/nets`; `formatCents`, `formatSigned` from `@/domain/money`; `formatDate` from `@/date`; `useSessionsStore` (`detail`, `open`), `useSettingsStore`; ui primitives and `MoneyText`.
- Produces:
  ```tsx
  export function TransferRow(p: {
    fromName: string; fromSeed: number; toName: string; toSeed: number; amountCents: number;
  }): JSX.Element
  ```
  Route `/session/[id]/settle`.

- [ ] **Step 1: Create `src/components/TransferRow.tsx`**

```tsx
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Avatar, Row } from '@/components/ui';
import { MoneyText } from '@/components/MoneyText';
import { colors, radius, space, textStyles } from '@/theme';

export function TransferRow({
  fromName,
  fromSeed,
  toName,
  toSeed,
  amountCents,
}: {
  fromName: string;
  fromSeed: number;
  toName: string;
  toSeed: number;
  amountCents: number;
}) {
  return (
    <View style={s.card} accessibilityLabel={`${fromName} pays ${toName}`}>
      <Row>
        <Avatar name={fromName} seed={fromSeed} size={28} />
        <Text style={s.name} numberOfLines={1}>
          {fromName}
        </Text>
        <View style={s.pays}>
          <Text style={s.paysLabel}>pays →</Text>
        </View>
        <Avatar name={toName} seed={toSeed} size={28} />
        <Text style={s.name} numberOfLines={1}>
          {toName}
        </Text>
        <View style={{ flex: 1 }} />
        <MoneyText cents={amountCents} color="accent" />
      </Row>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.md,
    marginBottom: space.sm,
  },
  name: { ...textStyles.labelMd, fontSize: 14, color: colors.text, marginLeft: space.sm, flexShrink: 1 },
  pays: {
    marginHorizontal: space.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: colors.cardAlt,
  },
  paysLabel: { ...textStyles.bodySm, color: colors.textDim },
});
```

- [ ] **Step 2: Replace `src/app/session/[id]/settle.tsx`**

```tsx
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Avatar, Banner, Body, Caption, Divider, NavHeader, Overline, Row, Screen } from '@/components/ui';
import { MoneyText } from '@/components/MoneyText';
import { TransferRow } from '@/components/TransferRow';
import { useSessionsStore } from '@/store/useSessionsStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { summarize } from '@/domain/nets';
import { formatCents, formatSigned } from '@/domain/money';
import { formatDate } from '@/date';
import { colors, radius, space, textStyles } from '@/theme';

export default function SettleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const detail = useSessionsStore((s) => s.detail);
  const open = useSessionsStore((s) => s.open);
  const symbol = useSettingsStore((s) => s.settings.currencySymbol);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (id && detail?.session.id !== id) open(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const math = useMemo(() => (detail ? summarize(detail) : null), [detail]);
  if (!detail || !math || detail.session.id !== id) {
    return (
      <Screen>
        <Body dim>Loading…</Body>
      </Screen>
    );
  }

  const nameOf = (pid: string) => math.rows.find((r) => r.playerId === pid)?.name ?? '?';
  const seedOf = (pid: string) => math.rows.find((r) => r.playerId === pid)?.colorSeed ?? 0;
  const disc = math.settlement.discrepancyCents;
  const balanced = disc === 0 && math.pendingCount === 0;
  const results = [...math.rows]
    .filter((r) => r.netCents !== null)
    .sort((a, b) => (b.netCents ?? 0) - (a.netCents ?? 0));
  const count = math.settlement.transfers.length;
  const nightTitle = detail.session.title?.trim() ? detail.session.title : formatDate(detail.session.date);

  return (
    <Screen scroll>
      <NavHeader
        overline={nightTitle}
        overlineTone={balanced ? 'accent' : 'dim'}
        title="Settlements"
        onBack={() => router.back()}
        right={
          <View style={[s.statusDisc, balanced ? s.statusOk : s.statusWarn]}>
            <Text style={[s.statusGlyph, { color: balanced ? colors.accent : colors.warn }]}>
              {balanced ? '✓' : '!'}
            </Text>
          </View>
        }
      />

      <Row style={s.totalCard}>
        <View style={s.coin}>
          <Text style={s.coinGlyph}>{symbol}</Text>
        </View>
        <View style={{ flex: 1, marginLeft: space.md }}>
          <Overline>Total cash handled</Overline>
          <Caption tone={balanced ? 'dim' : 'muted'}>
            {balanced
              ? 'Balanced pot pool'
              : disc !== 0
                ? `Off by ${formatCents(Math.abs(disc), symbol)}`
                : `${math.pendingCount} still to cash out`}
          </Caption>
        </View>
        <MoneyText cents={math.totalBuyinCents} variant="lg" color="accent" />
      </Row>

      {math.pendingCount > 0 ? (
        <Banner
          kind="info"
          text={`${math.pendingCount} player${math.pendingCount === 1 ? '' : 's'} not cashed out — excluded below`}
          style={{ marginTop: space.md }}
        />
      ) : null}
      {disc !== 0 ? (
        <Banner
          kind="warn"
          text={`Books off by ${formatCents(Math.abs(disc), symbol)} (${disc > 0 ? 'too much cashed out' : 'cash missing'})`}
          style={{ marginTop: space.md }}
        />
      ) : null}

      <Row style={s.sectionHead}>
        <Overline>Fewest transfers required</Overline>
        <View style={{ flex: 1 }} />
        <View style={s.badge}>
          <Text style={s.badgeLabel}>
            {count} transaction{count === 1 ? '' : 's'}
          </Text>
        </View>
      </Row>

      {count === 0 ? (
        <Body dim>Nobody owes anything.</Body>
      ) : (
        math.settlement.transfers.map((t, i) => (
          <TransferRow
            key={`${t.from}-${t.to}-${i}`}
            fromName={nameOf(t.from)}
            fromSeed={seedOf(t.from)}
            toName={nameOf(t.to)}
            toSeed={seedOf(t.to)}
            amountCents={t.amountCents}
          />
        ))
      )}

      <Overline style={{ marginTop: space.xl, marginBottom: space.sm }}>Results</Overline>
      <View style={s.panel}>
        {results.map((r, i) => (
          <View key={r.playerId}>
            {i > 0 ? <Divider /> : null}
            <Row style={s.resultRow}>
              <Avatar name={r.name} seed={r.colorSeed} size={28} />
              <Text style={s.resultName} numberOfLines={1}>
                {r.name}
              </Text>
              <View style={{ flex: 1 }} />
              <MoneyText cents={r.netCents ?? 0} signed />
            </Row>
          </View>
        ))}
        {results.length === 0 ? (
          <Row style={s.resultRow}>
            <Body dim>No cash-outs entered yet.</Body>
          </Row>
        ) : null}
      </View>

      <Pressable onPress={() => setShowDetails((v) => !v)} style={s.detailsToggle} accessibilityRole="button">
        <Overline>{showDetails ? 'Details ▾' : 'Details ▸'}</Overline>
      </Pressable>
      {showDetails ? (
        <View style={s.panel}>
          <Row style={s.detailRow}>
            <Caption style={s.colName}>Player</Caption>
            <Caption style={s.col}>In</Caption>
            <Caption style={s.col}>Out</Caption>
            <Caption style={s.col}>Net</Caption>
          </Row>
          <Divider />
          {math.rows.map((r, i) => (
            <View key={r.playerId}>
              {i > 0 ? <Divider /> : null}
              <Row style={s.detailRow}>
                <Text style={[s.cell, s.colName]} numberOfLines={1}>
                  {r.name}
                </Text>
                <Text style={[s.cell, s.col]}>{formatCents(r.buyinCents, symbol)}</Text>
                <Text style={[s.cell, s.col]}>
                  {r.cashoutCents === null ? '—' : formatCents(r.cashoutCents, symbol)}
                </Text>
                <Text style={[s.cell, s.col]}>{r.netCents === null ? '—' : formatSigned(r.netCents, symbol)}</Text>
              </Row>
            </View>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

const s = StyleSheet.create({
  statusDisc: { width: 36, height: 36, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  statusOk: { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder },
  statusWarn: { backgroundColor: colors.warnSoft, borderColor: colors.warnBorder },
  statusGlyph: { ...textStyles.labelMd, fontSize: 16 },
  totalCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: space.lg,
  },
  coin: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.orangeSoft,
    borderWidth: 1,
    borderColor: colors.orangeBorder,
    alignItems: 'center',
    justifyContent: 'center',
  },
  coinGlyph: { ...textStyles.labelMd, fontSize: 16, color: colors.orange },
  sectionHead: { marginTop: space.xl, marginBottom: space.sm, paddingHorizontal: space.xs },
  badge: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 2,
  },
  badgeLabel: { ...textStyles.labelCaps, color: colors.accent },
  panel: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  resultRow: { paddingHorizontal: space.md, paddingVertical: space.md },
  resultName: { ...textStyles.labelMd, fontSize: 15, color: colors.text, marginLeft: space.sm, flexShrink: 1 },
  detailsToggle: { marginTop: space.xl, marginBottom: space.sm, paddingHorizontal: space.xs },
  detailRow: { paddingHorizontal: space.md, paddingVertical: space.sm },
  cell: { ...textStyles.numericSm, color: colors.text },
  colName: { flex: 2 },
  col: { flex: 1, textAlign: 'right' },
});
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test`
Expected: all suites pass.

Manual (iOS simulator), on a night with Ann −$25, Bob +$25, Cat $0:
1. Header: the night title as a green overline, "Settlements", and a green ✓ disc on the right.
2. "Total cash handled" card: orange `$` tile, "BALANCED POT POOL" sub-line, emerald total on the
   right equal to the pot pool.
3. "FEWEST TRANSFERS REQUIRED" with an emerald "1 transaction" badge; the row reads
   "A Ann  pays →  B Bob   $25".
4. RESULTS panel lists Bob +$25 (emerald), Cat $0 (grey), Ann −$25 (rose), sorted descending.
5. "DETAILS ▸" expands to the Player / In / Out / Net table with right-aligned tabular figures.
6. Clear one cash-out → the blue "1 player not cashed out — excluded below" banner appears and the
   status disc turns amber "!".
7. Make the books mismatch → the amber "Books off by $X …" banner appears and the sub-line under
   "Total cash handled" reads "Off by $X".

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(app): settlement screen with transfer cards and results

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 16: Share card, live preview, share and copy actions

Implements the bottom half of `docs/design/stitch/chips_settlements_share_results/screen.png`: the
"MESSAGE CARD — Live preview" block, the green "Share image" button and the secondary
"Copy to clipboard" button. The card itself is the existing code-rendered 1080 px `View` captured
with `react-native-view-shot`, restyled to the Stitch message-card look (green "CHIPS" overline,
title, bulleted transfer list with right-aligned amounts, results, details table, footer with date
and a "Pool balanced: $X" pill).

The share sheet is the generic native one (`expo-sharing`) — there is no WhatsApp-specific
integration, so the button reads "Share image".

**Files:**
- Create: `src/components/ShareCard.tsx`, `src/share.ts`
- Modify: `src/app/session/[id]/settle.tsx` (offscreen card, live preview, footer actions, `?share=1`), `package.json` (expo-clipboard)

**Interfaces:**
- Consumes: `SessionDetail` from `@/domain/types`; `SessionSummaryMath` from `@/domain/nets`; `formatCents`, `formatSigned`; `formatDate`; theme tokens.
- Produces:
  ```tsx
  // src/components/ShareCard.tsx
  export const SHARE_CARD_WIDTH = 1080;
  export const ShareCard: React.ForwardRefExoticComponent<
    { detail: SessionDetail; math: SessionSummaryMath; symbol: string; onLayout?: (e: LayoutChangeEvent) => void }
    & React.RefAttributes<View>>;
  // src/share.ts
  export async function captureAndShare(ref: RefObject<View | null>): Promise<void>   // throws Error with a message
  export function buildShareText(detail: SessionDetail, math: SessionSummaryMath, symbol: string): string
  export async function copyToClipboard(text: string): Promise<void>
  ```

- [ ] **Step 1: Install the clipboard module**

```bash
cd /Users/stevenkhaw/Documents/GitHub/Chips
npx expo install expo-clipboard
```

- [ ] **Step 2: Create `src/share.ts`**

```ts
import type { RefObject } from 'react';
import type { View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';
import { formatCents, formatSigned } from '@/domain/money';
import type { SessionSummaryMath } from '@/domain/nets';
import type { SessionDetail } from '@/domain/types';
import { formatDate } from '@/date';

export async function captureAndShare(ref: RefObject<View | null>): Promise<void> {
  if (!ref.current) throw new Error('Nothing to share yet');
  const uri = await captureRef(ref, { format: 'png', quality: 1, result: 'tmpfile' });
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device');
  await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share settlement' });
}

/** Plain-text twin of the share card, for pasting into any chat app. */
export function buildShareText(detail: SessionDetail, math: SessionSummaryMath, symbol: string): string {
  const nameOf = (pid: string) => math.rows.find((r) => r.playerId === pid)?.name ?? '?';
  const title = detail.session.title?.trim() ? detail.session.title : 'Poker night';
  const lines: string[] = [`${title} — ${formatDate(detail.session.date)}`, ''];

  if (math.settlement.transfers.length === 0) {
    lines.push('Nobody owes anything.');
  } else {
    for (const t of math.settlement.transfers) {
      lines.push(`• ${nameOf(t.from)} pays ${nameOf(t.to)}  ${formatCents(t.amountCents, symbol)}`);
    }
  }

  const results = [...math.rows]
    .filter((r) => r.netCents !== null)
    .sort((a, b) => (b.netCents ?? 0) - (a.netCents ?? 0));
  if (results.length > 0) {
    lines.push('', 'Results:');
    for (const r of results) lines.push(`  ${r.name}  ${formatSigned(r.netCents ?? 0, symbol)}`);
  }

  const disc = math.settlement.discrepancyCents;
  lines.push(
    '',
    disc === 0
      ? `Pool balanced: ${formatCents(math.totalBuyinCents, symbol)}`
      : `Off by ${formatCents(Math.abs(disc), symbol)} (${disc > 0 ? 'too much cashed out' : 'cash missing'})`,
  );
  return lines.join('\n');
}

export async function copyToClipboard(text: string): Promise<void> {
  await Clipboard.setStringAsync(text);
}
```

- [ ] **Step 3: Create `src/components/ShareCard.tsx`**

Fixed 1080 px wide, any height. Everything is boxes, text and circles — no images.

```tsx
import React, { forwardRef } from 'react';
import { StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { formatCents, formatSigned } from '@/domain/money';
import type { SessionSummaryMath } from '@/domain/nets';
import type { SessionDetail } from '@/domain/types';
import { formatDate } from '@/date';
import { avatarColor, colors, fonts } from '@/theme';

export const SHARE_CARD_WIDTH = 1080;

const PAD = 56;

export const ShareCard = forwardRef<
  View,
  {
    detail: SessionDetail;
    math: SessionSummaryMath;
    symbol: string;
    onLayout?: (e: LayoutChangeEvent) => void;
  }
>(function ShareCard({ detail, math, symbol, onLayout }, ref) {
  const nameOf = (pid: string) => math.rows.find((r) => r.playerId === pid)?.name ?? '?';
  const seedOf = (pid: string) => math.rows.find((r) => r.playerId === pid)?.colorSeed ?? 0;
  const disc = math.settlement.discrepancyCents;
  const balanced = disc === 0;
  const title = detail.session.title?.trim() ? detail.session.title : 'Poker night';
  const results = [...math.rows]
    .filter((r) => r.netCents !== null)
    .sort((a, b) => (b.netCents ?? 0) - (a.netCents ?? 0));

  return (
    <View ref={ref} collapsable={false} onLayout={onLayout} style={s.canvas}>
      <View style={s.card}>
        <View style={s.header}>
          <Text style={s.brand}>CHIPS</Text>
          <Text style={s.title}>{title}</Text>
        </View>

        <View style={s.rule} />

        {math.settlement.transfers.length === 0 ? (
          <Text style={s.empty}>Nobody owes anything.</Text>
        ) : (
          math.settlement.transfers.map((t, i) => (
            <View key={`${t.from}-${t.to}-${i}`} style={s.transfer}>
              <View style={[s.dot, { backgroundColor: avatarColor(seedOf(t.from)) }]} />
              <Text style={s.transferText} numberOfLines={1}>
                {nameOf(t.from)} pays {nameOf(t.to)}
              </Text>
              <View style={s.spacer} />
              <Text style={s.transferAmount}>{formatCents(t.amountCents, symbol)}</Text>
            </View>
          ))
        )}

        {results.length > 0 ? (
          <>
            <Text style={s.sectionLabel}>RESULTS</Text>
            {results.map((r) => (
              <View key={r.playerId} style={s.resultRow}>
                <View style={[s.dot, { backgroundColor: avatarColor(r.colorSeed) }]} />
                <Text style={s.resultName} numberOfLines={1}>
                  {r.name}
                </Text>
                <View style={s.spacer} />
                <Text
                  style={[
                    s.resultNet,
                    { color: (r.netCents ?? 0) > 0 ? colors.pos : (r.netCents ?? 0) < 0 ? colors.neg : colors.textDim },
                  ]}>
                  {formatSigned(r.netCents ?? 0, symbol)}
                </Text>
              </View>
            ))}
          </>
        ) : null}

        <Text style={s.sectionLabel}>DETAILS</Text>
        <View style={s.tableHead}>
          <Text style={[s.th, s.colName]}>Player</Text>
          <Text style={[s.th, s.col]}>In</Text>
          <Text style={[s.th, s.col]}>Out</Text>
          <Text style={[s.th, s.col]}>Net</Text>
        </View>
        {math.rows.map((r) => (
          <View key={r.playerId} style={s.tableRow}>
            <Text style={[s.td, s.colName]} numberOfLines={1}>
              {r.name}
            </Text>
            <Text style={[s.td, s.col]}>{formatCents(r.buyinCents, symbol)}</Text>
            <Text style={[s.td, s.col]}>{r.cashoutCents === null ? '—' : formatCents(r.cashoutCents, symbol)}</Text>
            <Text style={[s.td, s.col]}>{r.netCents === null ? '—' : formatSigned(r.netCents, symbol)}</Text>
          </View>
        ))}

        <View style={s.rule} />
        <View style={s.footer}>
          <Text style={s.date}>{formatDate(detail.session.date)}</Text>
          <View style={s.spacer} />
          <View style={[s.poolPill, balanced ? s.poolOk : s.poolWarn]}>
            <View style={[s.pillDot, { backgroundColor: balanced ? colors.accent : colors.warn }]} />
            <Text style={[s.poolText, { color: balanced ? colors.accent : colors.warn }]}>
              {balanced
                ? `Pool balanced: ${formatCents(math.totalBuyinCents, symbol)}`
                : `Off by ${formatCents(Math.abs(disc), symbol)}`}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
});

const s = StyleSheet.create({
  canvas: { width: SHARE_CARD_WIDTH, backgroundColor: colors.bg, padding: 40 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 48,
    borderWidth: 2,
    borderColor: colors.border,
    padding: PAD,
  },
  header: { marginBottom: 28 },
  brand: { fontFamily: fonts.bodyBold, fontSize: 30, letterSpacing: 6, color: colors.accent, marginBottom: 10 },
  title: { fontFamily: fonts.headline, fontSize: 64, lineHeight: 72, color: colors.text },
  rule: { height: 2, backgroundColor: colors.border, marginVertical: 28 },
  empty: { fontFamily: fonts.body, fontSize: 40, color: colors.textDim },
  transfer: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16 },
  dot: { width: 20, height: 20, borderRadius: 10, marginRight: 20 },
  spacer: { flex: 1, minWidth: 24 },
  transferText: { fontFamily: fonts.mono, fontSize: 42, lineHeight: 52, color: colors.text, flexShrink: 1 },
  transferAmount: {
    fontFamily: fonts.numeric,
    fontSize: 46,
    color: colors.accent,
    fontVariant: ['tabular-nums'],
  },
  sectionLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 26,
    letterSpacing: 4,
    color: colors.textDim,
    marginTop: 40,
    marginBottom: 16,
  },
  resultRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  resultName: { fontFamily: fonts.bodySemi, fontSize: 40, color: colors.text, flexShrink: 1 },
  resultNet: { fontFamily: fonts.numeric, fontSize: 42, fontVariant: ['tabular-nums'] },
  tableHead: { flexDirection: 'row', paddingBottom: 12, borderBottomWidth: 2, borderBottomColor: colors.border },
  tableRow: { flexDirection: 'row', paddingVertical: 12 },
  th: { fontFamily: fonts.bodyBold, fontSize: 26, letterSpacing: 2, color: colors.textDim },
  td: { fontFamily: fonts.bodyMedium, fontSize: 32, color: colors.text, fontVariant: ['tabular-nums'] },
  colName: { flex: 2 },
  col: { flex: 1, textAlign: 'right' },
  footer: { flexDirection: 'row', alignItems: 'center' },
  date: { fontFamily: fonts.body, fontSize: 30, color: colors.textDim },
  poolPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 2,
    paddingHorizontal: 24,
    paddingVertical: 10,
  },
  poolOk: { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder },
  poolWarn: { backgroundColor: colors.warnSoft, borderColor: colors.warnBorder },
  pillDot: { width: 14, height: 14, borderRadius: 7, marginRight: 12 },
  poolText: { fontFamily: fonts.bodySemi, fontSize: 28, fontVariant: ['tabular-nums'] },
});
```

- [ ] **Step 4: Wire the preview and the actions into `src/app/session/[id]/settle.tsx`**

Edit 1 — replace the React import line with one that also brings in `useRef`, and add the new
imports below the existing ones:

```tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
```

```tsx
import { Alert, useWindowDimensions } from 'react-native';
import { ShareCard, SHARE_CARD_WIDTH } from '@/components/ShareCard';
import { buildShareText, captureAndShare, copyToClipboard } from '@/share';
import { Button, toastError } from '@/components/ui';
```

Merge the three new `react-native` names (`Alert`, `useWindowDimensions`) into the existing
`react-native` import, and `Button` / `toastError` into the existing `@/components/ui` import,
rather than duplicating the import statements.

Edit 2 — read the `share` param by widening the existing `useLocalSearchParams` call:

```tsx
  const { id, share } = useLocalSearchParams<{ id: string; share?: string }>();
```

Edit 3 — add these hooks immediately after `const [showDetails, setShowDetails] = useState(false);`:

```tsx
  const cardRef = useRef<View>(null);
  const [cardHeight, setCardHeight] = useState(0);
  const [sharing, setSharing] = useState(false);
  const { width } = useWindowDimensions();
  const previewWidth = width - space.lg * 2;
  const previewScale = previewWidth / SHARE_CARD_WIDTH;
```

Edit 4 — add the two actions and the auto-share effect immediately after the `math` `useMemo`
(before the early `if (!detail …)` return, so hook order never changes):

```tsx
  const doShare = async () => {
    setSharing(true);
    try {
      await captureAndShare(cardRef);
    } catch (e) {
      toastError(e);
    } finally {
      setSharing(false);
    }
  };

  const doCopy = async () => {
    if (!detail || !math) return;
    try {
      await copyToClipboard(buildShareText(detail, math, symbol));
      Alert.alert('Copied', 'Settlement text copied to the clipboard.');
    } catch (e) {
      toastError(e);
    }
  };

  useEffect(() => {
    if (share !== '1' || !math || detail?.session.id !== id) return;
    // Let the offscreen card lay out before capturing it.
    const t = setTimeout(doShare, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [share, math, detail?.session.id, id]);
```

Edit 5 — give the `Screen` a footer by replacing `<Screen scroll>` with:

```tsx
    <Screen
      scroll
      footer={
        <>
          <Button label={sharing ? 'Preparing…' : 'Share image'} onPress={doShare} disabled={sharing} />
          <Button label="Copy to clipboard" variant="secondary" size="md" onPress={doCopy} style={{ marginTop: space.sm }} />
        </>
      }>
```

Edit 6 — append the preview block and the offscreen capture card at the very end of the screen's
children, just before the closing `</Screen>`:

```tsx
      <Row style={s.sectionHead}>
        <Overline>Message card</Overline>
        <View style={{ flex: 1 }} />
        <Caption tone="muted">Live preview</Caption>
      </Row>
      <View style={[s.preview, { width: previewWidth, height: Math.max(cardHeight * previewScale, 120) }]}>
        <View
          pointerEvents="none"
          style={{ width: SHARE_CARD_WIDTH, transform: [{ scale: previewScale }], transformOrigin: 'top left' }}>
          <ShareCard detail={detail} math={math} symbol={symbol} />
        </View>
      </View>

      <View style={s.offscreen} pointerEvents="none">
        <ShareCard
          ref={cardRef}
          detail={detail}
          math={math}
          symbol={symbol}
          onLayout={(e) => setCardHeight(e.nativeEvent.layout.height)}
        />
      </View>
```

Edit 7 — add these two entries to the `StyleSheet.create` block at the bottom of the file:

```tsx
  preview: { overflow: 'hidden', borderRadius: radius.lg, marginBottom: space.md },
  offscreen: { position: 'absolute', left: -SHARE_CARD_WIDTH * 2, top: 0, opacity: 0 },
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test`
Expected: all suites pass.

Manual (iOS simulator):
1. Open a settled night → below DETAILS there is a "MESSAGE CARD · Live preview" block showing the
   whole card shrunk to the screen width: green "CHIPS" overline, the night title, one bulleted
   transfer line per transfer with emerald amounts on the right, RESULTS, DETAILS, and a footer with
   the date plus a green "Pool balanced: $230" pill.
2. "Share image" → the iOS share sheet opens with a PNG → "Save Image" → in Photos the card is
   1080 px wide, dark, and every line is legible at thumbnail size.
3. "Copy to clipboard" → "Copied" alert → paste into Notes: the same transfers as plain text,
   ending in "Pool balanced: $230".
4. Unbalance the books → the preview footer pill turns amber and reads "Off by $X"; the copied text
   ends with the same sentence.
5. Home → long-press a night → "Share" → the settle screen opens and the share sheet appears on its
   own after a beat.
6. Add a 10th player with a long name → the preview stays inside its rounded frame and the card
   still captures without clipping.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(app): message-style share card with live preview and clipboard copy

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---
### Task 17: Players roster and Settings screens

These two screens have no Stitch mockup, so they are rebuilt from the same tokens and row/card
patterns as the mocked screens: `NavHeader`, grouped panels with hairline dividers, level-2 wells
for inputs, chip badges with a coloured rim, and long-press → `Alert` action sheets. Behaviour is
unchanged from the spec (§6.6, §6.7).

**Files:**
- Modify: `src/app/players.tsx` (replace the Task 11 stub), `src/app/settings.tsx` (replace the Task 11 stub)

**Interfaces:**
- Consumes: ui primitives; `AmountPad` (Task 12); `usePlayersStore` (`players`, `add`, `rename`, `setArchived`, `remove`), `useSettingsStore` (`settings`, `denoms`, `setDefaultBuyin`, `addDenom`, `updateDenom`, `removeDenom`, `reorderDenoms`); `formatCents`, `parseMoneyInput`; `CHIP_SWATCHES` from `@/theme`; `Player`, `ChipDenom` from `@/domain/types`.
- Produces: routes `/players` and `/settings`. No exported components.

- [ ] **Step 1: Replace `src/app/players.tsx`**

```tsx
import React, { useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Avatar, Body, Button, Caption, Divider, NavHeader, Overline, Row, Screen, toastError,
} from '@/components/ui';
import { usePlayersStore } from '@/store/usePlayersStore';
import type { Player } from '@/domain/types';
import { colors, radius, space, textStyles } from '@/theme';

export default function PlayersScreen() {
  const router = useRouter();
  const players = usePlayersStore((s) => s.players);
  const add = usePlayersStore((s) => s.add);
  const rename = usePlayersStore((s) => s.rename);
  const setArchived = usePlayersStore((s) => s.setArchived);
  const remove = usePlayersStore((s) => s.remove);
  const [editing, setEditing] = useState<{ player: Player | null; name: string } | null>(null);

  const safe = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      toastError(e);
    }
  };

  const active = players.filter((p) => !p.archived);
  const archived = players.filter((p) => p.archived);

  const onLongPress = (p: Player) =>
    Alert.alert(p.name, undefined, [
      { text: 'Rename', onPress: () => setEditing({ player: p, name: p.name }) },
      { text: p.archived ? 'Unarchive' : 'Archive', onPress: () => safe(() => setArchived(p.id, !p.archived)) },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          Alert.alert('Delete player?', 'Only possible if they never played a night.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => safe(() => remove(p.id)) },
          ]),
      },
      { text: 'Cancel', style: 'cancel' },
    ]);

  const save = () => {
    if (!editing || !editing.name.trim()) return;
    safe(() => {
      if (editing.player) rename(editing.player.id, editing.name.trim());
      else add(editing.name.trim());
      setEditing(null);
    });
  };

  const renderGroup = (list: Player[]) => (
    <View style={s.panel}>
      {list.map((p, i) => (
        <View key={p.id}>
          {i > 0 ? <Divider /> : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={p.name}
            onPress={() => setEditing({ player: p, name: p.name })}
            onLongPress={() => onLongPress(p)}
            style={({ pressed }) => [s.row, pressed && { backgroundColor: colors.cardAlt }]}>
            <Avatar name={p.name} seed={p.colorSeed} size={36} />
            <Text style={s.name} numberOfLines={1}>
              {p.name}
            </Text>
            <View style={{ flex: 1 }} />
            {p.archived ? <Caption tone="muted">archived</Caption> : null}
          </Pressable>
        </View>
      ))}
    </View>
  );

  return (
    <Screen scroll>
      <NavHeader
        title="Players"
        onBack={() => router.back()}
        right={<Button label="+ New" variant="secondary" size="md" onPress={() => setEditing({ player: null, name: '' })} />}
      />

      {players.length === 0 ? (
        <Body dim>No players yet. Tap "+ New" to add the first one.</Body>
      ) : (
        <>
          <Caption tone="muted" style={{ marginBottom: space.sm }}>
            Tap to rename · long-press for archive and delete.
          </Caption>
          {active.length > 0 ? renderGroup(active) : null}
          {archived.length > 0 ? (
            <>
              <Overline style={{ marginTop: space.xl, marginBottom: space.sm }}>Archived</Overline>
              {renderGroup(archived)}
            </>
          ) : null}
        </>
      )}

      <Modal visible={editing !== null} transparent animationType="fade" onRequestClose={() => setEditing(null)}>
        <View style={s.scrim}>
          <View style={s.dialog}>
            <Overline style={{ marginBottom: space.md }}>{editing?.player ? 'Rename player' : 'New player'}</Overline>
            <TextInput
              value={editing?.name ?? ''}
              onChangeText={(t) => setEditing((e) => (e ? { ...e, name: t } : e))}
              autoFocus
              onSubmitEditing={save}
              placeholder="Name"
              placeholderTextColor={colors.textMuted}
              style={s.input}
              returnKeyType="done"
            />
            <Row style={{ marginTop: space.lg }}>
              <Button label="Cancel" variant="secondary" onPress={() => setEditing(null)} style={{ flex: 1, marginRight: space.sm }} />
              <Button label="Save" onPress={save} disabled={!editing?.name.trim()} style={{ flex: 1 }} />
            </Row>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const s = StyleSheet.create({
  panel: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingHorizontal: space.md },
  name: { ...textStyles.labelMd, fontSize: 15, color: colors.text, marginLeft: space.md },
  scrim: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: space.xl },
  dialog: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: space.lg,
  },
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

- [ ] **Step 2: Replace `src/app/settings.tsx`**

```tsx
import React, { useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  Body, Button, Caption, Divider, NavHeader, Overline, Row, Screen, toastError,
} from '@/components/ui';
import { AmountPad } from '@/components/AmountPad';
import { useSettingsStore } from '@/store/useSettingsStore';
import { formatCents, parseMoneyInput } from '@/domain/money';
import type { ChipDenom } from '@/domain/types';
import { CHIP_SWATCHES, colors, radius, space, textStyles } from '@/theme';

type DenomDraft = { id: string | null; label: string; colorHex: string; valueText: string };

export default function SettingsScreen() {
  const router = useRouter();
  const settings = useSettingsStore((s) => s.settings);
  const denoms = useSettingsStore((s) => s.denoms);
  const setDefaultBuyin = useSettingsStore((s) => s.setDefaultBuyin);
  const addDenom = useSettingsStore((s) => s.addDenom);
  const updateDenom = useSettingsStore((s) => s.updateDenom);
  const removeDenom = useSettingsStore((s) => s.removeDenom);
  const reorderDenoms = useSettingsStore((s) => s.reorderDenoms);

  const [buyinPad, setBuyinPad] = useState(false);
  const [draft, setDraft] = useState<DenomDraft | null>(null);

  const safe = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      toastError(e);
    }
  };

  const saveDenom = () => {
    if (!draft) return;
    const valueCents = parseMoneyInput(draft.valueText);
    if (valueCents === null || valueCents <= 0) {
      toastError(new Error('Enter a chip value greater than zero'));
      return;
    }
    safe(() => {
      if (draft.id) updateDenom(draft.id, { label: draft.label.trim(), colorHex: draft.colorHex, valueCents });
      else addDenom({ label: draft.label.trim(), colorHex: draft.colorHex, valueCents });
      setDraft(null);
    });
  };

  const move = (d: ChipDenom, dir: -1 | 1) => {
    const ids = denoms.map((x) => x.id);
    const i = ids.indexOf(d.id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
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
      <NavHeader title="Settings" onBack={() => router.back()} />

      <Overline style={{ marginBottom: space.sm }}>Default buy-in</Overline>
      <Pressable
        accessibilityRole="button"
        onPress={() => setBuyinPad(true)}
        style={({ pressed }) => [s.panel, s.rowCard, pressed && { backgroundColor: colors.cardAlt }]}>
        <View style={{ flex: 1 }}>
          <Body>Amount added when you tap +</Body>
          <Caption tone="muted">Applies to new nights; each night keeps its own value.</Caption>
        </View>
        <Text style={s.value}>{formatCents(settings.defaultBuyinCents, settings.currencySymbol)}</Text>
      </Pressable>

      <Overline style={{ marginTop: space.xl, marginBottom: space.sm }}>Chip denominations</Overline>
      <Caption tone="muted" style={{ marginBottom: space.sm }}>
        Optional. With at least one denomination the cash-out pad offers "Use chips". Tap to edit,
        long-press to reorder or delete.
      </Caption>

      {denoms.length > 0 ? (
        <View style={s.panel}>
          {denoms.map((d, i) => (
            <View key={d.id}>
              {i > 0 ? <Divider /> : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={d.label}
                onPress={() =>
                  setDraft({ id: d.id, label: d.label, colorHex: d.colorHex, valueText: formatCents(d.valueCents, '') })
                }
                onLongPress={() => onLongPress(d)}
                style={({ pressed }) => [s.denomRow, pressed && { backgroundColor: colors.cardAlt }]}>
                <View style={[s.badge, { backgroundColor: d.colorHex }]}>
                  <View style={s.badgeRing} />
                </View>
                <Text style={s.denomLabel} numberOfLines={1}>
                  {d.label}
                </Text>
                <View style={{ flex: 1 }} />
                <Text style={s.value}>{formatCents(d.valueCents, settings.currencySymbol)}</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      <Button
        label="+ Add denomination"
        variant="secondary"
        size="md"
        onPress={() => setDraft({ id: null, label: '', colorHex: CHIP_SWATCHES[1], valueText: '' })}
        style={{ marginTop: space.md }}
      />

      <AmountPad
        visible={buyinPad}
        title="Default buy-in"
        initialCents={settings.defaultBuyinCents}
        onCancel={() => setBuyinPad(false)}
        onConfirm={(c) => {
          safe(() => setDefaultBuyin(c));
          setBuyinPad(false);
        }}
      />

      <Modal visible={draft !== null} transparent animationType="fade" onRequestClose={() => setDraft(null)}>
        <View style={s.scrim}>
          <View style={s.dialog}>
            <Overline style={{ marginBottom: space.md }}>{draft?.id ? 'Edit chip' : 'New chip'}</Overline>
            <TextInput
              value={draft?.label ?? ''}
              onChangeText={(t) => setDraft((d) => (d ? { ...d, label: t } : d))}
              placeholder="Label (e.g. Red)"
              placeholderTextColor={colors.textMuted}
              style={s.input}
              returnKeyType="done"
            />
            <Row style={[s.input, { marginTop: space.md, paddingVertical: 0 }]}>
              <Text style={s.symbol}>{settings.currencySymbol}</Text>
              <TextInput
                value={draft?.valueText ?? ''}
                onChangeText={(t) => setDraft((d) => (d ? { ...d, valueText: t } : d))}
                keyboardType="decimal-pad"
                placeholder="Value per chip"
                placeholderTextColor={colors.textMuted}
                style={s.valueInput}
                returnKeyType="done"
              />
            </Row>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: space.md }}>
              {CHIP_SWATCHES.map((c) => (
                <Pressable
                  key={c}
                  accessibilityRole="button"
                  accessibilityLabel={`Colour ${c}`}
                  onPress={() => setDraft((d) => (d ? { ...d, colorHex: c } : d))}
                  style={[
                    s.swatch,
                    { backgroundColor: c, borderColor: draft?.colorHex === c ? colors.accent : colors.border, borderWidth: draft?.colorHex === c ? 3 : 1 },
                  ]}
                />
              ))}
            </ScrollView>
            <Row style={{ marginTop: space.lg }}>
              <Button label="Cancel" variant="secondary" onPress={() => setDraft(null)} style={{ flex: 1, marginRight: space.sm }} />
              <Button
                label="Save"
                onPress={saveDenom}
                disabled={!draft?.label.trim() || !draft?.valueText.trim()}
                style={{ flex: 1 }}
              />
            </Row>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const s = StyleSheet.create({
  panel: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  rowCard: { flexDirection: 'row', alignItems: 'center', padding: space.lg },
  denomRow: { flexDirection: 'row', alignItems: 'center', minHeight: 56, paddingHorizontal: space.md },
  denomLabel: { ...textStyles.labelMd, fontSize: 15, color: colors.text, marginLeft: space.md },
  value: { ...textStyles.numericMd, color: colors.text },
  badge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeRing: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: colors.bg, opacity: 0.4 },
  scrim: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: space.xl },
  dialog: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    padding: space.lg,
  },
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
  symbol: { ...textStyles.bodyLg, color: colors.textDim, marginRight: space.xs },
  valueInput: { ...textStyles.bodyLg, color: colors.text, flex: 1, paddingVertical: space.md },
  swatch: { width: 40, height: 40, borderRadius: 20, marginRight: space.md },
});
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm test`
Expected: all suites pass.

Manual (iOS simulator):
1. Home → 👤 → "Players". "+ New" opens the dialog; adding "ann" when "Ann" exists shows the
   "Name already exists" error alert and keeps the list unchanged.
2. Tap a player → rename dialog prefilled; Save updates the row and every past night.
3. Long-press → Archive → the row moves under the "ARCHIVED" panel and disappears from the
   new-night checklist.
4. Long-press a player who has played → Delete → error alert ("Player has sessions"); archiving works.
5. Home → ⚙︎ → "Settings". Tap the default buy-in row → pad → 25 → the row reads $25 and a brand new
   night defaults to $25 (existing nights keep theirs).
6. "+ Add denomination" → label "White", value 1, pick the white swatch → Save. Add Red $5 and
   Blue $10. Rows show the chip badge, label, and value.
7. Long-press a chip → Move up / Move down reorders; Delete removes it.
8. Back in a night: cash-out pad now shows "Use chips" → the Task 14 counter opens with these three
   chips and applies its tally.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(app): restyled players roster and settings screens

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

1. **Home, empty.** Only the "Ready to deal?" card — no stat tiles, no past-nights list. The CHIPS
   wordmark and its orange chip glyph sit top-left, the Players and Settings icon buttons top-right.
   Fonts are Manrope (headlines) and Hanken Grotesk (body), not the system face.
2. **New night, step 1.** "Start New Night" → "STEP 1 OF 2 / New Night". Title "Dave's place",
   date today, buy-in preset $20 (emerald). Tap "Custom" → pad → 20 → still $20. "Select Players →".
3. **New night, step 2.** Add "Ann", "Bob", "Cat" through the add-new field — each appears checked.
   Counter reads "3 of 3 players selected". "CLEAR ALL" empties and disables the CTA; re-select all
   three. "Confirm & Start Game →" opens the night. Press back once → home.
4. **Buy-ins view.** Header shows the orange "ACTIVE NIGHT" dot, "Dave's place", and the green
   Pot Pool badge. Tap Ann's `+` twice ($20 $20). Long-press Bob's `+` → 35. Tap Cat's `+` once.
   Pot Pool reads $75. Tap one of Ann's pills → change to $25 → reopen → "Remove" → back to one pill,
   then re-add with `+`.
5. **Edit night.** Tap the header title → rename to "Friday Night Lights", change the date, Save.
   Header updates.
6. **Cash-out view.** "Go to Cash-Out →". Status pill reads "3 still to cash out" in amber and
   "Settle up →" is disabled. Enter Ann 10, Bob 80, Cat 5 → the amber "Off by $20 — cash missing.
   Recount?" banner appears. Fix Cat to 25 → pill turns green "Balanced Pool $115 / $115" and
   "Settle up →" enables.
7. **Settle.** Ann −$35, Bob +$45, Cat −$10 → two transfers (Ann pays Bob $35, Cat pays Bob $10),
   "2 transactions" badge, green ✓ disc, RESULTS sorted descending, DETAILS expands to the table.
8. **Share.** The live preview shows the whole message card. "Share image" → share sheet → Save
   Image → open Photos: 1080 px wide, dark, green CHIPS overline, bulleted transfers, footer pill
   "Pool balanced: $115". "Copy to clipboard" → paste into Notes → matching plain text.
9. **Home again.** The night row shows the title, "date · 3 players" and a green $115 Pot Pool;
   the stat tiles read 1 night / $115 volume. Long-press → Share opens the settle screen and fires
   the share sheet automatically; Cancel it.
10. **Players.** 👤 → rename Cat → Catherine (the night updates). Archive Bob → he vanishes from the
    step-2 checklist. Try to delete Ann → "Player has sessions" error.
11. **Settings.** ⚙︎ → default buy-in 25 → a brand-new night presets to $25 while the old night
    still adds $20. Add chips White $1, Red $5, Blue $10 → long-press → Move down / Delete work.
12. **Chip counter.** Back in the night's cash-out view, tap a row → "Use chips" → count 5 Red and
    2 Blue → tally $45 → "Apply to …'s cash-out" writes $45. Reopen: counts are back to zero.
13. **Editability.** Re-open a settled night, change a cash-out and a buy-in — nothing is locked and
    the settlement recomputes.
14. **Kill the app and relaunch** → every night, player, denomination and setting is still there.
15. **Long-name / 10-player stress.** Create a night with 10 players including "Bartholomew
    Wintersmith" → buy-in rows, cash-out rows, transfer rows and the share preview all stay on one
    line each without clipping at 390 pt.

- [ ] **Step 3: Android check**

If an Android emulator or device with Expo Go is available: `npx expo start --android`, repeat
steps 1–8, and additionally confirm: the date field opens the platform date dialog (not the iOS
sheet), the bottom sheets sit above the navigation bar, and the fonts loaded (headlines are
Manrope). Note any layout issue and fix inline (commit as `fix(android): …`). If no Android
environment is present, record that in the README under "Status" and move on.

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
Design system: `docs/design/stitch/felt_ledger/DESIGN.md` (screens: `docs/design/stitch/`)

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

- Removing a player from a night is a long-press action sheet (spec §6.3, and Global Constraints);
  no gesture library is used anywhere.
- Spec §7 fallback "save to media library" is replaced by an error toast when sharing is
  unavailable; on iOS/Android the share sheet itself offers "Save Image". No `expo-media-library`
  permission prompt is needed. "Copy to clipboard" is the offline fallback.
- Home stat tiles ("all-time nights", "total volume") are cheap aggregates over
  `SessionSummary.totalBuyinCents` — not the leaderboard or charts that the spec excludes.
- Deliberate deviations from the Stitch mockups: no "(Host)" tag (the data model has no host), the
  WhatsApp button is the generic native share sheet labelled "Share image", and the session
  segmented control is full width beneath the header instead of inline in it, so long night titles
  and 360 pt Android widths still fit.
- Chip counts are never persisted; the counter writes one `setCashout` call (spec §4, chip_denoms).
- Types referenced across tasks: `Net`, `Transfer`, `SettlementResult` (Task 3); `PlayerNetRow`,
  `SessionSummaryMath` (Task 4); `Db`, `SqlParam` (Task 5); `CreateSessionInput` and
  `SessionSummary.totalBuyinCents` (Task 8); stores (Task 9); theme tokens, `ui.tsx`, `MoneyText`
  (Task 10); `NightRow` (11); `AmountPad`, `PlayerChecklist`, `useNewNightDraft` (12); `BuyinRow`,
  `CashoutRow` (13); `ChipSheet` (14); `TransferRow` (15); `ShareCard`, `captureAndShare`,
  `buildShareText`, `copyToClipboard` (16).
- Every store action called by a screen exists in Task 9's interface list; every component consumed
  by a task is produced by an earlier task with the same props.
