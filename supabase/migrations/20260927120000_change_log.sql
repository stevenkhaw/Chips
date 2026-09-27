-- Change log (spec §8): an append-only record of every change that reaches the
-- server — ledger rows, houses, membership and secret resets — with who made it
-- (auth.uid(), null for admin writes), when, and what changed. Written only by
-- the private.log_change() trigger; the house owner can read it.

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

-- Updates store only the changed columns; server_updated_at and updated_at are
-- bookkeeping and never count, so a push retry that re-sends an identical row
-- logs nothing. Secret values are replaced by "changed".
create function private.log_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) - 'server_updated_at' end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) - 'server_updated_at' end;
  v_row jsonb := coalesce(v_new, v_old);
  v_before jsonb := v_old;
  v_after jsonb := v_new;
  v_house uuid;
  v_row_id uuid;
begin
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(n.key, v_old -> n.key), jsonb_object_agg(n.key, n.value)
      into v_before, v_after
      from jsonb_each(v_new) n
      where n.key <> 'updated_at' and n.value is distinct from v_old -> n.key;
    if v_after is null then return null; end if;
  end if;

  if tg_table_name = 'house_secrets' then
    v_before := null;
    select jsonb_object_agg(k, 'changed') into v_after from jsonb_object_keys(v_after) k;
  end if;

  case tg_table_name
    when 'houses' then
      v_house := (v_row ->> 'id')::uuid;
      v_row_id := v_house;
    when 'house_members' then
      v_house := (v_row ->> 'house_id')::uuid;
      v_row_id := (v_row ->> 'user_id')::uuid;
    when 'house_secrets' then
      v_house := (v_row ->> 'house_id')::uuid;
      v_row_id := v_house;
    else
      v_house := (v_row ->> 'house_id')::uuid;
      v_row_id := (v_row ->> 'id')::uuid;
  end case;

  insert into public.ledger_changes (house_id, table_name, row_id, op, actor_id, before, after)
    values (v_house, tg_table_name, v_row_id, lower(tg_op), (select auth.uid()), v_before, v_after);
  return null;
end;
$$;
revoke execute on function private.log_change() from public;

do $$
declare
  t text;
begin
  foreach t in array array['players', 'sessions', 'session_players', 'buyins', 'payments', 'houses'] loop
    execute format('create trigger log_change after insert or update on public.%I
                    for each row execute function private.log_change()', t);
  end loop;
end;
$$;
create trigger log_change after insert or update or delete on public.house_members
  for each row execute function private.log_change();
-- The secrets insert happens inside create_house next to the house insert, which is logged.
create trigger log_change after update on public.house_secrets
  for each row execute function private.log_change();

alter table public.ledger_changes enable row level security;
revoke all on public.ledger_changes from anon, authenticated;
revoke insert, update, delete, truncate on public.ledger_changes from service_role;
grant select on public.ledger_changes to authenticated;
create policy "owner reads changes" on public.ledger_changes
  for select to authenticated using (private.is_house_owner(house_id));
