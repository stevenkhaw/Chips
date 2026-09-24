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
  $$update public.players set house_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
    where id = '11111111-0000-0000-0000-00000000000b'$$,
  'P0001', 'house_id cannot change', 'a row cannot move to another house');

select lives_ok(
  $$insert into public.buyins (id, house_id, created_at, updated_at, session_player_id, amount_cents, at)
    values (gen_random_uuid(), 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 1, 1,
            '33333333-0000-0000-0000-00000000000a', 500, 1)$$,
  'same-house child rows are accepted');

select * from finish();
rollback;
