-- Phase 3: Lemon Squeezy billing columns + DB-level free-tier key limit enforcement
--
-- Changes:
-- 1. Add lemon_squeezy_order_id + lemon_squeezy_customer_id to subscriptions
-- 2. Ensure plans have correct max_keys values
-- 3. DB trigger: enforce max_keys per org on api_keys insert (closes TOCTOU race in app layer)

alter table subscriptions
  add column if not exists lemon_squeezy_order_id text,
  add column if not exists lemon_squeezy_customer_id text;

update plans set max_keys = 1   where name = 'free';
update plans set max_keys = -1  where name = 'pro';

-- Trigger: enforce plan key limit atomically at DB level.
-- max_keys = -1 means unlimited. Runs BEFORE INSERT to block the row.
create or replace function check_api_key_limit()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_max_keys  int;
  v_key_count int;
begin
  -- Get the plan's max_keys for this org.
  select p.max_keys into v_max_keys
    from orgs o
    join plans p on p.id = o.plan_id
   where o.id = new.org_id;

  -- -1 = unlimited (Pro plan).
  if v_max_keys = -1 then
    return new;
  end if;

  -- Count current active keys for this org.
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
