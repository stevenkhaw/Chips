# Handoff: Chips shared houses (after phase 3, before phase 4)

Date: 2026-09-27. Repo: `stevenkhaw/Chips`, branch `main` @ `4bbb97b`.
Supersedes `2026-09-24-shared-houses-handoff.md`. That file still holds the
phase 1 orientation notes and the server contract ("Phase 3 must know").

## Goal

Friends on iPhone and Android install Chips and see the same ledger as the
host. One writer per house (the owner); everyone else reads. Design:
`docs/superpowers/specs/2026-09-23-shared-houses-sync-design.md`. Build order
(spec §5.4): 0 player stats → 1 local houses → 2 Supabase → 3 share, join by
code, push/pull → 4 links + invite text → 5 account linking, deletion,
privacy → 6 Android build + TestFlight public link.

## Where things stand

| Item | State |
|---|---|
| Phases 0–2 | Merged to `main`. Migrations applied to the hosted Supabase project. |
| Phase 3 (share, join by code, push/pull, sync status, members, leave, closed) | Merged to `main`. Plan: `plans/2026-09-24-shared-houses-phase3-sync.md`. Followed by about 15 `fix(sync)` commits: offline token refresh, paused project treated as offline, cursor precision, never replacing a lost session with a new anonymous user, leave waiting for an in-flight sync, and deleting a house keeping friends' history. |
| History tab | Dotted line for missed nights, share image, copy text and CSV export, all on `main`. |
| Release tooling | `npm run release` (`scripts/release.sh`) queues an iOS production build (auto-submitted to TestFlight) and an Android preview APK. `eas.json` production and preview builds read the EAS `production` env (Supabase URL and key). |
| Tests | 199 Jest tests pass. 17 are skipped: the sync integration suite, which runs with `npm run test:sync` after `supabase start`. `npx tsc --noEmit` is clean. |
| Device check | **Not recorded.** Neither the README Device checklist, the build-6 checks from the previous handoff, nor phase 3 plan Task 8 step 3 (two-phone sync) has a recorded result. |
| Phase 4 | Planned: `plans/2026-09-27-shared-houses-phase4-links.md`. Not started. |

## Phase 3 decisions that still hold

1. **No network-regained trigger** (NetInfo not added). Pushes retry on the next edit, on app foreground, on pull-to-refresh and on tapping the status line.
2. **Pull runs only for reader houses and for a house just joined.** New-phone recovery for owners is phase 5.
3. **Leave and "removed" hard-purge the local copy.** A server `deleted_at` marks the local house `closed` until the reader removes it.
4. **Local schema v4:** `houses.last_synced_at` and `houses.closed`. `pull_cursor` is a JSON map of per-table cursors.
5. **A phone with published houses never signs in as a new anonymous user.** `ensureSession({ allowNewUser })` throws `signed_out` instead. That stopgap lasts until phase 5 account linking.

## Phase 4 must know

- **`shareHouse` discards the invite secret** that `create_house` returns. Houses shared before phase 4 have no local copy, so the owner re-reads it from `house_secrets` (RLS: owner only). The phase 4 plan covers this (Decision 5).
- **`removeHouseMember` also drops the rotated secret** that `remove_member` returns.
- **Hosting.** The `.well-known` files cannot live in `docs/`. The Pages site for this repo is a project site under `/Chips/`, and iOS and Android only read `https://<host>/.well-known/`. The plan puts them in a new user-site repo, `stevenkhaw/stevenkhaw.github.io` (Decision 1). Apple Team ID: `W7A3PP782Z`. Android signing SHA-256: `DB:F4:28:A6:F6:A1:50:1E:50:C3:2E:3C:17:F9:0C:52:72:03:0D:03:03:33:94:20:EF:7D:51:16:37:4C:99:D1`. The repo exists (2026-09-27). Its `.well-known` files are committed in a cloud session but not yet pushed: the Claude GitHub App isn't installed on that repo.
- **Expo Go can't test universal links or `chips://`.** Use `exp://<lan-ip>:8081/--/join?h=…&s=…` for the join flow, and an EAS build for real links.
- **Readers already have Leave house** in House settings; the switcher's "House settings" button leads there. The old "add Leave house" parked item is done.

## Parked / deferred items

- Dev `previewAsReader` persists across `switchHouse`; the switcher pill says "Owner" while the bar says "Viewing" in preview. Dev aid only.
- The network-regained push trigger (NetInfo).
- The fresh-install "Join a house / Start my own" prompt. Home's empty state has "Join a house" as a stand-in.
- Account section, account deletion and privacy policy update: phase 5.
- TestFlight public link and APK link on the join page: phase 6.

## Gotchas

- No Xcode or simulator on Steven's Mac, and none in cloud sessions. Verify with `npx tsc --noEmit`, `npx jest` and `npx expo export --platform ios`, then Expo Go or TestFlight.
- Expo Go uses its own database, separate from the TestFlight app's.
- Do not run `expo lint` (not set up; it scaffolds `eslint.config.js`, so delete that file if it appears).
- `AGENTS.md`: read https://docs.expo.dev/versions/v57.0.0/ before Expo API work. Cloud sessions may have `docs.expo.dev` blocked by the network policy. In that case check the installed package types in `node_modules` and flag it.
- `src/store/stores.test.ts` exercises real stores, so a repo signature change must update the stores in the same commit.
- Stores never import `src/sync/*`; only `src/app/**`, `src/components/**` and `src/store/syncActions.ts` do.
- macOS `sed` does not expand `\n`; use `perl -pi`.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Next steps

1. **Steven runs the device checks** before more features land: README Device checklist, then two-phone sync (phase 3 plan Task 8 step 3). Use a `npm run release` build or Expo Go with `.env.local`.
2. **Phase 4:** execute `plans/2026-09-27-shared-houses-phase4-links.md`. Tasks 1–5 need no further Steven input. Task 6 needs him.
3. **Phase 5:** write the plan (account linking with Apple/Google, the account-deletion RPC, the privacy policy and App Store label). Spec §2.1 and §5.2.
