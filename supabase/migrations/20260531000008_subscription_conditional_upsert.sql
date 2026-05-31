-- Webhook replay / concurrent delivery creates a TOCTOU window when the app does
-- SELECT-then-UPDATE. This atomic RPC replaces that pattern: the WHERE clause on
-- DO UPDATE ensures a stale event can never overwrite a newer row.

create or replace function apply_subscription_event(
  p_org_id                        uuid,
  p_lemon_squeezy_subscription_id text,
  p_lemon_squeezy_order_id        text,
  p_lemon_squeezy_customer_id     text,
  p_plan_id                       uuid,
  p_status                        text,
  p_renews_at                     timestamptz,
  p_updated_at                    timestamptz
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_applied integer;
begin
  insert into subscriptions (
    org_id,
    lemon_squeezy_subscription_id,
    lemon_squeezy_order_id,
    lemon_squeezy_customer_id,
    plan_id,
    status,
    renews_at,
    created_at,
    updated_at
  ) values (
    p_org_id,
    p_lemon_squeezy_subscription_id,
    p_lemon_squeezy_order_id,
    p_lemon_squeezy_customer_id,
    p_plan_id,
    p_status,
    p_renews_at,
    now(),
    p_updated_at
  )
  on conflict (org_id) do update
    set lemon_squeezy_subscription_id = excluded.lemon_squeezy_subscription_id,
        lemon_squeezy_order_id        = excluded.lemon_squeezy_order_id,
        lemon_squeezy_customer_id     = excluded.lemon_squeezy_customer_id,
        plan_id                       = excluded.plan_id,
        status                        = excluded.status,
        renews_at                     = excluded.renews_at,
        updated_at                    = excluded.updated_at
    -- Only apply if the incoming event is strictly newer than the stored row.
    where excluded.updated_at > subscriptions.updated_at;

  -- A stale/replayed event matches no rows here (predicate false, or fresh insert = 1).
  get diagnostics v_applied = row_count;

  -- Sync orgs.plan_id ONLY when the subscription row actually changed. orgs.plan_id is the
  -- real Pro gate (check_api_key_limit reads it) — a stale event must not move it.
  if v_applied > 0 then
    update orgs set plan_id = p_plan_id where id = p_org_id;
  end if;
end;
$$;

-- Only service_role (the CF Worker webhook handler) may call this RPC.
-- authenticated and anon cannot mutate subscriptions through this path.
revoke execute on function apply_subscription_event(
  uuid, text, text, text, uuid, text, timestamptz, timestamptz
) from public, anon, authenticated;

grant execute on function apply_subscription_event(
  uuid, text, text, text, uuid, text, timestamptz, timestamptz
) to service_role;
