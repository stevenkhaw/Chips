# Shared houses phase 4a: server change log — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every change that reaches the server is recorded in an append-only log: who made it, when, and what changed. The log starts collecting now, before friends join. Phase 4b makes it visible in the app.

**Architecture:**
- One new migration adds:
  - the `public.ledger_changes` table;
  - a `SECURITY DEFINER` trigger function, `private.log_change()`, attached `AFTER` insert/update (and delete, where deletes exist) on the five ledger tables, `houses`, `house_members` and `house_secrets`.
- Tested with pgTAP (`supabase test db`).
- No app code changes.

**Spec:** `docs/superpowers/specs/2026-09-23-shared-houses-sync-design.md` §8.

## Global Constraints

- **Migrations.** Add a new file; never edit an applied one. Name it `supabase/migrations/20260927120000_change_log.sql`.
- **Verification.** Run `supabase db reset && supabase test db` (every pgTAP file green), plus `npm run test:sync` and `npx jest`.
- **Hosted rollout.** Steven runs `supabase db push` from his Mac, where the link lives in `supabase/.temp`. It is safe to push before any app release, because the app never reads the table in this phase.
- **Commits.**
  - Every commit message ends with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
  - Work on the branch assigned for this cycle. In the 2026-09-27 session that is `claude/gallant-turing-0x6lg4`, [PR #1](https://github.com/stevenkhaw/Chips/pull/1).

## Decisions

1. **Diffs, not full rows, for updates.** `before` and `after` hold only the keys whose values changed. That keeps the log small and makes "what changed" direct to read.
   - `server_updated_at` and `updated_at` are ignored when diffing. An update whose diff is empty (a push retry re-upserting an identical row) logs nothing.
   - An insert logs the full new row as `after`, minus `server_updated_at`.
   - A delete (only `house_members` has real deletes) logs the full old row as `before`.
2. **Secrets are redacted.** For `house_secrets`, each changed key maps to the string `"changed"`, e.g. `{"password_hash": "changed"}`. Hashes and invite secrets never enter the log.
3. **`row_id`:**
   - `id` for ledger tables and `houses`;
   - `user_id` for `house_members`;
   - `house_id` for `house_secrets`.

   `house_id` is always the owning house.
4. **Actor.** `actor_id = auth.uid()`. It is null for writes that carry no JWT (migrations, SQL editor, `service_role`). `SECURITY DEFINER` RPCs keep the caller's JWT, so `join_house` logs the joining user as the actor.
5. **Append-only.**
   - `authenticated` and `anon` get no insert, update or delete; the trigger function writes as its owner.
   - `service_role` loses update, delete and truncate, as done for the other tables.
6. **Read access.** A select policy allows `private.is_house_owner(house_id)`. Phase 4b widens it to editors.
7. **`at`** is `clock_timestamp()`, so entries inside one transaction are ordered. `id` is `bigint generated always as identity` and serves as the tiebreaker.

---

### Task 1: Failing pgTAP tests

**Files:**
- Create: `supabase/tests/change_log.test.sql`

- [ ] **Step 1.** Write tests, using the fixtures style of `ledger_rls.test.sql`: users u1 (owner of A), u2 (reader of A) and u3 (owner of B), inserted as the table owner. Assertions:
  1. The table exists, and RLS is enabled on it.
  2. As u1 (`set local role authenticated`, `request.jwt.claim.sub`), inserting a player into A logs one row: `op = 'insert'`, `table_name = 'players'`, `actor_id = u1`, `after->>'name' = 'Ann'`, `before is null`, and `after` has no `server_updated_at` key.
  3. Renaming that player logs `op = 'update'` with `before = {"name":"Ann"}` and `after = {"name":"Annie"}`, even though `updated_at` also changed.
  4. Re-upserting the identical row (`insert … on conflict (id) do update set …` with the same values) logs nothing new.
  5. Soft-deleting a buy-in logs an update whose `after` has `deleted_at`.
  6. A `houses` rename by u1 logs with `table_name = 'houses'` and `row_id = house id`.
  7. `join_house` as a fresh user logs a `house_members` insert with `actor_id` = that user. `leave_house` logs a `house_members` delete with `before->>'role' = 'reader'`.
  8. `reset_house_password` logs a `house_secrets` update with `after = {"password_hash":"changed"}`. The string `$2` (bcrypt prefix) appears nowhere in `ledger_changes::text`.
  9. **Access:**
     - u1 can select A's entries and sees none of B's.
     - u2 (reader) selects zero rows.
     - `anon` gets 42501.
     - `authenticated` cannot insert, update or delete (42501).
     - `service_role` cannot update or delete (42501).

- [ ] **Step 2.** Run `supabase test db` and watch the new file fail.

### Task 2: Migration

**Files:**
- Create: `supabase/migrations/20260927120000_change_log.sql`

- [ ] **Step 1.** Create the table and its index:

```sql
create table public.ledger_changes (
  id bigint generated always as identity primary key,
  house_id uuid not null references public.houses (id),
  table_name text not null,
  row_id uuid not null,
  op text not null check (op in ('insert', 'update', 'delete')),
  actor_id uuid,
  at timestamptz not null default clock_timestamp(),
  before jsonb,
  after jsonb
);
create index ledger_changes_house_at_idx on public.ledger_changes (house_id, at, id);
```

- [ ] **Step 2.** Write `private.log_change()` (plpgsql, `security definer`, `set search_path = ''`). It should:
  - build `v_old` and `v_new` jsonb from `to_jsonb(old)` and `to_jsonb(new)`, minus `server_updated_at`;
  - on update, diff key by key, ignoring `updated_at`. Collect the changed keys into `before` and `after`, and return early if nothing changed;
  - redact every value when `tg_table_name = 'house_secrets'`;
  - pick `house_id` and `row_id` per Decision 3 with a `case tg_table_name`;
  - insert into the log and `return null` (it is an AFTER trigger).

- [ ] **Step 3.** Create the triggers:
  - ledger tables and `houses`: `after insert or update`;
  - `house_members`: `after insert or update or delete`;
  - `house_secrets`: `after update` only. Its insert happens inside `create_house` together with the house insert, which is already logged.

  Use a `do $$ … foreach …` loop for the five ledger tables, like the ledger migration.

- [ ] **Step 4.** Set grants and policies:

```sql
revoke execute on function private.log_change() from public;
alter table public.ledger_changes enable row level security;
revoke all on public.ledger_changes from anon, authenticated;
revoke update, delete, truncate on public.ledger_changes from service_role;
grant select on public.ledger_changes to authenticated;
create policy "owner reads changes" on public.ledger_changes
  for select to authenticated using (private.is_house_owner(house_id));
```

- [ ] **Step 5.** Run `supabase db reset && supabase test db` until every file is green. Then run `npm run test:sync`: the push/pull suite must be unaffected, because the triggers only add rows.

- [ ] **Step 6.** Commit:

```bash
git add supabase/migrations/20260927120000_change_log.sql supabase/tests/change_log.test.sql
git commit -m "feat(supabase): append-only change log for ledger, houses and membership

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

### Task 3: Rollout and docs (Steven)

- [ ] **Step 1.** Steven runs `supabase db push`, then `supabase migration list` (local = remote).
- [ ] **Step 2.** In the hosted SQL editor, as a smoke test: `select table_name, op, at from ledger_changes order by id desc limit 5` after any edit in the app.
- [ ] **Step 3.** Record in the handoff that the change log is live on the hosted project and when logging started.
