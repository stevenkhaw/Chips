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
    execute format('revoke delete, truncate on public.%I from service_role', t);
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
