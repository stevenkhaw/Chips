# Handoff: Chips shared houses (phases 4a and 4 built, awaiting device check)

Date: 2026-09-27. Repo: `stevenkhaw/Chips`. `main` @ `4bbb97b`. Phases 4a and 4 are on
`claude/gallant-turing-0x6lg4` ([PR #1](https://github.com/stevenkhaw/Chips/pull/1), draft, not merged).
Supersedes `2026-09-24-shared-houses-handoff.md`. That file still holds the
phase 1 orientation notes and the server contract ("Phase 3 must know").

## Goal

Friends on iPhone and Android install Chips and see the same ledger as the
host. The owner, and members the owner makes editors (phase 4b), write; everyone else reads. Design:
`docs/superpowers/specs/2026-09-23-shared-houses-sync-design.md`. Build order
(spec §5.4): 0 player stats → 1 local houses → 2 Supabase → 3 share, join by
code, push/pull → 4a change log → 4 links + invite text → 4b editors → 5 account linking, deletion,
privacy → 6 Android build + TestFlight public link.

## Where things stand

| Item | State |
|---|---|
| Phases 0–2 | Merged to `main`. Migrations applied to the hosted Supabase project. |
| Phase 3 (share, join by code, push/pull, sync status, members, leave, closed) | Merged to `main`. Plan: `plans/2026-09-24-shared-houses-phase3-sync.md`. Followed by about 15 `fix(sync)` commits: offline token refresh, paused project treated as offline, cursor precision, never replacing a lost session with a new anonymous user, leave waiting for an in-flight sync, and deleting a house keeping friends' history. |
| History tab | Dotted line for missed nights, share image, copy text and CSV export, all on `main`. |
| Release tooling | `npm run release` (`scripts/release.sh`) queues an iOS production build (auto-submitted to TestFlight) and an Android preview APK. `eas.json` production and preview builds read the EAS `production` env (Supabase URL and key). |
| Tests (PR #1 head) | 237 Jest tests pass. The 20-test sync integration suite passes against the local stack with `npm run test:sync`. 167 pgTAP assertions pass with `supabase test db`. `npx tsc --noEmit` and the iOS export are clean. |
| Device check | **Not recorded.** Neither the README Device checklist, the build-6 checks from the previous handoff, nor phase 3 plan Task 8 step 3 (two-phone sync) has a recorded result. |
| Phase 4a (change log) | Built on PR #1: `supabase/migrations/20260927120000_change_log.sql` plus pgTAP. **Not yet on the hosted project**; Steven runs `supabase db push`. Plan: `plans/2026-09-27-shared-houses-phase4a-change-log.md`. |
| Phase 4 (invite links) | Tasks 1–5 built on PR #1: link parsing and invite text, join by link, invite-secret cache, reset link, `+native-intent`, join-screen link mode, Share invite / Copy invite text / Reset invite link, `app.json` link config, `deploy/user-site/`, and `docs/join/`. Task 6 (release build and two-phone check) needs Steven. Plan: `plans/2026-09-27-shared-houses-phase4-links.md`. |
| Phase 4b (editors) | Planned: `plans/2026-09-27-shared-houses-phase4b-editors.md`. Not started. |

## Phase 3 decisions that still hold

1. **No network-regained trigger** (NetInfo not added). Pushes retry on the next edit, on app foreground, on pull-to-refresh and on tapping the status line.
2. **Pull runs only for reader houses and for a house just joined.** New-phone recovery for owners is phase 5.
3. **Leave and "removed" hard-purge the local copy.** A server `deleted_at` marks the local house `closed` until the reader removes it.
4. **Local schema v4:** `houses.last_synced_at` and `houses.closed`. `pull_cursor` is a JSON map of per-table cursors.
5. **A phone with published houses never signs in as a new anonymous user.** `ensureSession({ allowNewUser })` throws `signed_out` instead. That stopgap lasts until phase 5 account linking.

## Phase 4 notes

- **Invite secret (fixed on PR #1):** `shareHouse` and `removeHouseMember` used to discard the secret. They now cache it in secure store, and `loadInvite` re-reads it from `house_secrets`, so houses shared before phase 4 get links too.
- **`joinByCode` still returns `{ ok, houseId, role }`.** Only `joinByLink` also returns `added`, which leaves the existing tests untouched.
- **Cloud sessions can run the whole server suite.** Start `dockerd`, then run `npx supabase start`. `scripts/test-sync.sh` calls a bare `supabase`, so put a shim on PATH that runs `npx -y supabase "$@"`.
- **Hosting.** The `.well-known` files cannot live in `docs/`. The Pages site for this repo is a project site under `/Chips/`, and iOS and Android only read `https://<host>/.well-known/`. The plan puts them in a new user-site repo, `stevenkhaw/stevenkhaw.github.io` (Decision 1). Apple Team ID: `W7A3PP782Z`. Android signing SHA-256: `DB:F4:28:A6:F6:A1:50:1E:50:C3:2E:3C:17:F9:0C:52:72:03:0D:03:03:33:94:20:EF:7D:51:16:37:4C:99:D1`. The repo exists (2026-09-27). Its `.nojekyll` and `.well-known` files are pushed (`06536ef`). Check them with the curl commands in plan Task 6 step 2.
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

1. **Steven:** run `supabase db push` for the change log (phase 4a Task 3).
2. **Steven:** merge PR #1, run `npm run release`, then do the phase 4 Task 6 two-phone check. Universal and App Links need a real build, not Expo Go. Also run the README Device checklist and the phase 3 two-phone sync check, which have never been recorded.
3. **Phase 4b (editors):** execute `plans/2026-09-27-shared-houses-phase4b-editors.md` after the check above.
4. **Phase 5:** write the plan (account linking with Apple/Google, the account-deletion RPC, the privacy policy and App Store label). Spec §2.1 and §5.2.
