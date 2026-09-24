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
        if v_constraint is distinct from 'houses_join_code_key' then raise; end if;
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
  -- Serialise one user's attempts so parallel calls cannot slip past the lockout.
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));

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
from public, anon, service_role;
grant execute on function
  public.create_house(uuid, text, text, text),
  public.join_house(text, text),
  public.join_house_by_link(uuid, text)
to authenticated;
