-- Grace-period downgrade: a subscription in 'past_due' (Lemon Squeezy past_due/
-- unpaid/paused all map here) keeps Pro access during a grace window so a transient
-- payment failure doesn't immediately revoke the plan. But without a sweep, a sub
-- that never recovers keeps Pro forever — a billing leak. This job cancels subs
-- stuck in 'past_due' past the grace window and drops the org back to the free plan.
--
-- updated_at carries the Lemon Squeezy event timestamp (set by apply_subscription_event,
-- migration 0008), so "time since the sub entered past_due" is updated_at age.

create extension if not exists pg_cron;

create or replace function downgrade_expired_grace()
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_free_plan_id uuid;
  v_count        int;
begin
  select id into v_free_plan_id from plans where name = 'free' limit 1;
  if v_free_plan_id is null then
    raise warning 'downgrade_expired_grace: no free plan found, skipping';
    return;
  end if;

  -- Cancel subscriptions stuck in past_due beyond the 7-day grace window, then
  -- drop their orgs to free. One CTE so org sync only touches the affected rows.
  with expired as (
    update subscriptions
       set status = 'cancelled',
           plan_id = v_free_plan_id,
           updated_at = now()
     where status = 'past_due'
       and updated_at < now() - interval '7 days'
    returning org_id
  )
  update orgs
     set plan_id = v_free_plan_id
   where id in (select org_id from expired);

  get diagnostics v_count = row_count;

  -- Reconcile drift: an org left on Pro whose subscription is already cancelled
  -- (e.g. a prior interrupted run) would never be re-touched above. Heal it here.
  update orgs o
     set plan_id = v_free_plan_id
    from subscriptions s, plans p
   where s.org_id = o.id
     and o.plan_id = p.id
     and p.name = 'pro'
     and s.status = 'cancelled';

  -- Observability: this job moves paying customers off Pro — leave a trail.
  raise notice 'downgrade_expired_grace: downgraded % expired-grace org(s)', v_count;
end;
$$;

-- Service role only.
revoke execute on function downgrade_expired_grace() from public, anon, authenticated;
grant  execute on function downgrade_expired_grace() to service_role;

-- Daily sweep at 03:00 UTC (off-peak). Unschedule first so the migration is
-- re-runnable on older pg_cron (the 3-arg form upserts on >=1.4, but the guard
-- keeps it safe on any version / db reset). If pg_cron is unavailable on this
-- Supabase tier these statements fail at migration time — comment them out and
-- invoke downgrade_expired_grace() from an edge-function cron instead.
select cron.unschedule('downgrade-expired-grace-daily')
  where exists (select 1 from cron.job where jobname = 'downgrade-expired-grace-daily');

select cron.schedule(
  'downgrade-expired-grace-daily',
  '0 3 * * *',
  'select downgrade_expired_grace()'
);
