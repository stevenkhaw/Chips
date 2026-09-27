# Shared houses phase 4b: editors — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- The owner can promote a member to **editor** and demote them back. Editors add and edit players, nights, buy-ins, cash-outs and payments; the house itself stays owner-only.
- Every writer's changes reach every phone: the owner now pulls as well as pushes.
- Owner and editors can browse a **Changes** screen built on the phase 4a change log.

**Prerequisites:** phase 4a (change log) is live, and phase 4 (links) is merged. Invites still join as viewers; the owner promotes afterwards.

**Architecture:**
- **Server:** a new `editor` role, `private.can_edit(house_id)`, and ledger RLS switched from `is_house_owner` to `can_edit`. A new `set_member_role` RPC, with `remove_member` able to remove editors. The change log becomes readable by editors.
- **Client:**
  - Roles become `owner | editor | reader`. A single helper, `canWrite(role)`, gates push and edit UI; `role === 'owner'` still gates house management.
  - Sync for writers becomes **push, then pull**.
  - Pull never overwrites a row that is still dirty locally (spec §3.3: last push wins).
  - Pull also refreshes this phone's role. On a demotion it throws away edits that were never sent.
- **UI:** a role switch per member (Viewer / Editor), an "Editor" badge, and the Changes screen.

**Spec:** §3.3 (amended), §8, and the Decisions table (Permissions).

## Global Constraints

- Everything in the phase 3 plan's Global Constraints still applies: Expo docs, `npx expo install`, the per-task verification (`npx jest`, `npx tsc --noEmit`, iOS export), Jest isolation, and the commit trailer.
- Server tasks also run `supabase db reset && supabase test db` and `npm run test:sync`.
- New migration file `supabase/migrations/20260928120000_editors.sql`. Never edit an applied migration.
- `src/store/stores.test.ts` and `src/store/syncActions.test.ts` must stay green. Any repo signature change updates the stores in the same commit.

## Decisions

1. **What editors can do.**
   - They can: insert and update every ledger table (add or edit players, start, edit or soft-delete nights, buy-ins, cash-outs, payments), and read the change log.
   - They can't: rename the house, change its currency, share, reset password or link, see secrets, manage members, or delete the house. RLS on `houses`, `house_secrets` and the RPCs stays owner-only.
2. **Conflict rule** (spec §3.3). The last push wins per row. `applyPulledRows` skips rows whose local copy is `dirty = 1`. The local version then pushes and overwrites the server, and the change log keeps both.
3. **The owner pulls now.** The phase 3 Decision 2 ("pull only for reader houses") is reversed for every writer.
   - The first pull after upgrading starts from an empty cursor. It re-downloads the house once and applies identical rows, which is harmless. With Decision 2 in place, the early return in `pullHouse` ("owner with anything dirty is left alone") is removed.
4. **Role refresh.** Pull reads the caller's own `house_members.role` (RLS: own row is visible) and stores it locally.
   - **Promoted** (reader → editor): the next pull flips the local role, and edit UI appears.
   - **Demoted** (editor → reader): unpushed local edits would be rejected by RLS forever, so the pull:
     1. clears `dirty` on every row of that house;
     2. resets the pull cursors;
     3. re-pulls, so local data matches the server;
     4. alerts: "Your edit access to "X" was removed. N unsent changes were discarded."
5. **Push errors under demotion.** Demotion can race a push, and a 42501 from RLS is the symptom. On 42501 from a ledger upsert for an editor house, run the role refresh instead of logging a bug (spec §7 still logs 42501 for owners).
6. **Owner can't be demoted, and there's still one owner.** `set_member_role` refuses the owner row. Ownership transfer stays out of scope.
7. **Changes screen reads the server.** The log is server-only, and it pages newest-first, 50 at a time. Names are resolved as follows:
   - players and nights from local SQLite;
   - the actor from `house_members.display_name`;
   - the owner is "Owner" when their `display_name` is null, and any other null is "Someone".

---

### Task 1: Server: editor role, RLS, `set_member_role`

**Files:**
- Create: `supabase/migrations/20260928120000_editors.sql`, `supabase/tests/editors.test.sql`

- [ ] **Step 1: Failing pgTAP tests.** Fixtures: u1 (owner of A), u2 (editor of A), u3 (reader of A), u4 (owner of B). Assertions:
  - **u2 (editor):**
    - can insert and update players, sessions, session_players, buyins and payments in A;
    - cannot write B (42501);
    - cannot update `houses` A (0 rows);
    - cannot select `house_secrets`;
    - cannot call `reset_house_password`, `reset_house_link`, `remove_member` or `set_member_role` (`forbidden`).
  - **u3 (reader):** still cannot write.
  - **`set_member_role` as u1:**
    - u3 → `editor` works, and a change-log row (`house_members` update, `before.role = reader`) appears;
    - u1's own row → `forbidden`;
    - role `owner` → `invalid_role`;
    - a non-member → `not_a_member`.
  - **`remove_member`:** u1 can remove an editor, and the secret rotates.
  - **`ledger_changes`:** u2 (editor) can select A's entries; u3 (reader) sees none.
- [ ] **Step 2: Migration.**

```sql
alter table public.house_members drop constraint house_members_role_check;
alter table public.house_members add constraint house_members_role_check
  check (role in ('owner', 'editor', 'reader'));

create function private.can_edit(p_house_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.house_members m
    where m.house_id = p_house_id and m.user_id = (select auth.uid())
      and m.role in ('owner', 'editor')
  );
  -- No deleted_at check, matching is_house_owner, so owner behaviour is unchanged. (push.ts
  -- already sends a deleted house's last ledger rows before the house row.)
$$;
-- revoke from public, grant to authenticated (as the other helpers).
```

  - For each ledger table, drop the `"owner inserts"` / `"owner updates"` policies and recreate them as `"writers insert"` / `"writers update"` using `private.can_edit(house_id)`, in a `do $$ foreach` loop.
  - Replace `"owner reads changes"` on `ledger_changes` with `"writers read changes"` using `can_edit`.
  - `set_member_role(p_house_id uuid, p_user_id uuid, p_role text) returns void`, `security definer`. Checks run in this order:
    1. the caller is the owner, else `forbidden`;
    2. the role is `reader` or `editor`, else `invalid_role`;
    3. the target isn't the owner, else `forbidden`;
    4. the target's row exists, else `not_a_member`.

    Then update the role. Grant the same way as the other RPCs.
  - `create or replace function public.remove_member(...)`: identical, except it deletes `role in ('reader', 'editor')`.
- [ ] **Step 3.** Run `supabase db reset && supabase test db` (all green) and `npm run test:sync` (unchanged). Commit `feat(supabase): editor role, writers RLS, set_member_role`.

### Task 2: Client roles and write gating

**Files:**
- Modify:
  - `src/domain/types.ts` (`HouseRole` adds `'editor'`; export `canWrite(role)`);
  - `src/store/useHousesStore.ts` (`selectCanEdit` uses `canWrite`);
  - `src/sync/errors.ts` (`invalid_role`, `not_a_member` messages);
  - `src/components/HouseBar.tsx` and `HouseSwitcherSheet.tsx` (badge: Owner / Editor / Viewing);
  - `src/app/houses/[id].tsx` (editors get the reader view of house settings, plus the Changes link from Task 5).
- Test: `src/store/stores.test.ts`. `useCanEdit` is true for owner and editor and false for reader and preview.

- [ ] **Steps.** Write the failing store test, implement, then verify and commit `feat(app): editor role gates editing like the owner`.

The local `houses.role` column is plain `TEXT`, so no local migration is needed.

### Task 3: Multi-writer sync

**Files:**
- Modify:
  - `src/repo/sync.ts`: `applyPulledRows` gains `WHERE <table>.dirty = 0` on its `DO UPDATE`. New `setHouseRole(db, id, role)` and `discardUnsent(db, houseId): number`, which clears `dirty` and resets `pull_cursor`.
  - `src/sync/remote.ts`: `fetchMyRole(client, houseId, userId): Promise<HouseRole | null>`, `rpcSetMemberRole`.
  - `src/sync/pull.ts`: remove the owner early return. Every pull reads the role first:
    - `null` → `removed`;
    - changed → `setHouseRole`;
    - editor → reader → `discardUnsent`, then a full pull; return `{ result: 'ok', discarded: n }`.
  - `src/sync/push.ts`: push ledger rows for `canWrite(role)`, and the house row only for the owner.
  - `src/store/syncActions.ts`:
    - `runSync` for writers pushes, then pulls;
    - `refreshPending` and `pushDirtyHouses` use `canWrite`;
    - on a discarded result, show the Decision 4 alert;
    - on 42501 from an editor push, run a pull (Decision 5).
- Test:
  - `src/repo/sync.test.ts`: a pulled row doesn't overwrite a dirty local row but does overwrite a clean one; `discardUnsent` clears dirty and cursors.
  - `src/sync/sync.integration.test.ts` (three phones: owner, editor, reader):
    1. The owner promotes the editor. The editor's next pull flips its role to `editor`.
    2. The editor adds a buy-in and pushes. The owner pulls and sees it. The reader pulls and sees it.
    3. The owner and editor both edit the same cash-out offline. The editor pushes first, then the owner; the server has the owner's value. After both pull, both phones show the owner's value, and the change log holds both updates.
    4. The owner's pull does not overwrite the owner's own unpushed edit.
    5. The owner demotes the editor while the editor has an unpushed buy-in. The editor's next sync returns `discarded: 1`, and its local data equals the server's.
    6. The editor cannot rename the house: `updateHouseRow` is refused, and the UI never offers it.
  - `src/store/syncActions.test.ts`: writers push then pull; readers only pull; the demotion alert fires once.
- [ ] **Steps.** Tests first, then implement, run the full verification plus `npm run test:sync`, and commit `feat(sync): editors push; writers pull; demotion discards unsent edits`.

### Task 4: Member role switch

**Files:**
- Modify: `src/app/houses/[id].tsx` (members list), `src/store/syncActions.ts` (`setMemberRole(houseId, userId, role)`, which reloads members).

- [ ] **Steps.**
  - Each non-owner member row shows a Viewer | Editor segmented control.
  - Changing it confirms first: "Let {name} add and edit nights and players? They can't change house settings or members." Then it calls the RPC.
  - The pill labels become Owner / Editor / Viewer.
  - The remove-member alert copy is unchanged.
  - Commit `feat(houses): owner promotes members to editor`.

### Task 5: Changes screen

**Files:**
- Create:
  - `src/domain/changeLog.ts` (pure): `describeChange(entry, lookup): { title: string; detail: string | null }`. It turns a log row into, for example:
    - "Added buy-in $20 for Ann · Friday Night Lights"
    - "Changed Ann's cash-out $30 → $45"
    - "Renamed player Cat → Catherine"
    - "Deleted night Dave's place"
    - "Bo joined as viewer"
    - "Made Bo an editor"
    - "Password reset" / "Invite link reset"

    Money uses the house currency and `src/domain/money.ts`.
  - `src/domain/changeLog.test.ts`: one test per table × op, plus unknown-row fallbacks ("a player", "a night").
  - `src/app/houses/[id]/changes.tsx`: an infinite list. Rows show the title, the actor and a relative time, grouped by day. Pull-to-refresh.
- Modify:
  - `src/sync/remote.ts`: `fetchChanges(client, houseId, beforeId?: number, limit = 50)`, ordered by `id desc`.
  - `src/app/houses/[id].tsx`: a **Changes** row for the owner and editors.
- [ ] **Steps.**
  - Test `describeChange` first.
  - Build the screen. It needs a network connection; offline, it shows "Changes load when you're online."
  - Commit `feat(houses): changes screen from the server change log`.

### Task 6: Device check and docs (needs Steven)

- [ ] **Local verification:** `supabase db push` of the editors migration (Steven), `npm run test:sync`, `npx jest`, `npx tsc --noEmit`, iOS export.
- [ ] **Two phones:**
  1. Promote a friend to editor. On their phone, "Editor" appears after pull-to-refresh.
  2. They add a buy-in; it appears on the owner's phone after refresh.
  3. The Changes screen on both phones shows it with their name.
  4. Demote them. Their edit buttons disappear on the next refresh.
- [ ] **Docs:**
  - Handoff: phase 4b done.
  - README Status.
  - Spec §5.4 status.
