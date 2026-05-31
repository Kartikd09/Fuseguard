-- Harden SECURITY DEFINER functions flagged by the Supabase linter
-- (lints 0028/0029): they default to PUBLIC EXECUTE, so PostgREST exposes them
-- at /rest/v1/rpc/<fn> callable by anon/authenticated. These are all internal
-- trigger / bootstrap functions that should never be invoked via the API.
--
-- Triggers keep working after this: a trigger executes its function as part of
-- the firing statement (as the table owner), not through the REST EXECUTE grant.

-- Trigger functions — no caller should ever invoke these directly.
revoke execute on function check_api_key_limit() from public, anon, authenticated;
revoke execute on function handle_new_user()     from public, anon, authenticated;
revoke execute on function rls_auto_enable()     from public, anon, authenticated;

-- Rate-limit RPC: the CF Worker calls it with the service_role key only.
-- anon/authenticated have no business invoking it (they could probe/forge limits).
revoke execute on function check_rate_limit(text, integer, integer) from public, anon, authenticated;
grant  execute on function check_rate_limit(text, integer, integer) to service_role;
