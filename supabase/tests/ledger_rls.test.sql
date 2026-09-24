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

-- service_role (admin key) cannot hard-delete either
set local role service_role;
select throws_ok($$delete from public.payments$$, '42501', null, 'service_role cannot delete payments');
select throws_ok($$truncate public.buyins$$, '42501', null, 'service_role cannot truncate buy-ins');

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
