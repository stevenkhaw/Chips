# Handoff: Chips shared houses (after phase 2, before phase 3)

Date: 2026-09-24. Repo: `stevenkhaw/Chips`, branch `main` @ `5747fac`, pushed.

## Goal

Friends on iPhone and Android install Chips and see the same ledger as the
host. One writer per house (the owner); everyone else reads. Full design:
`docs/superpowers/specs/2026-09-23-shared-houses-sync-design.md`. Build order
(spec §5.4): 0 merge player stats → 1 local houses → 2 Supabase schema/RLS/RPCs
→ 3 share, join by code, push/pull → 4 links + invite text → 5 account
linking, deletion, privacy → 6 Android build + TestFlight public link.

## Where things stand

| Item | State |
|---|---|
| Phase 0 (player stats page) | Merged to `main` |
| Phase 1 (local houses) | Merged to `main`. Plan: `docs/superpowers/plans/2026-09-23-shared-houses-phase1-local-houses.md` |
| Tests | 126 Jest tests pass, `npx tsc --noEmit` clean, `npx expo export --platform ios` OK |
| TestFlight | EAS production build 6 (id `75bef88f-ea78-4fa6-af1d-37f1971db6d8`) submitted 2026-09-23 with `--auto-submit`. Not yet confirmed on device. |
| Steven's real data | Lives in the TestFlight app. Migration v3 runs on it the first time build 6 opens. Steven made his own backup. |
| Phase 2 | Done on `feat/supabase-phase2`, pushed to the hosted Supabase project 2026-09-24. See below. |

### To confirm on the phone (build 6)

1. Home shows **My House ▾ · Owner** with all existing nights; totals, History
   graph and player pages unchanged.
2. New house "Test" with `€` → empty Home; nights there use `€`; same player
   name allowed as in My House; switching back shows original data in `$`.
3. House settings → dev **Preview as reader** only exists in dev builds
   (`__DEV__`), so it is absent in TestFlight. Check reader mode in Expo Go.
4. Delete "Test" → back to My House; Delete disabled when one house is left.
5. Force-quit and reopen → same house, no second "My House".

## What phase 1 built (for orientation)

- `src/db/schema.ts`: migration v3 is a function (idempotent `addColumn`
  guards). Adds `houses`, `house_id` + `dirty` (default 1) on `players`,
  `sessions`, `session_players`, `buyins`, `payments`, and
  `settings.current_house_id`. Stamps existing rows into "My House".
- `src/repo/houses.ts`: list/get/create/rename/currency/delete,
  `getCurrentHouseId`, `setCurrentHouse`, `ensureCurrentHouse` (startup
  fallback if the current house vanishes).
- Repos take an explicit `houseId`; child rows copy `house_id` from their
  parent in SQL; every insert/update sets `dirty = 1` (future push outbox).
- `src/repo/settings.ts`: currency is read from and written to the current
  house; default buy-in and chip presets stay device-wide.
- `src/store/useHousesStore.ts` (`useCanEdit`, `useCurrentHouse`,
  `selectCanEdit`), `src/store/houseActions.ts` (`reloadAll`, `switchHouse`,
  `createHouse`, …). `_layout.tsx` boots via `reloadAll()`.
- UI: `HouseBar` + `HouseSwitcherSheet` on Home and History;
  `/houses/new`; `/houses/[id]` (owner edits; reader sees read-only);
  `EditorOnly` guard on the live table, new-night flow (both steps) and
  players screen; settle screen hides payment logging for readers.

## Phase 2: Supabase schema, RLS, RPCs (done 2026-09-24)

Branch `feat/supabase-phase2` (not merged). Plan:
`docs/superpowers/plans/2026-09-24-shared-houses-phase2-supabase.md`.
Migrations `20260924120000_houses.sql`, `20260924120100_ledger.sql` and
`20260924120200_house_rpcs.sql` were pushed to the hosted project on
2026-09-24; `supabase migration list` shows local = remote. There are 138
pgTAP assertions in `supabase/tests/`, run with `supabase test db` (needs
OrbStack running). The local stack runs only db, auth and kong: the other
services are disabled in `supabase/config.toml` to save disk. The repo is
linked (`supabase/.temp/`, gitignored).

### Phase 3 must know

- **Join RPCs return jsonb and never raise for a bad code or secret:**
  - `{ok:true, house:{…}, role:'owner'|'reader'}`
  - `{ok:false, error:'invalid'}`
  - `{ok:false, error:'locked', minutes:N}`

  Signatures: `join_house(code, password, display_name?)` and
  `join_house_by_link(house_id, secret, display_name?)`. Store the returned
  `role`: an owner who taps their own invite gets `owner`.
- **Other RPCs raise P0001** with one of these messages: `not_authenticated`,
  `forbidden`, `weak_password` (fewer than 4 characters), `house_deleted`,
  `owner_cannot_leave`.
  - `create_house(id, name, currency, password, display_name?)` returns
    `(join_code, invite_secret)` and is safe to retry.
  - `remove_member` returns the **new** invite secret, because the old link
    dies. Prompt the owner to reset the password too.
- **Postgres errors the app must map to messages:**
  - `23514` (check): house name 1–60 characters, currency 1–8, display name
    1–40. Enforce the same limits in the repo and UI; locally, `cleanName`
    and `cleanCurrency` only trim.
  - `23502`: null name or currency.
- **Pushing the house row:** `update houses` with only `name`,
  `currency_symbol`, `updated_at` and `deleted_at`. Any other column returns
  42501, and there is no insert grant; `create_house` makes the row.
- **Pushing ledger rows:** upsert in FK order (players → sessions →
  session_players → buyins → payments). Composite FKs `(parent_id, house_id)`
  reject any child whose house differs from its parent's, and `house_id` is
  immutable.
- **Pull cursor:**
  - Keep the exact timestamptz text returned for `server_updated_at`, with
    its microseconds (a JS `Date` truncates them), plus the last `id`.
  - Page with `or=(server_updated_at.gt.T,and(server_updated_at.eq.T,id.gt.I))`
    ordered by `server_updated_at,id`.
  - Re-read a few seconds of overlap on each pull. Rows are stamped when
    written, not when committed; pull is idempotent, so the overlap is harmless.
- **Removed or closed:** no `house_members` row for the caller means
  "removed". `houses.deleted_at` set means "House closed".
- **Hosted Security Advisor:** it will warn that SECURITY DEFINER functions in
  `public` are executable by `authenticated`. That is intended.
- **Keys:** `EXPO_PUBLIC_SUPABASE_URL` and the publishable key go in EAS env,
  never in git. Anonymous sign-ins are enabled in the dashboard.
- **Account deletion RPC:** phase 5, as Steven decided.

## Parked / deferred items

- ~~Server must enforce same-house parent/player refs~~ done in phase 2 (composite FKs).
- `HouseSwitcherSheet` still shows "House settings" to readers; the screen
  itself is read-only for them. Add **Leave house** there in phase 3.
- Dev `previewAsReader` persists across `switchHouse`; the switcher pill says
  "Owner" while the bar says "Viewing" in preview. Dev aid only.
- Fresh-install "Join a house / Start my own" prompt, sync status line, Share
  house, invite links, Account section: phases 3–5.

## Gotchas

- No Xcode or simulator on this Mac. Verify with `npx tsc --noEmit`,
  `npx jest`, `npx expo export --platform ios`, then Expo Go / TestFlight.
- Expo Go uses its own database, separate from the TestFlight app's.
- Do not run `expo lint` (not set up; it scaffolds `eslint.config.js` — delete
  it if it appears).
- `AGENTS.md`: read https://docs.expo.dev/versions/v57.0.0/ before Expo API
  work.
- `src/store/stores.test.ts` exercises real stores, so any repo signature
  change must update the stores in the same commit or Jest goes red.
- macOS `sed` does not expand `\n` in replacements; use `perl -pi`.
- EAS: `eas build --platform ios --profile production --auto-submit`
  (remote build numbers auto-increment; `ascAppId` 6812882015). Logged in as
  `stevenssz` on this Mac.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Next steps

1. Steven installs build 6 from TestFlight and runs the checklist above.
2. Steven checks branch `feat/history-dotted-gaps` in Expo Go. It draws a
   dotted History line where a player missed a night. Then merge it.
3. Merge `feat/supabase-phase2` into `main`. Server-only, safe to merge.
4. New session: superpowers:writing-plans for phase 3 (share, join by code,
   push/pull, sync status) from the spec, using the "Phase 3 must know" notes
   above. Re-enable `[api]` in `supabase/config.toml` for local REST testing.
