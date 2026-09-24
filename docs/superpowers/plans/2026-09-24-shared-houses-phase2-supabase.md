# Shared houses phase 2: Supabase schema, RLS, RPCs — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Supabase backend (tables, row-level security, server functions) that lets one owner write a house's ledger and lets members only read it, proven by pgTAP tests and pushed to the hosted project.

**Architecture:** Server only; the app does not change and does not talk to Supabase until phase 3. Three SQL migrations in `supabase/migrations/`: house tables, ledger tables, RPCs. RLS calls two `SECURITY DEFINER` helpers in a `private` schema (not exposed by the API). Same-house integrity uses composite foreign keys on `(id, house_id)`, so it needs no triggers. Tests are pgTAP files in `supabase/tests/`, run with `supabase test db` against a local Docker stack.

**Tech Stack:** Supabase CLI 2.117 (`/opt/homebrew/bin/supabase`), Docker 29.4, Postgres (Supabase local image), `pgcrypto` (bcrypt, random bytes), pgTAP.

**Spec:** `docs/superpowers/specs/2026-09-23-shared-houses-sync-design.md` (§1.1, §2.2–2.4, §2.6, §5.1, §6.2). Handoff: `docs/superpowers/handoffs/2026-09-24-shared-houses-handoff.md`.

## Global Constraints

- Do not change app code (`src/`, `app.json`, `package.json`). `npx jest` (126 tests) and `npx tsc --noEmit` must stay green at the end.
- Do not run `expo lint`. If `eslint.config.js` appears, delete it.
- Every table in `public` has RLS enabled and explicit grants before anything reaches the hosted project.
- Deletes are soft (`deleted_at`). No role other than the table owner (`postgres`) may `DELETE` any house or ledger row.
- Ledger columns mirror local SQLite (`src/db/schema.ts`): ids are UUIDs (`expo-crypto` `randomUUID`), timestamps are epoch **milliseconds** (`bigint`), money is cents (`bigint`), `archived` is `0/1` `integer`.
- Join codes: 8 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no `0 O 1 I`), stored without a hyphen.
- Wrong code and wrong password give the **same** response. Lockout: 5 failed attempts in 15 minutes per user.
- The account-deletion RPC waits for phase 5 (decided 2026-09-24).
- Every `SECURITY DEFINER` function sets `search_path = ''` and schema-qualifies every name.
- Commit trailer: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- macOS `sed` does not expand `\n` in replacements; use `perl -pi -e`.

## Design notes (read before Task 2)

1. **Join RPCs return `jsonb` instead of raising.** The spec says `join_house` "raises `locked`/`invalid`". A raise rolls back the whole call, including the `join_attempts` row that records the failure, so the lockout could never count. `join_house` and `join_house_by_link` therefore return:
   - `{"ok": true, "house": { …houses row… }}`
   - `{"ok": false, "error": "invalid"}`
   - `{"ok": false, "error": "locked", "minutes": <int>}`

   The other RPCs raise errors normally. The error message is one of `not_authenticated`, `forbidden`, `weak_password`, `house_deleted`, `owner_cannot_leave` (SQLSTATE `P0001`).
2. **Timing.** When the code matches no house, `join_house` still runs one bcrypt so a wrong code takes as long as a wrong password.
3. **`join_attempts` lives in `private`**, so the API never exposes it. Rows older than a day are pruned on each join.
4. **`server_updated_at` uses `clock_timestamp()`**, not `now()`, so rows in one push batch get distinct values. Phase 3 must still page pulls by `(server_updated_at, id)`, not by `server_updated_at` alone. Index `<table>_pull_idx` supports that.
5. **Houses are created only by `create_house`.** `authenticated` has no `INSERT` on `houses` and may `UPDATE` only `name`, `currency_symbol`, `updated_at`, `deleted_at`. Phase 3's push must `update` the house row, not upsert it.
6. **`houses.owner_id` has no FK to `auth.users`**, so deleting an auth user never cascades into ledger data. Phase 5's deletion RPC soft-deletes owned houses itself. `house_members.user_id` and `join_attempts.user_id` do cascade.
7. **`house_id` and a row's parent house never diverge.** `house_id` is immutable (trigger) and child rows reference `(parent_id, house_id)`.

## File Structure

| Path | Responsibility |
|---|---|
| `supabase/config.toml` | Created by `supabase init`; anonymous sign-ins turned on |
| `supabase/migrations/20260924120000_houses.sql` | `private` schema, RLS helpers, `houses`, `house_secrets`, `house_members`, `private.join_attempts`, their RLS |
| `supabase/migrations/20260924120100_ledger.sql` | Five ledger tables, composite FKs, stamp trigger, RLS |
| `supabase/migrations/20260924120200_house_rpcs.sql` | Code/secret generators, `create_house`, `join_house`, `join_house_by_link`, `reset_house_password`, `reset_house_link`, `remove_member`, `leave_house` |
| `supabase/tests/00_setup.test.sql` | Smoke test: pgTAP and bcrypt available |
| `supabase/tests/houses_rls.test.sql` | House table access per role |
| `supabase/tests/ledger_rls.test.sql` | Ledger access per role |
| `supabase/tests/ledger_integrity.test.sql` | Cross-house child rows rejected; `house_id` immutable |
| `supabase/tests/rpc_create_join.test.sql` | `create_house`, `join_house` (lockout, identical errors), `join_house_by_link` |
| `supabase/tests/rpc_manage.test.sql` | Reset password/link, remove member, leave, deleted house |
| `README.md` | Short "Server (Supabase)" section with the commands |

Test users, used across all test files:

| uuid | role in tests |
|---|---|
| `00000000-0000-0000-0000-000000000001` | owner (u1) |
| `00000000-0000-0000-0000-000000000002` | reader (u2) |
| `00000000-0000-0000-0000-000000000003` | stranger / other owner / locked-out user (u3) |
| `00000000-0000-0000-0000-000000000004` | u4 |
| `00000000-0000-0000-0000-000000000005` | u5 |

Houses: A = `aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa`, B = `bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb`.

Acting as a user inside a test:

```sql
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
```

`reset role;` goes back to `postgres` (bypasses RLS) for setup and checks.

---

### Task 1: Supabase scaffold, local stack, smoke test

**Files:**
- Create: `supabase/config.toml`, `supabase/.gitignore` (both from `supabase init`)
- Create: `supabase/tests/00_setup.test.sql`
- Modify: `README.md` (append a section)

**Interfaces:**
- Produces: a running local stack (`supabase start`) and a working `supabase test db` that later tasks use.

- [ ] **Step 1: Initialise**

Run from the repo root: `supabase init`
If it asks about VS Code or IntelliJ Deno settings, answer **N**. If it still creates `.vscode/` or `supabase/functions/`, delete them.
Expected: `supabase/config.toml` and `supabase/.gitignore` exist.

- [ ] **Step 2: Turn on anonymous sign-ins locally**

Run: `grep -n 'enable_anonymous_sign_ins' supabase/config.toml`
Expected: one line under `[auth]` set to `false`. Flip it:

```bash
perl -pi -e 's/^enable_anonymous_sign_ins = false/enable_anonymous_sign_ins = true/' supabase/config.toml
grep -n 'enable_anonymous_sign_ins' supabase/config.toml
```

Expected: `enable_anonymous_sign_ins = true`. If the key is missing, add `enable_anonymous_sign_ins = true` on the line after `[auth]`.

- [ ] **Step 3: Start the stack**

Run: `supabase start` (the first run pulls images; allow up to 10 minutes)
Expected: prints `API URL`, `DB URL`, `Studio URL`. Docker must be running. If it is not, start Docker Desktop and retry.

- [ ] **Step 4: Write the smoke test**

`supabase/tests/00_setup.test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select ok(
  extensions.crypt('x', extensions.gen_salt('bf', 8)) like '$2a$08$%',
  'pgcrypto bcrypt is available in the extensions schema'
);
select ok(
  octet_length(extensions.gen_random_bytes(32)) = 32,
  'gen_random_bytes is available'
);

select * from finish();
rollback;
```

- [ ] **Step 5: Run it**

Run: `supabase test db`
Expected: `00_setup.test.sql .. ok`, `All tests successful.`

- [ ] **Step 6: Document the commands**

Append to `README.md`:

```markdown
## Server (Supabase)

Shared houses sync through Supabase. Schema, row-level security and server
functions live in `supabase/migrations/`; pgTAP tests in `supabase/tests/`.

    supabase start        # local stack (needs Docker)
    supabase db reset     # re-apply every migration to the local database
    supabase test db      # run the pgTAP tests
    supabase db push      # apply new migrations to the hosted project (after `supabase link`)
```

- [ ] **Step 7: Commit**

```bash
git add supabase/config.toml supabase/.gitignore supabase/tests/00_setup.test.sql README.md
git commit -m "chore(supabase): init project, local stack and pgTAP smoke test

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: House tables and their RLS

**Files:**
- Create: `supabase/tests/houses_rls.test.sql`
- Create: `supabase/migrations/20260924120000_houses.sql`

**Interfaces:**
- Consumes: local stack from Task 1.
- Produces:
  - schema `private` (usage granted to `authenticated`)
  - `private.is_house_member(p_house_id uuid) returns boolean` and `private.is_house_owner(p_house_id uuid) returns boolean`, both keyed on `auth.uid()`, executable by `authenticated`
  - tables `public.houses(id uuid pk, name, owner_id uuid, join_code text unique, currency_symbol, created_at bigint, updated_at bigint, deleted_at bigint, server_updated_at timestamptz)`, `public.house_secrets(house_id pk, password_hash, invite_secret)`, `public.house_members(house_id, user_id, role 'owner'|'reader', joined_at)`, `private.join_attempts(id, user_id, at, ok)`
  - unique constraint name `houses_join_code_key` (Task 4 relies on it)

- [ ] **Step 1: Write the failing test**

`supabase/tests/houses_rls.test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'owner@test.local'),
  ('00000000-0000-0000-0000-000000000002', 'reader@test.local'),
  ('00000000-0000-0000-0000-000000000003', 'stranger@test.local');

insert into public.houses (id, name, owner_id, join_code, currency_symbol, created_at, updated_at)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Tuesday', '00000000-0000-0000-0000-000000000001', 'TUESDAY2', '$', 1, 1);
insert into public.house_secrets (house_id, password_hash, invite_secret)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', extensions.crypt('hunter22', extensions.gen_salt('bf', 8)), 'secret-a');
insert into public.house_members (house_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000001', 'owner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000002', 'reader');
select set_config('test.stamp0',
  (select server_updated_at::text from public.houses where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), true);

select throws_ok(
  $$insert into public.houses (id, name, owner_id, join_code, created_at, updated_at)
    values (gen_random_uuid(), 'Bad', '00000000-0000-0000-0000-000000000001', 'OOOO0000', 1, 1)$$,
  '23514', null, 'join codes reject look-alike characters');

-- anon holds no grants at all
set local role anon;
select throws_ok($$select * from public.houses$$, '42501', null, 'anon cannot read houses');
select throws_ok($$select * from public.house_secrets$$, '42501', null, 'anon cannot read secrets');
select throws_ok($$select * from public.house_members$$, '42501', null, 'anon cannot read members');

-- reader
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select results_eq($$select name from public.houses$$, array['Tuesday'], 'reader sees the house');
select is_empty($$select * from public.house_secrets$$, 'reader cannot see secrets');
select results_eq($$select user_id::text from public.house_members$$,
  array['00000000-0000-0000-0000-000000000002'], 'reader sees only their own membership');
select is_empty($$update public.houses set name = 'Hacked' returning name$$, 'reader cannot rename the house');
select throws_ok($$update public.houses set join_code = 'ZZZZZZZZ'$$, '42501', null, 'join_code is not directly updatable');
select throws_ok($$delete from public.houses$$, '42501', null, 'reader cannot delete houses');
select throws_ok($$select * from private.join_attempts$$, '42501', null, 'join attempts are not readable');
select throws_ok(
  $$insert into public.house_members (house_id, user_id, role)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000002', 'owner')$$,
  '42501', null, 'reader cannot promote themselves');

-- stranger
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select is_empty($$select * from public.houses$$, 'stranger sees no houses');
select is_empty($$select * from public.house_secrets$$, 'stranger sees no secrets');
select is_empty($$select * from public.house_members$$, 'stranger sees no members');
select throws_ok(
  $$insert into public.house_members (house_id, user_id, role)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000003', 'reader')$$,
  '42501', null, 'stranger cannot add themselves');

-- owner
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select results_eq(
  $$update public.houses set name = 'Tue Crew', currency_symbol = '€', updated_at = 2 returning name$$,
  array['Tue Crew'], 'owner renames the house');
select results_eq($$select count(*) from public.house_secrets$$, array[1::bigint], 'owner reads the secrets');
select results_eq($$select count(*) from public.house_members$$, array[2::bigint], 'owner sees every member');
select throws_ok($$update public.houses set owner_id = '00000000-0000-0000-0000-000000000003'$$,
  '42501', null, 'owner cannot reassign ownership directly');
select throws_ok(
  $$insert into public.houses (id, name, owner_id, join_code, created_at, updated_at)
    values (gen_random_uuid(), 'X', '00000000-0000-0000-0000-000000000001', 'XXXXXXXX', 1, 1)$$,
  '42501', null, 'houses are created only through create_house');
select throws_ok($$update public.house_secrets set invite_secret = 'mine'$$,
  '42501', null, 'secrets change only through RPCs');
select throws_ok($$delete from public.houses$$, '42501', null, 'owner cannot hard-delete a house');

reset role;
select ok(
  (select server_updated_at > current_setting('test.stamp0')::timestamptz
     from public.houses where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'an update moves server_updated_at');

select * from finish();
rollback;
```

- [ ] **Step 2: Run it to verify it fails**

Run: `supabase test db`
Expected: `houses_rls.test.sql` fails with `relation "public.houses" does not exist`.

- [ ] **Step 3: Write the migration**

`supabase/migrations/20260924120000_houses.sql`:

```sql
-- Shared houses: house rows, their secrets, membership and join attempts.
-- Membership and secrets change only through the SECURITY DEFINER functions
-- in the house_rpcs migration. Ledger tables are in the ledger migration.

create extension if not exists pgcrypto with schema extensions;

-- Not exposed by the API. authenticated needs usage to run the RLS helpers.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- owner_id has no FK to auth.users: deleting an account must never cascade
-- into ledger data. Account deletion (phase 5) soft-deletes owned houses itself.
create table public.houses (
  id uuid primary key,
  name text not null check (char_length(name) between 1 and 60),
  owner_id uuid not null,
  join_code text not null unique check (join_code ~ '^[A-HJ-NP-Z2-9]{8}$'),
  currency_symbol text not null default '$' check (char_length(currency_symbol) between 1 and 8),
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint,
  server_updated_at timestamptz not null default clock_timestamp()
);
create index houses_owner_idx on public.houses (owner_id);

create table public.house_secrets (
  house_id uuid primary key references public.houses (id),
  password_hash text not null,
  invite_secret text not null
);

create table public.house_members (
  house_id uuid not null references public.houses (id),
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null check (role in ('owner', 'reader')),
  joined_at timestamptz not null default now(),
  primary key (house_id, user_id)
);
create index house_members_user_idx on public.house_members (user_id);

create table private.join_attempts (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  at timestamptz not null default now(),
  ok boolean not null
);
create index join_attempts_user_at_idx on private.join_attempts (user_id, at);

create function private.stamp_house() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.server_updated_at := clock_timestamp();
  return new;
end;
$$;
create trigger stamp_row before insert or update on public.houses
  for each row execute function private.stamp_house();

-- RLS helpers. SECURITY DEFINER so a policy on house_members can check
-- membership without recursing into its own policy.
create function private.is_house_member(p_house_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.house_members m
    where m.house_id = p_house_id and m.user_id = (select auth.uid())
  );
$$;

create function private.is_house_owner(p_house_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.houses h
    where h.id = p_house_id and h.owner_id = (select auth.uid())
  );
$$;

revoke execute on function private.is_house_member(uuid), private.is_house_owner(uuid), private.stamp_house() from public;
grant execute on function private.is_house_member(uuid), private.is_house_owner(uuid) to authenticated;

alter table public.houses enable row level security;
alter table public.house_secrets enable row level security;
alter table public.house_members enable row level security;
alter table private.join_attempts enable row level security;

revoke all on public.houses, public.house_secrets, public.house_members from anon, authenticated;
revoke all on private.join_attempts from public, anon, authenticated;
grant select on public.houses, public.house_secrets, public.house_members to authenticated;
-- Only these columns: code, owner and ids never change through the API.
grant update (name, currency_symbol, updated_at, deleted_at) on public.houses to authenticated;

create policy "members read their houses" on public.houses
  for select to authenticated using (private.is_house_member(id));
create policy "owner updates house" on public.houses
  for update to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

create policy "owner reads secrets" on public.house_secrets
  for select to authenticated using (private.is_house_owner(house_id));

create policy "own membership, or owner sees all" on public.house_members
  for select to authenticated
  using (user_id = (select auth.uid()) or private.is_house_owner(house_id));
```

- [ ] **Step 4: Apply and run the tests**

Run: `supabase db reset && supabase test db`
Expected: `All tests successful.` If a `throws_ok` expecting `42501` reports a different code, check the `revoke` and `grant` lines. Do not loosen the test.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260924120000_houses.sql supabase/tests/houses_rls.test.sql
git commit -m "feat(supabase): houses, secrets, members tables with RLS

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Ledger tables, same-house integrity, RLS

**Files:**
- Create: `supabase/tests/ledger_rls.test.sql`
- Create: `supabase/tests/ledger_integrity.test.sql`
- Create: `supabase/migrations/20260924120100_ledger.sql`

**Interfaces:**
- Consumes: `public.houses`, `private.is_house_member(uuid)`, `private.is_house_owner(uuid)` from Task 2.
- Produces: `public.players`, `public.sessions`, `public.session_players`, `public.buyins`, `public.payments`. Columns match `src/db/schema.ts` plus `house_id uuid not null` and `server_updated_at timestamptz`. Index `<table>_pull_idx (house_id, server_updated_at, id)`. `authenticated` has `select, insert, update` (members select, owner writes) and no `delete`.

- [ ] **Step 1: Write the failing RLS test**

`supabase/tests/ledger_rls.test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- u1 owns A, u2 reads A, u3 owns B, u4 is a stranger.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'u1@test.local'),
  ('00000000-0000-0000-0000-000000000002', 'u2@test.local'),
  ('00000000-0000-0000-0000-000000000003', 'u3@test.local'),
  ('00000000-0000-0000-0000-000000000004', 'u4@test.local');
insert into public.houses (id, name, owner_id, join_code, created_at, updated_at) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A', '00000000-0000-0000-0000-000000000001', 'AAAAAAAA', 1, 1),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'B', '00000000-0000-0000-0000-000000000003', 'BBBBBBBB', 1, 1);
insert into public.house_members (house_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000001', 'owner'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000002', 'reader'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000003', 'owner');

insert into public.players (id, house_id, created_at, updated_at, name) values
  ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, 1, 'Ann'),
  ('11111111-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, 1, 'Bo'),
  ('11111111-0000-0000-0000-000000000003', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 1, 1, 'Cy');
insert into public.sessions (id, house_id, created_at, updated_at, date, default_buyin_cents) values
  ('22222222-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, 1, '2026-09-01', 2000);
insert into public.session_players (id, house_id, created_at, updated_at, session_id, player_id, cashout_cents) values
  ('33333333-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, 1,
   '22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001', 3000),
  ('33333333-0000-0000-0000-000000000002', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, 1,
   '22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000002', 1000);
insert into public.buyins (id, house_id, created_at, updated_at, session_player_id, amount_cents, at) values
  ('44444444-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, 1,
   '33333333-0000-0000-0000-000000000001', 2000, 1);
insert into public.payments (id, house_id, created_at, updated_at, session_id, from_player_id, to_player_id, amount_cents, at) values
  ('55555555-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, 1,
   '22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000002',
   '11111111-0000-0000-0000-000000000001', 1000, 1);

-- anon
set local role anon;
select throws_ok($$select * from public.players$$, '42501', null, 'anon cannot read players');

-- reader of A
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select results_eq($$select count(*) from public.players$$, array[2::bigint], 'reader sees A players only');
select results_eq($$select count(*) from public.sessions$$, array[1::bigint], 'reader sees A sessions');
select results_eq($$select count(*) from public.session_players$$, array[2::bigint], 'reader sees A session players');
select results_eq($$select count(*) from public.buyins$$, array[1::bigint], 'reader sees A buy-ins');
select results_eq($$select count(*) from public.payments$$, array[1::bigint], 'reader sees A payments');

select throws_ok(
  $$insert into public.players (id, house_id, created_at, updated_at, name)
    values (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, 1, 'Sneaky')$$,
  '42501', null, 'reader cannot insert players');
select throws_ok(
  $$insert into public.sessions (id, house_id, created_at, updated_at, date, default_buyin_cents)
    values (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, 1, '2026-09-02', 2000)$$,
  '42501', null, 'reader cannot insert sessions');
select throws_ok(
  $$insert into public.session_players (id, house_id, created_at, updated_at, session_id, player_id)
    values (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, 1,
            '22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001')$$,
  '42501', null, 'reader cannot insert session players');
select throws_ok(
  $$insert into public.buyins (id, house_id, created_at, updated_at, session_player_id, amount_cents, at)
    values (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, 1,
            '33333333-0000-0000-0000-000000000001', 500, 1)$$,
  '42501', null, 'reader cannot insert buy-ins');
select throws_ok(
  $$insert into public.payments (id, house_id, created_at, updated_at, session_id, from_player_id, to_player_id, amount_cents, at)
    values (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, 1,
            '22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001',
            '11111111-0000-0000-0000-000000000002', 100, 1)$$,
  '42501', null, 'reader cannot insert payments');

select is_empty($$update public.players set name = 'X' returning id$$, 'reader updates no players');
select is_empty($$update public.sessions set title = 'X' returning id$$, 'reader updates no sessions');
select is_empty($$update public.session_players set cashout_cents = 0 returning id$$, 'reader updates no session players');
select is_empty($$update public.buyins set amount_cents = 0 returning id$$, 'reader updates no buy-ins');
select is_empty($$update public.payments set amount_cents = 0 returning id$$, 'reader updates no payments');
select throws_ok($$delete from public.players$$, '42501', null, 'reader cannot delete');

-- stranger
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
select is_empty($$select * from public.players$$, 'stranger sees no players');
select is_empty($$select * from public.sessions$$, 'stranger sees no sessions');
select is_empty($$select * from public.session_players$$, 'stranger sees no session players');
select is_empty($$select * from public.buyins$$, 'stranger sees no buy-ins');
select is_empty($$select * from public.payments$$, 'stranger sees no payments');

-- owner of B against house A
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select results_eq($$select name from public.players$$, array['Cy'], 'owner of B sees only B');
select throws_ok(
  $$insert into public.players (id, house_id, created_at, updated_at, name)
    values (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, 1, 'Intruder')$$,
  '42501', null, 'owner of B cannot insert into A');
select is_empty($$update public.players set name = 'X' where house_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' returning id$$,
  'owner of B cannot update A rows');
select throws_ok(
  $$insert into public.players (id, house_id, created_at, updated_at, name)
    values ('11111111-0000-0000-0000-000000000001', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 1, 1, 'Mine')
    on conflict (id) do update set name = excluded.name$$,
  '42501', null, 'owner of B cannot hijack an A row by upserting its id');

-- owner of A
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select lives_ok(
  $$insert into public.players (id, house_id, created_at, updated_at, name, server_updated_at)
    values ('11111111-0000-0000-0000-000000000009', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 5, 5, 'Dee', '2000-01-01')$$,
  'owner inserts a player');
select results_eq($$update public.payments set amount_cents = 1500, updated_at = 6 returning amount_cents$$,
  array[1500::bigint], 'owner updates a payment');
select results_eq(
  $$update public.players set deleted_at = 7, updated_at = 7
    where id = '11111111-0000-0000-0000-000000000009' returning deleted_at$$,
  array[7::bigint], 'owner soft-deletes a player');
select throws_ok($$delete from public.players where id = '11111111-0000-0000-0000-000000000009'$$,
  '42501', null, 'owner cannot hard-delete');

reset role;
select ok(
  (select server_updated_at > '2020-01-01'::timestamptz from public.players
    where id = '11111111-0000-0000-0000-000000000009'),
  'server_updated_at is set by the server, not the client');
select results_eq(
  $$select name from public.players where id = '11111111-0000-0000-0000-000000000001'$$,
  array['Ann'], 'denied writes left the A row intact');

select * from finish();
rollback;
```

- [ ] **Step 2: Write the failing integrity test**

`supabase/tests/ledger_integrity.test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- u1 owns both A and B, so RLS allows every write; only integrity rules can stop them.
insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000001', 'u1@test.local');
insert into public.houses (id, name, owner_id, join_code, created_at, updated_at) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A', '00000000-0000-0000-0000-000000000001', 'AAAAAAAA', 1, 1),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'B', '00000000-0000-0000-0000-000000000001', 'BBBBBBBB', 1, 1);
insert into public.house_members (house_id, user_id, role) values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000001', 'owner'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '00000000-0000-0000-0000-000000000001', 'owner');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';

insert into public.players (id, house_id, created_at, updated_at, name) values
  ('11111111-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, 1, 'Ann'),
  ('11111111-0000-0000-0000-00000000000b', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 1, 1, 'Bea');
insert into public.sessions (id, house_id, created_at, updated_at, date, default_buyin_cents) values
  ('22222222-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, 1, '2026-09-01', 2000),
  ('22222222-0000-0000-0000-00000000000b', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 1, 1, '2026-09-01', 2000);
insert into public.session_players (id, house_id, created_at, updated_at, session_id, player_id) values
  ('33333333-0000-0000-0000-00000000000a', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, 1,
   '22222222-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-00000000000a');

select throws_ok(
  $$insert into public.session_players (id, house_id, created_at, updated_at, session_id, player_id)
    values (gen_random_uuid(), 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 1, 1,
            '22222222-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-00000000000b')$$,
  '23503', null, 'session player cannot point at a session in another house');
select throws_ok(
  $$insert into public.session_players (id, house_id, created_at, updated_at, session_id, player_id)
    values (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, 1,
            '22222222-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-00000000000b')$$,
  '23503', null, 'session player cannot use a player from another house');
select throws_ok(
  $$insert into public.buyins (id, house_id, created_at, updated_at, session_player_id, amount_cents, at)
    values (gen_random_uuid(), 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 1, 1,
            '33333333-0000-0000-0000-00000000000a', 500, 1)$$,
  '23503', null, 'buy-in cannot point at a session player in another house');
select throws_ok(
  $$insert into public.payments (id, house_id, created_at, updated_at, session_id, from_player_id, to_player_id, amount_cents, at)
    values (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, 1,
            '22222222-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-00000000000b',
            '11111111-0000-0000-0000-00000000000a', 100, 1)$$,
  '23503', null, 'payment cannot come from a player in another house');
select throws_ok(
  $$insert into public.payments (id, house_id, created_at, updated_at, session_id, from_player_id, to_player_id, amount_cents, at)
    values (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, 1,
            '22222222-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-00000000000a',
            '11111111-0000-0000-0000-00000000000b', 100, 1)$$,
  '23503', null, 'payment cannot go to a player in another house');
select throws_ok(
  $$insert into public.payments (id, house_id, created_at, updated_at, session_id, from_player_id, to_player_id, amount_cents, at)
    values (gen_random_uuid(), 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 1, 1,
            '22222222-0000-0000-0000-00000000000a', '11111111-0000-0000-0000-00000000000b',
            '11111111-0000-0000-0000-00000000000b', 100, 1)$$,
  '23503', null, 'payment cannot point at a session in another house');
select throws_ok(
  $$update public.players set house_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
    where id = '11111111-0000-0000-0000-00000000000b'$$,
  'P0001', 'house_id cannot change', 'a row cannot move to another house');

select lives_ok(
  $$insert into public.buyins (id, house_id, created_at, updated_at, session_player_id, amount_cents, at)
    values (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, 1,
            '33333333-0000-0000-0000-00000000000a', 500, 1)$$,
  'same-house child rows are accepted');

select * from finish();
rollback;
```

- [ ] **Step 3: Run both to verify they fail**

Run: `supabase test db`
Expected: `ledger_rls` and `ledger_integrity` fail with `relation "public.players" does not exist`. `houses_rls` still passes.

- [ ] **Step 4: Write the migration**

`supabase/migrations/20260924120100_ledger.sql`:

```sql
-- Ledger tables mirror the local SQLite tables in src/db/schema.ts, plus
-- house_id and server_updated_at. Timestamps stay epoch milliseconds, as on
-- the phone, so push and pull copy rows without conversion.
--
-- Same-house integrity: each parent has unique (id, house_id) and each child
-- references (parent_id, house_id), so a child can never point into another
-- house. house_id itself is immutable (stamp_ledger_row).

create function private.stamp_ledger_row() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.house_id is distinct from old.house_id then
    raise exception 'house_id cannot change';
  end if;
  -- clock_timestamp, not now(): rows in one push get distinct pull cursors.
  new.server_updated_at := clock_timestamp();
  return new;
end;
$$;
revoke execute on function private.stamp_ledger_row() from public;

create table public.players (
  id uuid primary key,
  house_id uuid not null references public.houses (id),
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint,
  name text not null,
  color_seed integer not null default 0,
  archived integer not null default 0,
  server_updated_at timestamptz not null default clock_timestamp(),
  unique (id, house_id)
);

create table public.sessions (
  id uuid primary key,
  house_id uuid not null references public.houses (id),
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint,
  date text not null,
  title text,
  default_buyin_cents bigint not null,
  notes text,
  server_updated_at timestamptz not null default clock_timestamp(),
  unique (id, house_id)
);

create table public.session_players (
  id uuid primary key,
  house_id uuid not null references public.houses (id),
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint,
  session_id uuid not null,
  player_id uuid not null,
  cashout_cents bigint,
  sort_order integer not null default 0,
  server_updated_at timestamptz not null default clock_timestamp(),
  unique (id, house_id),
  foreign key (session_id, house_id) references public.sessions (id, house_id),
  foreign key (player_id, house_id) references public.players (id, house_id)
);

create table public.buyins (
  id uuid primary key,
  house_id uuid not null references public.houses (id),
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint,
  session_player_id uuid not null,
  amount_cents bigint not null,
  at bigint not null,
  server_updated_at timestamptz not null default clock_timestamp(),
  foreign key (session_player_id, house_id) references public.session_players (id, house_id)
);

create table public.payments (
  id uuid primary key,
  house_id uuid not null references public.houses (id),
  created_at bigint not null,
  updated_at bigint not null,
  deleted_at bigint,
  session_id uuid not null,
  from_player_id uuid not null,
  to_player_id uuid not null,
  amount_cents bigint not null,
  note text,
  at bigint not null,
  server_updated_at timestamptz not null default clock_timestamp(),
  foreign key (session_id, house_id) references public.sessions (id, house_id),
  foreign key (from_player_id, house_id) references public.players (id, house_id),
  foreign key (to_player_id, house_id) references public.players (id, house_id)
);

-- Same pull index, trigger, grants and policies on every ledger table.
-- Members read; only the house owner inserts or updates; nobody deletes.
do $$
declare
  t text;
begin
  foreach t in array array['players', 'sessions', 'session_players', 'buyins', 'payments'] loop
    execute format('create index %1$s_pull_idx on public.%1$I (house_id, server_updated_at, id)', t);
    execute format('create trigger stamp_row before insert or update on public.%I
                    for each row execute function private.stamp_ledger_row()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);
    execute format('create policy "members read" on public.%I for select to authenticated
                    using (private.is_house_member(house_id))', t);
    execute format('create policy "owner inserts" on public.%I for insert to authenticated
                    with check (private.is_house_owner(house_id))', t);
    execute format('create policy "owner updates" on public.%I for update to authenticated
                    using (private.is_house_owner(house_id))
                    with check (private.is_house_owner(house_id))', t);
  end loop;
end;
$$;
```

- [ ] **Step 5: Apply and run the tests**

Run: `supabase db reset && supabase test db`
Expected: `All tests successful.` (setup, houses_rls, ledger_integrity, ledger_rls).

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260924120100_ledger.sql supabase/tests/ledger_rls.test.sql supabase/tests/ledger_integrity.test.sql
git commit -m "feat(supabase): ledger tables with owner-only writes and same-house FKs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: `create_house`, `join_house`, `join_house_by_link`

**Files:**
- Create: `supabase/tests/rpc_create_join.test.sql`
- Create: `supabase/migrations/20260924120200_house_rpcs.sql`

**Interfaces:**
- Consumes: Task 2 tables, `houses_join_code_key`, `private.join_attempts`.
- Produces (callable by `authenticated` only):
  - `public.create_house(p_id uuid, p_name text, p_currency text, p_password text) returns table (join_code text, invite_secret text)`. Idempotent for the same owner: a retry keeps the code and secret and takes the new password. Raises `not_authenticated`, `weak_password` (fewer than 4 characters), `forbidden` (id owned by someone else), `house_deleted`.
  - `public.join_house(p_code text, p_password text) returns jsonb`. The code is case-insensitive and ignores spaces and hyphens. Returns the shapes in Design note 1.
  - `public.join_house_by_link(p_house_id uuid, p_secret text) returns jsonb`. Same shapes, never `locked`.
  - Private helpers: `private.new_join_code() returns text`, `private.new_invite_secret() returns text` (43 url-safe base64 characters), `private.now_ms() returns bigint`.

- [ ] **Step 1: Write the failing test**

`supabase/tests/rpc_create_join.test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'u1@test.local'),
  ('00000000-0000-0000-0000-000000000002', 'u2@test.local'),
  ('00000000-0000-0000-0000-000000000003', 'u3@test.local'),
  ('00000000-0000-0000-0000-000000000004', 'u4@test.local'),
  ('00000000-0000-0000-0000-000000000005', 'u5@test.local');

-- anon cannot call anything
set local role anon;
select throws_ok(
  $$select * from public.create_house('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'X', '£', 'hunter22')$$,
  '42501', null, 'anon cannot create houses');
select throws_ok($$select public.join_house('AAAAAAAA', 'x')$$, '42501', null, 'anon cannot join');

-- create
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select throws_ok(
  $$select * from public.create_house('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Tuesday Crew', '£', 'abc')$$,
  'P0001', 'weak_password', 'passwords shorter than 4 characters are rejected');
select ok(
  (select char_length(join_code) = 8 and char_length(invite_secret) = 43
     from public.create_house('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Tuesday Crew', '£', 'hunter22')),
  'create_house returns an 8-char code and a 43-char secret');

reset role;
select set_config('test.code', (select join_code from public.houses where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), true);
select set_config('test.secret', (select invite_secret from public.house_secrets where house_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), true);
select results_eq(
  $$select owner_id::text, name, currency_symbol from public.houses where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  $$values ('00000000-0000-0000-0000-000000000001', 'Tuesday Crew', '£')$$,
  'house row belongs to the caller');
select results_eq(
  $$select user_id::text, role from public.house_members where house_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  $$values ('00000000-0000-0000-0000-000000000001', 'owner')$$,
  'caller is the owner member');
select ok(
  (select password_hash like '$2a$08$%' from public.house_secrets where house_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'password is stored as a bcrypt hash');
select ok(current_setting('test.code') ~ '^[A-HJ-NP-Z2-9]{8}$', 'join code uses the no-look-alike alphabet');

-- retry by the owner keeps code and secret, takes the new password
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select results_eq(
  $$select join_code, invite_secret from public.create_house('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Tuesday Crew', '£', 'newpass1')$$,
  $$values (current_setting('test.code'), current_setting('test.secret'))$$,
  'create_house retry is idempotent');

-- someone else cannot claim the id
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select throws_ok(
  $$select * from public.create_house('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Mine', '£', 'hunter22')$$,
  'P0001', 'forbidden', 'another user cannot take over a house id');

-- join by code: normalised input, new password
select is(
  (public.join_house(lower(substr(current_setting('test.code'), 1, 4) || '-' || substr(current_setting('test.code'), 5)), 'newpass1')) ->> 'ok',
  'true', 'join_house accepts lower-case code with a hyphen');
select results_eq($$select name from public.houses$$, array['Tuesday Crew'], 'the new reader sees the house');
select is(
  (public.join_house(current_setting('test.code'), 'newpass1')) -> 'house' ->> 'id',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'joining twice is harmless and returns the house');

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select is((public.join_house(current_setting('test.code'), 'newpass1')) ->> 'ok', 'true', 'owner can join their own house');

reset role;
select results_eq(
  $$select user_id::text, role from public.house_members
    where house_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' order by user_id$$,
  $$values ('00000000-0000-0000-0000-000000000001', 'owner'), ('00000000-0000-0000-0000-000000000002', 'reader')$$,
  'one reader row added; owner keeps the owner role');

-- lockout and identical errors (u3)
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select is(public.join_house(current_setting('test.code'), 'wrong'), '{"ok": false, "error": "invalid"}'::jsonb, 'wrong password is invalid');
select is(public.join_house('ZZZZZZZZ', 'newpass1'), '{"ok": false, "error": "invalid"}'::jsonb, 'wrong code gives the identical response');
select is(public.join_house(current_setting('test.code'), 'wrong'), '{"ok": false, "error": "invalid"}'::jsonb, 'failure 3');
select is(public.join_house(current_setting('test.code'), 'wrong'), '{"ok": false, "error": "invalid"}'::jsonb, 'failure 4');
select is(public.join_house(current_setting('test.code'), 'wrong'), '{"ok": false, "error": "invalid"}'::jsonb, 'failure 5');
select is(public.join_house(current_setting('test.code'), 'newpass1'),
  '{"ok": false, "error": "locked", "minutes": 15}'::jsonb, 'attempt 6 is locked even with the right password');

reset role;
select results_eq(
  $$select count(*) from private.join_attempts where user_id = '00000000-0000-0000-0000-000000000003' and not ok$$,
  array[5::bigint], 'failed attempts are recorded (not rolled back)');
select is_empty(
  $$select 1 from public.house_members where user_id = '00000000-0000-0000-0000-000000000003'$$,
  'the locked-out user did not join');

-- lockout is per user
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
select is((public.join_house(current_setting('test.code'), 'newpass1')) ->> 'ok', 'true', 'another user is not locked out');

-- join by link
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005';
select is(public.join_house_by_link('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'not-the-secret'),
  '{"ok": false, "error": "invalid"}'::jsonb, 'a wrong link secret is invalid');
select is((public.join_house_by_link('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', current_setting('test.secret'))) ->> 'ok',
  'true', 'the right link secret joins');
select results_eq($$select role from public.house_members$$, array['reader'], 'link joiner is a reader');

select * from finish();
rollback;
```

- [ ] **Step 2: Run it to verify it fails**

Run: `supabase test db`
Expected: `rpc_create_join` fails with `function public.create_house(...) does not exist`. Earlier files pass.

- [ ] **Step 3: Write the migration (create and join part)**

`supabase/migrations/20260924120200_house_rpcs.sql`:

```sql
-- House RPCs. SECURITY DEFINER: they write house_members, house_secrets and
-- join_attempts, which authenticated cannot touch directly. Each one checks
-- the caller itself. Callable by authenticated only.

create function private.new_join_code() returns text
language plpgsql volatile set search_path = '' as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- 32 chars, no 0/O/1/I
  bytes bytea := extensions.gen_random_bytes(8);
  code text := '';
begin
  for i in 0..7 loop
    code := code || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1); -- 256 % 32 = 0: unbiased
  end loop;
  return code;
end;
$$;

-- 32 random bytes, url-safe base64 without padding (43 chars).
create function private.new_invite_secret() returns text
language sql volatile set search_path = '' as $$
  select translate(encode(extensions.gen_random_bytes(32), 'base64'), '+/=', '-_');
$$;

create function private.now_ms() returns bigint
language sql stable set search_path = '' as $$
  select (extract(epoch from now()) * 1000)::bigint;
$$;

revoke execute on function private.new_join_code(), private.new_invite_secret(), private.now_ms() from public;

create function public.create_house(p_id uuid, p_name text, p_currency text, p_password text)
returns table (join_code text, invite_secret text)
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_deleted bigint;
  v_constraint text;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_password is null or char_length(p_password) < 4 then raise exception 'weak_password'; end if;

  select h.owner_id, h.deleted_at into v_owner, v_deleted from public.houses h where h.id = p_id;
  if found then
    if v_owner <> v_uid then raise exception 'forbidden'; end if;
    if v_deleted is not null then raise exception 'house_deleted'; end if;
    -- A retry after a lost response: keep code and link, take the new password.
    update public.house_secrets s
      set password_hash = extensions.crypt(p_password, extensions.gen_salt('bf', 8))
      where s.house_id = p_id;
  else
    loop
      begin
        insert into public.houses (id, name, owner_id, join_code, currency_symbol, created_at, updated_at)
        values (p_id, p_name, v_uid, private.new_join_code(), p_currency, private.now_ms(), private.now_ms());
        exit;
      exception when unique_violation then
        get stacked diagnostics v_constraint = constraint_name;
        if v_constraint <> 'houses_join_code_key' then raise; end if;
        -- join code collision: draw again
      end;
    end loop;
    insert into public.house_secrets (house_id, password_hash, invite_secret)
    values (p_id, extensions.crypt(p_password, extensions.gen_salt('bf', 8)), private.new_invite_secret());
    insert into public.house_members (house_id, user_id, role) values (p_id, v_uid, 'owner');
  end if;

  return query
    select h.join_code, s.invite_secret
    from public.houses h join public.house_secrets s on s.house_id = h.id
    where h.id = p_id;
end;
$$;

-- Returns jsonb instead of raising: a raise would roll back the failed
-- attempt row and the lockout could never count.
create function public.join_house(p_code text, p_password text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_password text := coalesce(p_password, '');
  v_unlock timestamptz;
  v_house public.houses;
  v_hash text;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  delete from private.join_attempts a where a.user_id = v_uid and a.at < now() - interval '1 day';

  -- Locked while 5 failures sit inside the last 15 minutes; unlocks when the 5th newest ages out.
  select a.at + interval '15 minutes' into v_unlock
  from private.join_attempts a
  where a.user_id = v_uid and not a.ok and a.at > now() - interval '15 minutes'
  order by a.at desc
  offset 4 limit 1;
  if v_unlock is not null then
    return jsonb_build_object('ok', false, 'error', 'locked',
      'minutes', ceil(extract(epoch from (v_unlock - now())) / 60)::int);
  end if;

  select h.* into v_house from public.houses h where h.join_code = v_code and h.deleted_at is null;
  select s.password_hash into v_hash from public.house_secrets s where s.house_id = v_house.id;

  if v_hash is null then
    -- Spend one bcrypt anyway so a wrong code takes as long as a wrong password.
    perform extensions.crypt(v_password, extensions.gen_salt('bf', 8));
  end if;
  if v_hash is null or extensions.crypt(v_password, v_hash) <> v_hash then
    insert into private.join_attempts (user_id, ok) values (v_uid, false);
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  insert into private.join_attempts (user_id, ok) values (v_uid, true);
  insert into public.house_members (house_id, user_id, role) values (v_house.id, v_uid, 'reader')
    on conflict (house_id, user_id) do nothing;
  return jsonb_build_object('ok', true, 'house', to_jsonb(v_house));
end;
$$;

create function public.join_house_by_link(p_house_id uuid, p_secret text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
#variable_conflict use_column
declare
  v_uid uuid := auth.uid();
  v_house public.houses;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select h.* into v_house
  from public.houses h join public.house_secrets s on s.house_id = h.id
  where h.id = p_house_id and h.deleted_at is null and s.invite_secret = p_secret;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  insert into public.house_members (house_id, user_id, role) values (v_house.id, v_uid, 'reader')
    on conflict (house_id, user_id) do nothing;
  return jsonb_build_object('ok', true, 'house', to_jsonb(v_house));
end;
$$;

revoke execute on function
  public.create_house(uuid, text, text, text),
  public.join_house(text, text),
  public.join_house_by_link(uuid, text)
from public, anon;
grant execute on function
  public.create_house(uuid, text, text, text),
  public.join_house(text, text),
  public.join_house_by_link(uuid, text)
to authenticated;
```

- [ ] **Step 4: Apply and run the tests**

Run: `supabase db reset && supabase test db`
Expected: `All tests successful.`
If `create_house` fails with "column reference ... is ambiguous", the `#variable_conflict use_column` line is missing or not the first line of the body.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260924120200_house_rpcs.sql supabase/tests/rpc_create_join.test.sql
git commit -m "feat(supabase): create_house and join RPCs with lockout

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Owner and member management RPCs

**Files:**
- Create: `supabase/tests/rpc_manage.test.sql`
- Modify: `supabase/migrations/20260924120200_house_rpcs.sql` (append; this migration has not reached the hosted project yet, so editing it is safe)

**Interfaces:**
- Consumes: `create_house`, `join_house`, `join_house_by_link`, `private.is_house_owner`, `private.new_invite_secret` from Tasks 2 and 4.
- Produces (callable by `authenticated` only; errors raise `P0001` with the message shown):
  - `public.reset_house_password(p_house_id uuid, p_password text) returns void` (`forbidden`, `weak_password`)
  - `public.reset_house_link(p_house_id uuid) returns text` (the new secret) (`forbidden`)
  - `public.remove_member(p_house_id uuid, p_user_id uuid) returns void` (`forbidden`, `owner_cannot_leave`)
  - `public.leave_house(p_house_id uuid) returns void` (`owner_cannot_leave`)

- [ ] **Step 1: Write the failing test**

`supabase/tests/rpc_manage.test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'u1@test.local'),
  ('00000000-0000-0000-0000-000000000002', 'u2@test.local'),
  ('00000000-0000-0000-0000-000000000003', 'u3@test.local'),
  ('00000000-0000-0000-0000-000000000004', 'u4@test.local'),
  ('00000000-0000-0000-0000-000000000005', 'u5@test.local');

-- u1 creates A; u2 and u3 join as readers.
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select ok((select count(*) = 1 from public.create_house('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Tuesday Crew', '£', 'hunter22')),
  'setup: u1 creates A');
reset role;
select set_config('test.code', (select join_code from public.houses where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), true);
select set_config('test.secret', (select invite_secret from public.house_secrets where house_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), true);
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select is((public.join_house(current_setting('test.code'), 'hunter22')) ->> 'ok', 'true', 'setup: u2 joins');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select is((public.join_house(current_setting('test.code'), 'hunter22')) ->> 'ok', 'true', 'setup: u3 joins');

-- readers and strangers cannot manage
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select throws_ok($$select public.reset_house_password('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'mine1234')$$,
  'P0001', 'forbidden', 'reader cannot reset the password');
select throws_ok($$select public.reset_house_link('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')$$,
  'P0001', 'forbidden', 'reader cannot reset the link');
select throws_ok($$select public.remove_member('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000003')$$,
  'P0001', 'forbidden', 'reader cannot remove members');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005';
select throws_ok($$select public.remove_member('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000002')$$,
  'P0001', 'forbidden', 'stranger cannot remove members');

-- owner resets the password
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select throws_ok($$select public.reset_house_password('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'abc')$$,
  'P0001', 'weak_password', 'reset rejects a short password');
select lives_ok($$select public.reset_house_password('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'another1')$$,
  'owner resets the password');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
select is(public.join_house(current_setting('test.code'), 'hunter22'),
  '{"ok": false, "error": "invalid"}'::jsonb, 'the old password stops working');
select is((public.join_house(current_setting('test.code'), 'another1')) ->> 'ok', 'true', 'the new password works');

-- owner resets the link
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select set_config('test.secret2', public.reset_house_link('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), true);
select isnt(current_setting('test.secret2'), current_setting('test.secret'), 'reset_house_link returns a new secret');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000005';
select is(public.join_house_by_link('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', current_setting('test.secret')),
  '{"ok": false, "error": "invalid"}'::jsonb, 'the old link stops working');
select is((public.join_house_by_link('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', current_setting('test.secret2'))) ->> 'ok',
  'true', 'the new link works');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select results_eq($$select name from public.houses$$, array['Tuesday Crew'], 'rotating secrets keeps existing members');

-- owner removes a member; cannot remove themselves
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select lives_ok($$select public.remove_member('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000003')$$,
  'owner removes a reader');
select throws_ok($$select public.remove_member('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '00000000-0000-0000-0000-000000000001')$$,
  'P0001', 'owner_cannot_leave', 'owner cannot remove themselves');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select is_empty($$select * from public.houses$$, 'a removed reader loses access');

-- leaving
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select lives_ok($$select public.leave_house('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')$$, 'reader leaves');
select is_empty($$select * from public.houses$$, 'a reader who left loses access');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select throws_ok($$select public.leave_house('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')$$,
  'P0001', 'owner_cannot_leave', 'owner cannot leave their own house');

-- soft-deleted house: no new joins, existing readers see it closed
select lives_ok($$update public.houses set deleted_at = 99, updated_at = 99 where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'$$,
  'owner soft-deletes the house');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000004';
select results_eq($$select deleted_at from public.houses$$, array[99::bigint], 'an existing reader sees the house closed');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select is(public.join_house(current_setting('test.code'), 'another1'),
  '{"ok": false, "error": "invalid"}'::jsonb, 'a deleted house cannot be joined by code');
select is(public.join_house_by_link('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', current_setting('test.secret2')),
  '{"ok": false, "error": "invalid"}'::jsonb, 'a deleted house cannot be joined by link');

-- anon
set local role anon;
select throws_ok($$select public.leave_house('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')$$, '42501', null, 'anon cannot call leave_house');

select * from finish();
rollback;
```

- [ ] **Step 2: Run it to verify it fails**

Run: `supabase test db`
Expected: `rpc_manage` fails with `function public.reset_house_password(...) does not exist`.

- [ ] **Step 3: Append the management functions to the RPC migration**

Append to `supabase/migrations/20260924120200_house_rpcs.sql`:

```sql

create function public.reset_house_password(p_house_id uuid, p_password text)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_house_owner(p_house_id) then raise exception 'forbidden'; end if;
  if p_password is null or char_length(p_password) < 4 then raise exception 'weak_password'; end if;
  update public.house_secrets s
    set password_hash = extensions.crypt(p_password, extensions.gen_salt('bf', 8))
    where s.house_id = p_house_id;
end;
$$;

-- Old links stop working; existing members stay.
create function public.reset_house_link(p_house_id uuid)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_secret text := private.new_invite_secret();
begin
  if not private.is_house_owner(p_house_id) then raise exception 'forbidden'; end if;
  update public.house_secrets s set invite_secret = v_secret where s.house_id = p_house_id;
  return v_secret;
end;
$$;

create function public.remove_member(p_house_id uuid, p_user_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not private.is_house_owner(p_house_id) then raise exception 'forbidden'; end if;
  if p_user_id = auth.uid() then raise exception 'owner_cannot_leave'; end if;
  delete from public.house_members m
    where m.house_id = p_house_id and m.user_id = p_user_id and m.role = 'reader';
end;
$$;

-- Ownership transfer is out of scope for v1, so the owner cannot leave.
create function public.leave_house(p_house_id uuid)
returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if private.is_house_owner(p_house_id) then raise exception 'owner_cannot_leave'; end if;
  delete from public.house_members m
    where m.house_id = p_house_id and m.user_id = auth.uid();
end;
$$;

revoke execute on function
  public.reset_house_password(uuid, text),
  public.reset_house_link(uuid),
  public.remove_member(uuid, uuid),
  public.leave_house(uuid)
from public, anon;
grant execute on function
  public.reset_house_password(uuid, text),
  public.reset_house_link(uuid),
  public.remove_member(uuid, uuid),
  public.leave_house(uuid)
to authenticated;
```

- [ ] **Step 4: Apply and run the full suite**

Run: `supabase db reset && supabase test db`
Expected: `All tests successful.` (six files).

- [ ] **Step 5: Lint the schema**

Run: `supabase db lint --level warning`
Expected: no errors. Fix any warnings about the new functions (for example a mutable `search_path`) in the migration. Record any warning you choose not to fix in the commit message, with the reason.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260924120200_house_rpcs.sql supabase/tests/rpc_manage.test.sql
git commit -m "feat(supabase): reset password/link, remove member, leave house RPCs

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Push to the hosted project and hand off

This task needs Steven. `supabase login` opens a browser, and `supabase link` asks for the database password. The controller runs the non-interactive steps and asks Steven to run the interactive ones in the terminal panel.

**Files:**
- Modify: `docs/superpowers/handoffs/2026-09-24-shared-houses-handoff.md` (mark phase 2 done, add the phase 3 notes below)

**Interfaces:**
- Consumes: all migrations from Tasks 2–5.
- Produces: the hosted project schema matching `supabase/migrations/`.

- [ ] **Step 1: Confirm the prerequisites with Steven**

Ask whether (a) the hosted project exists, (b) Authentication → Sign In / Providers → **Anonymous sign-ins** is on, and (c) Steven has the project ref (the `xxxx` in `https://xxxx.supabase.co`). Stop here until all three are yes.

- [ ] **Step 2: Steven logs in and links**

Steven runs, in the repo root:

```bash
supabase login
supabase link --project-ref <project-ref>
```

Expected: `Finished supabase link.` `supabase/.temp/` is gitignored by `supabase/.gitignore`. Confirm with `git status` that it is not listed.

- [ ] **Step 3: Dry run**

Run: `supabase db push --dry-run`
Expected: lists exactly the three migrations `20260924120000_houses.sql`, `20260924120100_ledger.sql`, `20260924120200_house_rpcs.sql`. Show the list to Steven and get a clear yes before Step 4. This writes to the live project.

- [ ] **Step 4: Push**

Run: `supabase db push`
Then: `supabase migration list`
Expected: all three versions appear in both the Local and Remote columns.

- [ ] **Step 5: Check the hosted security advisors**

Ask Steven to open Dashboard → Advisors → Security Advisor. Expected: no errors for `houses`, `house_secrets`, `house_members` or the ledger tables. RLS must show as enabled on all of them. Report any finding before moving on.

- [ ] **Step 6: Final local verification**

Run: `supabase test db && npx jest && npx tsc --noEmit`
Expected: all pgTAP files pass, 126 Jest tests pass, tsc prints nothing.

- [ ] **Step 7: Update the handoff**

In `docs/superpowers/handoffs/2026-09-24-shared-houses-handoff.md`, mark Phase 2 as done (commit hash, hosted push date) and add a "Phase 3 must know" section with:
- the join RPC `jsonb` shapes and the RPC error messages (Design note 1);
- push the house row with `update` (no insert grant on `houses`); push ledger rows with upsert in FK order;
- page pulls by `(server_updated_at, id)`;
- `create_house` is safe to retry;
- the project URL and publishable key go in EAS env (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_KEY`), never in git.

Stop the local stack when done: `supabase stop`.

- [ ] **Step 8: Commit**

```bash
git add docs/superpowers/handoffs/2026-09-24-shared-houses-handoff.md
git commit -m "docs: phase 2 done, phase 3 notes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Do not `git push` unless Steven asks.

---

## Spec coverage check

| Spec item | Task |
|---|---|
| §1.1 `houses` (code alphabet, currency, soft delete) | 2 |
| §1.1 `house_secrets` bcrypt + 32-byte secret, owner-only | 2, 4 |
| §1.1 `house_members` roles, PK | 2 |
| §1.1 `join_attempts` | 2 (table), 4 (use) |
| §1.1 ledger tables + `house_id` + trigger `server_updated_at` | 3 |
| §1.1 RLS: members select, owner insert/update, no delete, secrets owner-only | 2, 3 |
| Handoff item 4: same-house parent/player refs | 3 (composite FKs) |
| §2.2 `create_house` returns code + secret | 4 |
| §2.3 `join_house` lockout, one `invalid` error | 4 (jsonb, Design note 1) |
| §2.4 `join_house_by_link` | 4 |
| §2.6 reset password, reset link, remove member, leave | 5 |
| §5.1 migrations in git, anonymous sign-ins | 1, 6 |
| §6.2 all five pgTAP scenarios | 2, 3, 4, 5 |
| §5.2 account deletion RPC | Phase 5 (decided) |
