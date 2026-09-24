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
