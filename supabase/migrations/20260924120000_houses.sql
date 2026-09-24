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
