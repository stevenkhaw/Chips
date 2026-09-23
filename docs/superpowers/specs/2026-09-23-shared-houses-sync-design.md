# Shared houses: friends install the app and see the same ledger

Date: 2026-09-23. Approved in chat, section by section.

## Goal

Friends on iPhone and Android install Chips and see the same nights, balances,
History graphs and player pages that the host sees. The host (house owner) is
the only writer; everyone else reads.

## Decisions

| Topic | Decision |
|---|---|
| Platforms | iOS and Android from the one Expo codebase |
| Grouping | A **house** holds players and nights. A user can own some houses and read others. |
| Permissions | One writer per house (the owner). Members are read-only. Enforced on the server. |
| Identity | Invisible anonymous Supabase account, created lazily on first share or join. Owner can link Sign in with Apple / Google so ownership survives a new phone. |
| Joining | Code + password, https invite link, `chips://` invite link, and a "Copy invite text" button. |
| Freshness | Readers pull on open, on house switch and on pull-to-refresh. Realtime is a later add-on. |
| Offline | Owner keeps writing to local SQLite; changes push when online. Readers read from a local cache. |
| Backend | Supabase (Postgres, auth, row-level security). Firebase and a hand-rolled Cloudflare D1 API were rejected: document model fits the relational ledger poorly / too much hand-rolled auth. |

Out of scope for v1: realtime, ownership transfer, co-owners, CAPTCHA on
anonymous sign-in (add only if abuse appears), linking a reader to "their"
player.

## 1. Data model

### 1.1 Server (Supabase Postgres)

- **`houses`**: `id uuid`, `name`, `owner_id` (auth user), `join_code` (8
  chars from an alphabet without look-alikes such as 0/O/1/I, unique),
  `currency_symbol`, `created_at`, `updated_at`, `deleted_at`.
- **`house_secrets`**: `house_id`, `password_hash` (bcrypt via `pgcrypto`),
  `invite_secret` (32 random bytes, url-safe encoded). A separate table so
  members can read `houses` but never the secrets. Owner-only.
- **`house_members`**: `house_id`, `user_id`, `role` (`owner` | `reader`),
  `joined_at`. Primary key `(house_id, user_id)`.
- **`join_attempts`**: `user_id`, `at`, `ok`. Feeds the lockout in §2.3.
- **Ledger tables** `players`, `sessions`, `session_players`, `buyins`,
  `payments`: same columns as the local tables, plus
  - `house_id` on every row, so each permission check is one lookup;
  - `server_updated_at`, set to `now()` by a trigger on insert and update. It is
    the pull cursor; phone clocks are never trusted for it.

Row-level security:

- select: caller is in `house_members` for the row's `house_id`;
- insert / update: caller is the house `owner_id`;
- delete: denied. Deletes are soft (`deleted_at`), as locally today;
- `house_secrets`: owner only, for every operation.

### 1.2 Stays on the device

`chip_denoms` (chip presets used to count cash-outs) and the default buy-in
setting. Readers never count chips. `currency_symbol` moves from settings onto
the house so everyone sees the same symbol.

### 1.3 Local SQLite, migration v3

- New `houses` table: `id`, `name`, `role`, `join_code`, `currency_symbol`,
  `published` (0/1), `pull_cursor`, plus the usual `created_at` / `updated_at`
  / `deleted_at`.
- `house_id TEXT` added to the five ledger tables, with an index on each.
- `dirty INTEGER NOT NULL DEFAULT 0` added to the five ledger tables and
  `houses` (the owner's outbox).
- `current_house_id` added to `settings`.
- Data move, inside the version's transaction: insert one house "My House"
  (role owner, `published = 0`, currency copied from settings), stamp every
  existing ledger row with its id, set `current_house_id` to it.

Houses can exist unpublished. Nothing leaves the phone until the owner taps
**Share house**, so solo use needs no network and no account, as today.

## 2. Accounts and joining

### 2.1 Accounts

- `@supabase/supabase-js`, session persisted on the device (storage adapter per
  the Expo SDK 57 docs at implementation time).
- Anonymous sign-in happens lazily, on the first **Share house** or **Join
  house**.
- Settings → **Account → Back up houses** links the anonymous user to Sign in
  with Apple (iOS, via `expo-apple-authentication`) or Google. The user id does
  not change, so no data moves. Verify the native id-token linking call in the
  current supabase-js before building.
- A new phone or reinstall: sign in → fetch `house_members` for the user → pull
  every house → owned houses are writable again.
- After the first share, nudge once: "Protect your house so you don't lose
  owner access."

### 2.2 Publishing a house

**Share house** (owner, unpublished) asks for a password, then: sign in if
needed → RPC `create_house(id, name, currency, password)` creates `houses`,
`house_secrets`, the owner's `house_members` row, and returns `join_code` and
`invite_secret` → mark local house `published = 1` → push every row. The
plaintext password is kept in `expo-secure-store` on the owner's phone so the
invite text can include it.

### 2.3 Join by code and password

RPC `join_house(code, password)`, `SECURITY DEFINER`:

1. If the caller has 5 failed attempts in the last 15 minutes, raise
   `locked` with the minutes remaining.
2. Look up the house by code; bcrypt-compare the password.
3. On failure, log the attempt and raise one error, `invalid`, for both a wrong
   code and a wrong password.
4. On success, insert a `reader` membership (no-op if already a member) and
   return the house row.

### 2.4 Join by link

Two link forms, both carrying house id and invite secret:

- `https://<GitHub Pages site>/join#h=<house_id>&s=<invite_secret>`. The secret
  sits in the fragment, which browsers never send to a server. Add
  `docs/.well-known/apple-app-site-association` and
  `docs/.well-known/assetlinks.json` so the link opens the app directly
  (universal links / Android app links; `docs/.nojekyll` already exists, which
  Pages needs to serve dot-folders). `docs/join/index.html` is the fallback
  when the app is missing: TestFlight and Android install buttons, plus
  instructions to tap the link again after installing.
- `chips://join?h=<house_id>&s=<invite_secret>`. The `chips` scheme is already
  set in `app.json`. Opens the app when installed; some chat apps do not make
  custom schemes tappable, so it is the backup.

Both land on `/houses/join` prefilled. The user confirms with one tap, so a
stray link never adds a house silently. RPC `join_house_by_link(house_id,
secret)` checks the secret and adds a reader membership.

### 2.5 Invite text

**Copy invite text** and **Share** (native share sheet) produce:

```
Join my Chips house "Tuesday Crew"
Tap: https://…/join#h=…&s=…
Or: chips://join?h=…&s=…
Or in the app → Join house:
  Code: K7QX-M2PA
  Password: <password>
```

The password line appears only when this phone has the password in secure
store. After a reinstall the owner resets the password to get it back.

The invite text is the house key: anyone holding it can join as a reader. The
House settings screen says so next to the button.

### 2.6 Owner and reader controls

Owner: show code, copy / share invite, reset password, reset link (both rotate
secrets; old links and passwords stop working, existing members stay), member
list with remove, rename, delete (soft; readers see "House closed").

Reader: **Leave house** removes the membership and the local copy.

## 3. Sync

### 3.1 Owner push

- Every repo write to a published house sets `dirty = 1`. Writes go through
  `repo/`, so this is one place.
- Push triggers: 2 s after the last write (debounced), app foreground, network
  regained.
- Per table, in FK order (`houses` → `players` → `sessions` →
  `session_players` → `buyins` → `payments`): read dirty rows of published
  houses, upsert them, then clear `dirty` only on rows whose `updated_at` still
  equals the pushed value, so an edit made during the push is not lost.
- On failure rows stay dirty and the next trigger retries. The UI never waits
  on a push.

### 3.2 Pull

- Triggers: app open, house switch, pull-to-refresh, and sign-in on a new
  phone.
- First read the caller's `house_members` row and the `houses` row. No
  membership → "removed" state (§7); `deleted_at` set → "House closed".
- Per table: `house_id = X and server_updated_at > cursor order by
  server_updated_at limit 500`, paging until a short page. Upsert rows into
  SQLite, including soft-deleted ones (existing `deleted_at IS NULL` filters
  hide them). Save the cursor after each table.
- Pull is idempotent: re-running with an old cursor is harmless.

### 3.3 Conflicts

One writer per house means no merging. Readers never attempt writes, and RLS
rejects them if one slips through. If the owner edits on two phones at once,
the last push wins. Accepted.

### 3.4 Status

House header shows one line: "Synced · 2m ago", "Offline · 3 changes waiting",
"Sync failed · tap to retry" for owners; "Updated 5m ago" for readers.

### 3.5 Realtime later

Realtime only needs to call the existing pull when a change event arrives. No
redesign.

## 4. UI

- **House switcher.** The Home and History headers show the house name as a
  tappable title ("Tuesday Crew ▾"), a role badge (`Owner` / `Viewing`) and the
  sync status line. Tapping opens a sheet listing houses (owned first) with role
  and last update, then **New house** and **Join house**.
- All screens (nights, players, History, player pages, settle) scope to the
  current house.
- **`/houses/new`**: name and currency. Creates a local, unpublished house.
- **`/houses/join`**: code and password fields, also the landing screen for
  both link forms (prefilled, one-tap confirm).
- **`/houses/[id]`** (House settings): unpublished owner sees **Share house**;
  published owner sees the controls in §2.6 and the invite actions in §2.5;
  reader sees house info and **Leave house**.
- **Reader mode.** One hook, `useCanEdit()`, derived from the current house
  role. Readers do not see Start New Night, edit or delete actions, editing
  long-press menus, player add / edit, or payment logging. They keep viewing
  nights, the settle screen, share image and copy text, History and player
  pages. RLS is the real guard; the hook is UX only.
- **Settings.** New Account section (Back up houses, linked status, Delete my
  account). Chip presets and default buy-in stay. Currency moves to House
  settings.
- **First launch after the update:** the owner lands in "My House" with no
  visible change. A fresh install with no houses shows **Join a house**
  (primary) and **Start my own**.

## 5. Setup and rollout

### 5.1 Supabase

- SQL migrations in `supabase/migrations/`: tables, RLS, triggers, RPCs,
  lockout. Applied with the Supabase CLI so the schema is reviewed in git.
- `EXPO_PUBLIC_SUPABASE_URL` and the publishable (anon) key come from EAS env.
  That key is meant to ship in apps; security rests on RLS, so every table has
  policies before anything goes live.
- Enable anonymous sign-ins and the Apple and Google providers.
- Free tier. Free projects pause after about a week without activity; fallback
  is a weekly scheduled ping or the Pro plan.

### 5.2 Store requirements

- **In-app account deletion** (App Store guideline 5.1.1(v); applies once the
  app creates accounts, anonymous included). Settings → Delete my account:
  RPC removes the user's memberships and soft-deletes owned houses, then
  deletes the auth user; local data stays on the phone as unpublished houses.
- Update `docs/privacy-policy.html` and the App Store privacy label: the server
  now stores a user id, house and player names, and amounts.
- Sign in with Apple capability via `expo-apple-authentication` config plugin.

### 5.3 Distribution

- iPhone: TestFlight external testing with a public link (one Beta App Review).
  Builds expire after 90 days.
- Android: EAS `preview` profile building an APK, shared by EAS install link.
  Play Store later (new personal accounts need a 12-tester, 14-day closed test).
- `docs/join/index.html` links both.

### 5.4 Build order

Each phase ships on its own.

0. Merge `feat/player-stats` (pending device check).
1. Local houses: migration v3, house switcher, `/houses/new`, `useCanEdit()`.
   No network.
2. Supabase schema, RLS, RPCs, pgTAP tests.
3. Share house (publish + push), join by code, pull, sync status.
4. Links (`chips://`, https, `.well-known` files, join page), invite text.
5. Account linking, account deletion, privacy policy.
6. Android build, TestFlight public link.

## 6. Testing

### 6.1 Jest

- Migration v3 from a v2 fixture with four nights: every row stamped with the
  house id, balances unchanged.
- Push against a fake Supabase client: FK order, `dirty` cleared only when
  `updated_at` is unchanged, failure leaves rows dirty.
- Pull: paging, cursor advance, soft deletes applied, re-run is idempotent.
- Link parsing: https fragment and `chips://` query; malformed links rejected.
- Invite text with and without a known password.
- `useCanEdit()` hides edit actions for readers.
- The existing suite stays green.

### 6.2 RLS (pgTAP, `supabase test db`)

- A reader can select their house and cannot insert or update any ledger row.
- A non-member sees nothing, including `house_secrets`.
- The owner of house A cannot write house B.
- `join_house`: wrong password fails; the sixth attempt inside 15 minutes is
  locked; wrong code and wrong password return the same error.
- Rotating the secret invalidates the old link.

### 6.3 Devices

No simulator on this Mac, so Expo Go / TestFlight plus one Android phone:
share a house; join by code, https link and `chips://` link; reader
pull-to-refresh after the owner adds a rebuy; an airplane-mode night then
reconnect; reinstall + Apple sign-in recovers ownership; reader leaves; owner
removes a member.

## 7. Errors

| Situation | Behaviour |
|---|---|
| Owner offline | Writes stay local; "N changes waiting"; push later |
| Push fails | Rows stay dirty; "Sync failed · tap to retry"; an RLS rejection is logged as a bug |
| Reader offline | Cached data with "Updated 2h ago" |
| Wrong code / password | "Code or password incorrect"; lockout shows minutes left |
| Invite for deleted house or rotated secret | "This invite is no longer valid. Ask the owner for a new one." |
| Removed from house | Next pull shows "You no longer have access" and removes the local copy |
| House deleted | Readers see "House closed" and can remove it |
| Supabase paused or down | Same as offline; app works from cache |
