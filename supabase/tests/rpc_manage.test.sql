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

set local role service_role;
select throws_ok($$select public.reset_house_link('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')$$, '42501', null, 'service_role cannot call reset_house_link');

select * from finish();
rollback;
