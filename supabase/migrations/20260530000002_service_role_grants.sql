-- Grant service_role full access to all tables (bypasses RLS for Worker writes).
-- The authenticated role is restricted to RLS policies defined in migration 0001.

grant all on public.plans          to service_role;
grant all on public.orgs           to service_role;
grant all on public.memberships    to service_role;
grant all on public.api_keys       to service_role;
grant all on public.budgets        to service_role;
grant all on public.usage_events   to service_role;
grant all on public.blocks         to service_role;
grant all on public.subscriptions  to service_role;

-- authenticated role: read-only on plans (public reference data)
grant select on public.plans to authenticated;

-- authenticated role: row-level access to other tables (RLS policies enforce org isolation)
grant select, insert, update, delete on public.orgs         to authenticated;
grant select, insert, update, delete on public.memberships  to authenticated;
grant select, insert, update, delete on public.budgets      to authenticated;
grant select                         on public.usage_events to authenticated;
grant select                         on public.blocks       to authenticated;
grant select                         on public.subscriptions to authenticated;

-- api_keys: column-scoped grant — NEVER expose ciphertext/iv to authenticated role.
-- A table-level GRANT SELECT would silently re-grant the columns revoked in migration 0001.
grant select (id, org_id, label, fuseguard_key_hash, fuseguard_key_prefix,
              key_version, is_active, created_at, last_used_at)
  on public.api_keys to authenticated;
grant insert, update, delete on public.api_keys to authenticated;
