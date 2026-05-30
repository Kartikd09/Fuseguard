-- Edge-safe rate limiting: in-memory Maps don't share state across CF Pages isolates.
-- This RPC does an atomic fixed-window counter in Postgres.

create table if not exists rate_limits (
  bucket_key text primary key,
  count      int not null default 0,
  reset_at   timestamptz not null
);

-- No RLS / grants to authenticated — only the service role (server routes) touches this.
revoke all on rate_limits from anon, authenticated;

-- Atomically increment a fixed-window counter. Returns true if allowed, false if over limit.
create or replace function check_rate_limit(
  p_key text,
  p_limit int,
  p_window_seconds int
)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_now    timestamptz := now();
  v_count  int;
  v_reset  timestamptz;
begin
  insert into rate_limits (bucket_key, count, reset_at)
    values (p_key, 1, v_now + make_interval(secs => p_window_seconds))
  on conflict (bucket_key) do update
    set count = case
                  when rate_limits.reset_at < v_now then 1
                  else rate_limits.count + 1
                end,
        reset_at = case
                  when rate_limits.reset_at < v_now then v_now + make_interval(secs => p_window_seconds)
                  else rate_limits.reset_at
                end
  returning count, reset_at into v_count, v_reset;

  return v_count <= p_limit;
end;
$$;

-- security definer + self-contained (only bumps a counter for the passed key) so granting
-- execute to authenticated is safe — callers can't read/write the table directly (revoked above).
grant execute on function check_rate_limit(text, int, int) to authenticated, service_role;
