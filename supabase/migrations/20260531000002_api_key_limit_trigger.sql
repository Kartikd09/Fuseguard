-- DB-level trigger to enforce plan max_keys atomically (closes TOCTOU race in app layer).
-- max_keys = -1 means unlimited (Pro). Fires BEFORE INSERT on api_keys.

create or replace function check_api_key_limit()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_max_keys  int;
  v_key_count int;
begin
  select p.max_keys into v_max_keys
    from orgs o
    join plans p on p.id = o.plan_id
   where o.id = new.org_id;

  if v_max_keys = -1 then
    return new;
  end if;

  select count(*) into v_key_count
    from api_keys
   where org_id = new.org_id
     and is_active = true;

  if v_key_count >= v_max_keys then
    raise exception 'key_limit_exceeded: plan allows % active key(s)', v_max_keys
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_api_key_limit on api_keys;
create trigger enforce_api_key_limit
  before insert on api_keys
  for each row execute procedure check_api_key_limit();
