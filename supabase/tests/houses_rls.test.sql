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
