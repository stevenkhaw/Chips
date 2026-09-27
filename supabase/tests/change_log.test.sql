begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table('public', 'ledger_changes', 'ledger_changes exists');
select is((select relrowsecurity from pg_class where oid = 'public.ledger_changes'::regclass), true,
  'RLS is enabled on ledger_changes');

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'u1@test.local'),
  ('00000000-0000-0000-0000-000000000002', 'u2@test.local'),
  ('00000000-0000-0000-0000-000000000003', 'u3@test.local');

-- u1 creates A, u3 creates B, u2 joins A as a reader (all through the RPCs, as the app does).
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select ok((select count(*) = 1 from public.create_house('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'A', '$', 'hunter22')),
  'setup: u1 creates A');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select ok((select count(*) = 1 from public.create_house('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'B', '$', 'hunter22')),
  'setup: u3 creates B');
reset role;
select set_config('test.code', (select join_code from public.houses where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'), true);

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select is((public.join_house(current_setting('test.code'), 'hunter22', 'Rae')) ->> 'ok', 'true', 'setup: u2 joins A');

reset role;
select is(
  (select row(op, actor_id, after ->> 'role', after ->> 'display_name')::text from public.ledger_changes
    where table_name = 'house_members' and row_id = '00000000-0000-0000-0000-000000000002'),
  row('insert', '00000000-0000-0000-0000-000000000002'::uuid, 'reader', 'Rae')::text,
  'a join logs a house_members insert by the joining user');

-- Ledger inserts and updates by the owner.
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
insert into public.players (id, house_id, created_at, updated_at, name) values
  ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, 1, 'Ann');

reset role;
select is(
  (select row(op, actor_id, before is null, after ->> 'name', after ? 'server_updated_at')::text from public.ledger_changes
    where table_name = 'players'),
  row('insert', '00000000-0000-0000-0000-000000000001'::uuid, true, 'Ann', false)::text,
  'an insert logs the full row (without server_updated_at), actor and no before');

set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
update public.players set name = 'Annie', updated_at = 2 where id = '11111111-0000-0000-0000-000000000001';

reset role;
select is(
  (select row(before, after)::text from public.ledger_changes where table_name = 'players' and op = 'update'),
  row('{"name": "Ann"}'::jsonb, '{"name": "Annie"}'::jsonb)::text,
  'an update logs only the changed columns (updated_at ignored)');

-- A push retry re-upserts an identical row: nothing new is logged.
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
insert into public.players (id, house_id, created_at, updated_at, name) values
  ('11111111-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, 2, 'Annie')
  on conflict (id) do update set name = excluded.name, updated_at = excluded.updated_at;

reset role;
select is((select count(*) from public.ledger_changes where table_name = 'players'), 2::bigint,
  'an identical re-upsert logs nothing');

-- Soft delete of a buy-in.
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
insert into public.sessions (id, house_id, created_at, updated_at, date, default_buyin_cents) values
  ('22222222-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, 1, '2026-09-27', 2000);
insert into public.session_players (id, house_id, created_at, updated_at, session_id, player_id) values
  ('33333333-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, 1,
   '22222222-0000-0000-0000-000000000001', '11111111-0000-0000-0000-000000000001');
insert into public.buyins (id, house_id, created_at, updated_at, session_player_id, amount_cents, at) values
  ('44444444-0000-0000-0000-000000000001', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, 1,
   '33333333-0000-0000-0000-000000000001', 2000, 1);
update public.buyins set deleted_at = 5, updated_at = 5 where id = '44444444-0000-0000-0000-000000000001';

reset role;
select is(
  (select row(op, before, after)::text from public.ledger_changes where table_name = 'buyins' and op = 'update'),
  row('update', '{"deleted_at": null}'::jsonb, '{"deleted_at": 5}'::jsonb)::text,
  'a soft delete logs deleted_at');

-- House rename.
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
update public.houses set name = 'Tuesday Crew', updated_at = 9 where id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

reset role;
select is(
  (select row(house_id, row_id, after)::text from public.ledger_changes where table_name = 'houses' and op = 'update'),
  row('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, '{"name": "Tuesday Crew"}'::jsonb)::text,
  'a house rename logs against the house');

-- Password reset is logged, redacted.
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select lives_ok($$select public.reset_house_password('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'another1')$$, 'owner resets the password');
select lives_ok($$select public.reset_house_link('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')$$, 'owner resets the link');

reset role;
select is(
  (select array_agg(after order by id) from public.ledger_changes where table_name = 'house_secrets'),
  array['{"password_hash": "changed"}'::jsonb, '{"invite_secret": "changed"}'::jsonb],
  'secret resets are logged with values redacted');
select ok(
  (select bool_and(coalesce(before::text, '') not like '%$2%' and coalesce(after::text, '') not like '%$2%'
                   and coalesce(before::text, '') not like '%' || s.invite_secret || '%'
                   and coalesce(after::text, '') not like '%' || s.invite_secret || '%')
   from public.ledger_changes, public.house_secrets s where s.house_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'no password hash or invite secret appears in the log');

-- Leave logs a delete by the leaver.
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select lives_ok($$select public.leave_house('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')$$, 'u2 leaves A');

reset role;
select is(
  (select row(actor_id, before ->> 'role', after is null)::text from public.ledger_changes
    where table_name = 'house_members' and op = 'delete'),
  row('00000000-0000-0000-0000-000000000002'::uuid, 'reader', true)::text,
  'leaving logs a house_members delete');

-- Rejoin so u2 is a reader for the access checks.
set local role authenticated;
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select is((public.join_house(current_setting('test.code'), 'another1')) ->> 'ok', 'true', 'u2 rejoins A');

-- Access: the owner reads their own house's entries only.
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select ok((select count(*) > 0 from public.ledger_changes), 'owner reads entries');
select is((select count(*) from public.ledger_changes where house_id <> 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  0::bigint, 'owner of A sees nothing of B');
set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000003';
select is((select count(*) from public.ledger_changes where house_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  0::bigint, 'owner of B sees nothing of A');
select ok((select count(*) > 0 from public.ledger_changes), 'owner of B reads their own entries');

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000002';
select is((select count(*) from public.ledger_changes), 0::bigint, 'a reader sees no entries');
select throws_ok(
  $$insert into public.ledger_changes (house_id, table_name, row_id, op)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'players', gen_random_uuid(), 'insert')$$,
  '42501', null, 'authenticated cannot insert into the log');

set local request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001';
select throws_ok($$update public.ledger_changes set op = 'insert'$$, '42501', null, 'owner cannot update the log');
select throws_ok($$delete from public.ledger_changes$$, '42501', null, 'owner cannot delete from the log');

set local role anon;
select throws_ok($$select * from public.ledger_changes$$, '42501', null, 'anon cannot read the log');

set local role service_role;
select throws_ok($$update public.ledger_changes set op = 'insert'$$, '42501', null, 'service_role cannot update the log');
select throws_ok($$delete from public.ledger_changes$$, '42501', null, 'service_role cannot delete from the log');

select * from finish();
rollback;
