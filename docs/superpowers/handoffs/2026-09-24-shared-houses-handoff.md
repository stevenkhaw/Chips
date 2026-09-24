# Handoff: Chips shared houses (after phase 1, before phase 2)

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
| Phase 2 | Not started. No plan file yet. |

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

## Phase 2: Supabase schema, RLS, RPCs (next)

Server only. The app does not talk to Supabase until phase 3.

**Steven does first:** create a Supabase project (free tier) and note its URL
and publishable/anon key; enable anonymous sign-ins. Supabase CLI 2.117.0 is installed (2026-09-24).
Docker runs through OrbStack (context `orbstack`); open OrbStack before
`supabase start` / `supabase test db`, which need it.

**Planned tasks (to be written up with superpowers:writing-plans):**

1. `supabase init`; SQL migrations live in `supabase/migrations/`; run a
   local stack with `supabase start`.
2. Tables: `houses` (owner_id, 8-char `join_code` without look-alike chars,
   currency, soft delete), `house_secrets` (bcrypt `password_hash` via
   `pgcrypto`, 32-byte `invite_secret`), `house_members` (role
   owner/reader), `join_attempts`, and the five ledger tables mirroring the
   local columns plus `house_id` and a trigger-set `server_updated_at`.
3. RLS: members select; only `houses.owner_id` inserts/updates; no deletes
   (soft only); `house_secrets` owner-only.
4. **Same-house integrity (parked from the phase 1 review):** triggers or
   checks so a child row's `house_id` equals its parent's, and a session
   player / payment only references players from the same house.
5. RPCs (`SECURITY DEFINER`): `create_house(id, name, currency, password)`
   returning `join_code` + `invite_secret`; `join_house(code, password)` with
   a 5-failures-in-15-minutes lockout and one `invalid` error for wrong code
   or password; `join_house_by_link(house_id, secret)`;
   `reset_house_password`, `reset_house_link`, `remove_member`,
   `leave_house`.
6. pgTAP tests (`supabase test db`): reader cannot write any ledger row;
   non-member sees nothing incl. secrets; owner of A cannot write B; lockout
   on attempt 6; identical errors; rotated secret kills old link;
   cross-house child rows rejected.
7. `supabase db push` to the hosted project once tests pass.

Open choice for the phase 2 plan: RPC for account deletion now or in phase 5
(spec puts it in phase 5).

## Parked / deferred items

- Server must enforce same-house parent/player refs (phase 2, task 4 above).
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
2. Steven creates the Supabase project and installs the CLI.
3. New session: invoke superpowers:writing-plans for phase 2 from the spec
   and this handoff, then execute with superpowers:subagent-driven-development.
