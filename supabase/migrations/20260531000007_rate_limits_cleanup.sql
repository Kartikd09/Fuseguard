-- rate_limits rows are never deleted after expiry, causing unbounded table growth.
-- A pg_cron job purges rows whose window has already closed (reset_at < now()).

create extension if not exists pg_cron;

-- Reusable function so pg_cron or an external edge-cron can call it.
create or replace function cleanup_rate_limits()
returns void
language sql
security definer set search_path = public
as $$
  delete from rate_limits where reset_at < now() - interval '1 hour';
$$;

-- Service role only; anon/authenticated cannot call this directly.
revoke execute on function cleanup_rate_limits() from public, anon, authenticated;
grant  execute on function cleanup_rate_limits() to service_role;

-- Schedule hourly cleanup via pg_cron (runs inside the DB; no external infra needed).
-- If pg_cron extension is unavailable on this Supabase tier the statement below will
-- fail at migration time — comment it out and invoke cleanup_rate_limits() from an
-- edge function cron instead.
select cron.schedule(
  'cleanup-rate-limits-hourly',          -- job name (idempotent via unschedule below)
  '0 * * * *',                           -- every hour on the hour
  'select cleanup_rate_limits()'
);
