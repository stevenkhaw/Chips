# Poker Balance Tracker ("Chips") — Design Spec

Date: 2026-09-16
Status: approved for planning

## 1. Purpose

A phone app for one bookkeeper to record a home poker night: who played, how much each
player bought in for (multiple rebuys), how much each cashed out, and who owes whom
afterward. The bookkeeper shares a clean screenshot of the settlement with the group.

Money model: nobody pays cash up front. Each player's net for the night is
`cash_out - sum(buy_ins)`. Losers pay winners afterward. The app computes the fewest
transfers that settle everyone.

## 2. Scope

### In scope (v1)
- iOS and Android from one codebase.
- On-device data only. No accounts, no server.
- Persistent player roster.
- Sessions ("nights"): date, optional title, players, per-player buy-ins and cash-out.
- Optional chip-count calculator at cash-out using configurable chip denominations.
- Settlement: per-player nets, minimal transfer list, discrepancy warning.
- Shareable image card via native share sheet.
- History list of past sessions; sessions remain editable.

### Explicitly out of scope (v1)
- Multi-device sync, auth, cloud backup. Data model is designed so these can be added
  later behind the repository layer without changing screens.
- Charts, trends, all-time leaderboard.
- Running cross-night debt ledger.
- App Store / Play Store publishing assets. Distribution method decided later; the build
  setup (Expo + EAS) supports dev builds, TestFlight, APK, and store submission equally.

## 3. Tech stack

- Expo SDK (latest stable at implementation time), React Native, TypeScript (strict).
- Expo Router for file-based navigation.
- `expo-sqlite` for storage. Zustand store hydrated from SQLite; store is the single
  source of truth for screens, repo writes through to SQLite.
- `react-native-view-shot` + `expo-sharing` for the share card.
- Jest (`jest-expo`) for unit tests.
- Money is always integer cents. Floats never touch money.

### Layering

```
app/          Expo Router screens. Thin; reads store, calls store actions.
components/   Presentational UI, including ShareCard.
store/        Zustand store + actions. Calls repo, runs domain functions.
repo/         Typed CRUD over SQLite tables. Only layer that contains SQL.
db/           Schema, migrations, connection.
domain/       Pure functions: nets, settlement, chip conversion, formatting.
              No React, no IO. Fully unit-tested.
```

Rule: `domain/` imports nothing from other layers. `repo/` is the only sync-swap point.

## 4. Data model

Every table has: `id TEXT PRIMARY KEY` (UUID v4), `created_at INTEGER` (ms epoch),
`updated_at INTEGER`, `deleted_at INTEGER NULL`. Deletes are soft (set `deleted_at`).
All reads filter `deleted_at IS NULL`. This keeps the model sync-friendly later.

### players
| column | type | notes |
|---|---|---|
| name | TEXT NOT NULL | display name, unique among non-deleted (case-insensitive) |
| color_seed | INTEGER | deterministic avatar color |
| archived | INTEGER (0/1) | hidden from picker but kept for history |

### sessions
| column | type | notes |
|---|---|---|
| date | TEXT NOT NULL | ISO `YYYY-MM-DD`, local date |
| title | TEXT NULL | e.g. "Dave's place" |
| default_buyin_cents | INTEGER NOT NULL | copied from settings at creation, editable per session |
| notes | TEXT NULL | |

### session_players
| column | type | notes |
|---|---|---|
| session_id | TEXT NOT NULL FK | |
| player_id | TEXT NOT NULL FK | |
| cashout_cents | INTEGER NULL | NULL = not yet cashed out |
| sort_order | INTEGER | seat/display order |

Unique on (`session_id`, `player_id`) among non-deleted rows.

### buyins
| column | type | notes |
|---|---|---|
| session_player_id | TEXT NOT NULL FK | |
| amount_cents | INTEGER NOT NULL | > 0 |
| at | INTEGER NOT NULL | ms epoch when logged |

### chip_denoms
| column | type | notes |
|---|---|---|
| label | TEXT NOT NULL | e.g. "Red" |
| color_hex | TEXT NOT NULL | |
| value_cents | INTEGER NOT NULL | > 0 |
| sort_order | INTEGER | |

Global config. Chip counts are NOT persisted; the chip sheet is a calculator that writes
`session_players.cashout_cents`.

### settings (single row, id = 'default')
| column | type | notes |
|---|---|---|
| default_buyin_cents | INTEGER NOT NULL | initial 2000 ($20) |
| currency_symbol | TEXT NOT NULL | initial "$" |

Settings row seeded on first launch. `chip_denoms` starts empty; the chip sheet and
"Use chips" button are hidden until the user adds at least one denomination in Settings.

## 5. Domain logic (`domain/`)

### 5.1 Nets
```
net(sp) = cashout_cents - sum(buyins.amount_cents)   // undefined if cashout is NULL
```
Players with NULL cash-out are excluded from settlement and reported as `pending`.

### 5.2 Settlement — `settle(nets: {playerId, netCents}[]) => SettlementResult`

```
SettlementResult = {
  transfers: { from: playerId, to: playerId, amountCents }[],
  discrepancyCents: number,   // sum of all nets; 0 when books balance
}
```

Goal: fewest transfers. Two phases:

**Phase 1 — maximum zero-sum partition (exact minimization, n ≤ 12).**
Transfers needed = (number of non-zero players) − (number of disjoint zero-sum blocks
they are split into), so minimising transfers means maximising blocks. Compute exactly
with a subset DP over bitmasks: `dp[mask] = max_i dp[mask ^ bit_i] + (sum[mask] == 0 ? 1 : 0)`.
Backtrack from the full mask to recover the blocks; each block of size k settles with the
greedy method in k−1 transfers. O(n·2ⁿ) ≈ 49k steps at n = 12, trivially fast. For n > 12
skip phase 1. (Note: "repeatedly peel the smallest zero-sum subset" is NOT exact and must
not be used — a 9-player counterexample yields 7 transfers where 6 is optimal.)

**Phase 2 — greedy on remainder.**
Sort debtors (net < 0) by |net| desc and creditors (net > 0) by net desc. Two-pointer:
largest debtor pays largest creditor `min(|debt|, credit)`; advance whichever reaches
zero. Produces ≤ m−1 transfers for m remaining players.

**Discrepancy.** If `sum(nets) != 0`, settlement still runs on the entered nets, but
`discrepancyCents` is non-zero and the UI shows a warning. The greedy phase will leave a
residual on one side; that residual is not emitted as a transfer. Phase 1 only matches
subsets that sum to exactly zero, so discrepancy never hides inside a subset.

Zero-net players are omitted from transfers.

Determinism: ties broken by player sort_order so the same inputs always give the same
transfer list (stable screenshots).

### 5.3 Chip conversion
`chipsToCents(counts: {denomId, count}[], denoms) => cents`. Pure sum.

### 5.4 Formatting
`formatCents(cents, symbol)` → `"$20"`, `"$12.50"`, `"-$7.25"`. Drops `.00`.

## 6. Screens (Expo Router)

```
app/
  _layout.tsx            root stack + store hydration gate
  index.tsx              Sessions list (home)
  session/[id].tsx       Session editor
  session/[id]/settle.tsx Settlement + share
  players.tsx            Roster
  settings.tsx           Default buy-in, chip denominations
```

### 6.1 Sessions list (home)
- Cards sorted by date desc: date, title, player count, top winner name + amount.
- FAB "New night" → New Night sheet (modal).
- Long-press card → context: Share, Delete (confirm).
- Empty state: one-line prompt + FAB.

### 6.2 New Night sheet
- Date picker (default today).
- Title (optional).
- Player picker: roster as toggle chips, pre-selected = players from most recent
  session. "+ New player" inline text field adds to roster and selects.
- Default buy-in (prefilled from settings).
- "Start" creates session + session_players, navigates to Session editor.

### 6.3 Session editor (main workhorse)
- Header: date + title, edit via tap. "Settle up" button (primary) in header/footer.
- One row per player:
  - Avatar + name.
  - Buy-in pills: each buy-in as a pill `$20`; tap pill → edit/remove. Trailing `+` pill:
    tap = add default buy-in immediately; long-press = custom amount pad.
  - Cash-out field: tap → numeric pad sheet with "Use chips" button (visible only if
    chip denoms configured). Empty shows "—".
  - Live net, colored green/red/neutral, right-aligned.
- Footer: total buy-ins, total cash-out, and if unequal an amber banner
  "Off by $X — recount?" Pending players: "2 not cashed out".
- "Add player" row at bottom → roster picker.
- Swipe row → remove player from session (confirm if they have buy-ins).

### 6.4 Chip sheet (modal from cash-out)
- One row per denomination: color swatch, label, value, stepper + numeric field for count.
- Running total at bottom. "Use $X" writes cashout_cents and closes.

### 6.5 Settlement screen
- Discrepancy banner if any (amber). Pending banner if any.
- "Who pays who": transfer list `Alice → Bob  $35`.
- "Results": players sorted by net desc with ± amounts.
- "Details" (collapsed by default): table buy-ins / cash-out / net.
- "Share" button → render ShareCard offscreen → PNG → `expo-sharing`.

### 6.6 Players
- List with archive toggle, rename inline. Delete only if never used in a session;
  otherwise archive.

### 6.7 Settings
- Default buy-in.
- Chip denominations: add/edit/remove/reorder; label, color, value.

## 7. Share card (`components/ShareCard.tsx`)
- Rendered at fixed 1080px width (scaled for display), dark background, high contrast.
- Sections: header (title or "Poker night", date), "Who pays who" list, per-player nets
  with ± coloring, detail table (buy-ins / cash-out / net), discrepancy line if non-zero,
  small footer "Chips".
- Captured with `react-native-view-shot` (`captureRef`, format png, quality 1) then
  `Sharing.shareAsync(uri)`. If sharing unavailable, fall back to saving to media library
  with a toast.

## 8. State & persistence

- On launch: open DB, run migrations (versioned via `PRAGMA user_version`), seed settings
  if missing, load players + sessions summary into store. Session detail loaded on open.
- Every store mutation: write to SQLite via repo first, then update in-memory state.
  Failures surface as a toast; state not updated on failure.
- IDs generated client-side (`expo-crypto` randomUUID).

## 9. Error handling

- Input validation: amounts must be ≥ 0 integers in cents; buy-in > 0. Invalid input is
  rejected inline, never stored.
- DB errors: caught at repo boundary, logged, surfaced as toast. App never crashes on a
  failed write.
- Share failures: toast with reason.
- Duplicate player names: blocked at creation with inline message.

## 10. Testing

- **Unit (Jest):** `domain/settle` — empty, single player, all zero, two players, greedy
  case, case where greedy is suboptimal but phase 1 finds zero-sum subset, discrepancy
  positive and negative, pending players excluded, n = 13 greedy fallback, determinism.
  `domain/chips`, `domain/format`.
- **Repo tests:** run against a fresh SQLite DB per test (expo-sqlite on device is not
  available under Jest; use a thin DB interface with an in-memory adapter or
  `better-sqlite3` for tests).
- **Manual:** iOS Simulator via Expo dev build; Android via Expo Go on device or
  emulator. Checklist: create night, rebuys, chip cash-out, settle, share image opens
  share sheet, reopen from history, edit and re-settle.

## 11. Future (not v1, model already supports)
- Sync: add `device_id` and a change log table; repo pushes/pulls. UUID + soft delete +
  `updated_at` already in place.
- Leaderboard: aggregate `net` per player across sessions.
- Cross-night ledger: derive from transfers.
