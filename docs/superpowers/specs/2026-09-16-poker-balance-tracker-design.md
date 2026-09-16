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
  _layout.tsx                 root stack; font + DB + store hydration gate
  index.tsx                   Home
  new-session/index.tsx       New night, step 1 of 2
  new-session/players.tsx     New night, step 2 of 2
  session/[id]/index.tsx      Open night: Buy-ins | Cash-out | Settle
  session/[id]/settle.tsx     Settlements + share
  players.tsx                 Roster
  settings.tsx                Default buy-in, chip denominations
```

### 6.0 Visual design

Screens follow the Stitch export in `docs/design/stitch/` (seven screens, each with `screen.png`
and `code.html`). The design system is **Felt & Ledger**
(`docs/design/stitch/felt_ledger/DESIGN.md`); `docs/design/stitch/obsidian_felt/DESIGN.md` is a
secondary reference. The per-screen hex values in the exported HTML drift slightly, so they are
normalized to one token set, held in `src/theme.ts` as the single source of truth (colors, spacing,
radii, fonts, text styles, `avatarColor`, chip swatches). Components reference tokens only — no raw
hex outside `theme.ts`.

- **Neutrals:** canvas `#0D0D0E`, card `#18191B`, elevated/nested `#222427`, border `#2A2C30`,
  sheet hairline `#374151`, text `#FFFFFF`, secondary `#9CA3AF`, muted `#4B5563`.
- **Accents:** Casino Orange `#FF7A00` (buy-in `+`, mid-game / cash-out CTAs, the "active night"
  label), Felt Emerald `#10B981` (start night, settle, share, positive money, balanced status),
  Chip Blue `#3B82F6` (informational), loss `#F43F5E`, warning `#F59E0B`. Chip token colours come
  from the Felt & Ledger "Chip Token Semantics" list.
- **Type:** Manrope for headlines and numbers, Hanken Grotesk for body, loaded via
  `@expo-google-fonts/manrope`, `@expo-google-fonts/hanken-grotesk` and `expo-font` in the root
  layout before the first screen renders; if loading fails the app falls back to system faces. All
  money uses `fontVariant: ['tabular-nums']`.
- **Elevation:** tonal tiering and 1px hairlines instead of blurred lifts. Bottom sheets and the
  pinned footer carry `0 -12px 32px rgba(0,0,0,0.6)` plus a `#374151` top hairline. Selected and
  active states use an inner stroke or a `rgba(255,122,0,0.15)` / `rgba(16,185,129,0.15)` fill,
  never a shadow.
- **Shapes:** 4–8px on inner elements, 12–16px on cards, full pill on buttons, avatars and steppers.
  Minimum tap target 44pt; primary bottom CTAs are 52pt tall.

The mockups are followed except where they contradict this spec: there is no host concept (no
"(Host)" tag), no WhatsApp-specific integration (the generic native share sheet, button labelled
"Share image"), and no leaderboards, charts, login or sync.

### 6.1 Home

- Header: orange chip glyph + "CHIPS" wordmark; right side two circular icon buttons → Players,
  Settings.
- Two stat tiles: "ALL-TIME NIGHTS" (number of sessions) and "TOTAL VOLUME" (sum of every session's
  total buy-ins). Both are cheap aggregates over the session summaries.
- "Ready to deal?" card: heading, one line of copy, and a full-width green "Start New Night" button.
  This replaces the FAB.
- "PAST NIGHTS": one rounded panel, hairline-divided rows, newest first. Each row: title (or the
  formatted date), a "date · N players" caption, and the night's pot pool in green with a "Pot Pool"
  sub-label.
- Long-press a row → action sheet: Share / Delete (confirm) / Cancel.
- Empty state: the "Ready to deal?" card only — no stat tiles, no list.

### 6.2 New night (two steps)

**Step 1 of 2 — setup.** Centered header "STEP 1 OF 2 / New Night" with back and close.
Fields: night title (optional text), game date (tap → dark inline calendar on iOS, platform dialog
on Android, default today), and default buy-in as four preset pills — $10 / $20 / $50 / Custom,
where Custom opens the amount pad and then displays the chosen amount. Bottom CTA
"Select Players →" (green).

**Step 2 of 2 — players.** Centered header "STEP 2 OF 2 / Select Players". An "Add new player
name…" field with a `+` button adds to the roster and selects immediately. Below it
"N of M players selected" with an orange "CLEAR ALL". Then the roster as a checklist: avatar, name,
checkbox; selected rows carry a green tinted fill and border. Players from the most recent night are
pre-selected. Bottom CTA "Confirm & Start Game →" (orange), disabled until at least one player is
selected; it creates the session and opens it, leaving both setup steps behind so back returns home.

Step-1 values reach step 2 through a small UI-only draft store, never through string params.

### 6.3 Open night (main workhorse)

Header: back, an orange dot + "ACTIVE NIGHT" overline, the night title (tap → edit title and date),
and a green "Pot Pool $X" badge. Beneath it a full-width segmented control —
**Buy-ins | Cash-out | Settle** — which is the navigation spine of the night. The first two switch
views in place; "Settle" pushes the settlement screen.

**Buy-ins view** (the Stitch live table):
- Info banner: "Tap + to log the default rebuy ($20)".
- One row per player: avatar, name, an "In:" run of buy-in pills (`$20 $20 $35`), and a 44pt orange
  `+` button. Tap `+` = add the default buy-in instantly; long-press `+` = custom amount pad. Tap a
  pill = edit or remove that buy-in.
- Long-press a row → "Remove from night" (confirms when the player has buy-ins).
- "+ Add player" opens a sheet listing roster members not yet in the night.
- Bottom CTA: "Go to Cash-Out →" (orange), which switches to the cash-out view.

**Cash-out view:**
- A status pill above the list: green "Balanced Pool  $115 / $115" when cash-outs match buy-ins,
  amber "Off by $X" or "N still to cash out" otherwise.
- One row per player: avatar, name, "In: $60" caption, and on the right the cash-out amount (green)
  or a dashed "Tap to enter", with the live net beneath it.
- Tap a row → amount pad with "Use chips" (only when chip denominations exist).
- An amber "Off by $X — cash missing. Recount?" banner once everyone has cashed out but the totals
  disagree.
- Bottom CTA: "Settle up →" (green), disabled while any player has no cash-out.

Nothing locks: buy-ins and cash-outs stay editable at any point, including after settling.

### 6.4 Amount pad (bottom sheet, reused)

Uppercase title, large currency symbol and tabular numeric input in a level-2 well, an optional
secondary action ("Use chips"), an optional "Remove", then Cancel / Save.

### 6.5 Chip counter (full sheet)

Header "NAME's chips" with a "CHIP BY COLOUR COUNTER" caption on the left and a live "TALLY TOTAL"
in emerald on the right. One row per denomination: chip badge (colour with an inner rim), label,
`Value: $5.00` in mono, then a `−  count  +` stepper with a neutral `−` and an orange `+`. Bottom
CTA "Apply to NAME's cash-out" (green) writes `cashout_cents` and closes. Counts are a calculator
only and are never persisted.

### 6.6 Settlements

- Header: back, the night title as an overline, "Settlements", and a status disc (green ✓ when the
  books balance, amber ! otherwise).
- "Total cash handled" card: orange `$` tile, label, "Balanced pot pool" or "Off by $X", and the pot
  pool in emerald.
- Banners: pending players (info) and discrepancy (amber).
- "FEWEST TRANSFERS REQUIRED" with an "N transactions" badge, then one card per transfer:
  `D Dave  pays →  B Bob   $40`, amount right-aligned in emerald.
- "RESULTS": players sorted by net with ± colouring.
- "DETAILS" (collapsed by default): table Player | In | Out | Net.
- "MESSAGE CARD · Live preview": the share card itself, rendered at 1080 px and scaled down inside a
  fixed frame.
- Bottom actions: "Share image" (green) and "Copy to clipboard" (secondary).

### 6.7 Players

List with avatar + name; archived players in a separate panel below. Tap = rename (dialog with a
text field). Long-press → Rename / Archive (or Unarchive) / Delete. Delete only succeeds if the
player never played a night; otherwise archive.

### 6.8 Settings

- "Default buy-in" row → amount pad.
- "Chip denominations": rows of chip badge + label + value, "+ Add denomination", an edit dialog with
  label, value and a ten-swatch colour picker, and long-press → move up / move down / delete.

## 7. Share card (`components/ShareCard.tsx`)

- Rendered at a fixed 1080 px width, any height, on the canvas colour with an inset card — plain
  boxes, text and circles only, no photos or illustration.
- Styled as the Stitch "message card": green "CHIPS" overline, the night title, a hairline rule,
  then the transfers as a bulleted monospace-feel list (`• Dave pays Bob` … `$40` right-aligned in
  emerald, the biggest text after the title so it survives a chat thumbnail), a "RESULTS" list with
  ± coloured nets, a "DETAILS" table (Player / In / Out / Net), and a footer with the date plus a
  pill reading "Pool balanced: $230" in green, or "Off by $X" in amber when the books disagree.
- The same component renders on-screen as a scaled-down live preview, so what is shared is exactly
  what was previewed.
- Captured with `react-native-view-shot` (`captureRef`, format png, quality 1) then
  `Sharing.shareAsync(uri)` through the generic native share sheet. If sharing is unavailable the
  failure surfaces as a toast; "Copy to clipboard" (`expo-clipboard`) offers a plain-text version of
  the same transfers as a fallback.

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
