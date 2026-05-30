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

-- authenticated role: row-level access to all other tables (RLS policies enforce org isolation)
grant select, insert, update, delete on public.orgs          to authenticated;
grant select, insert, update, delete on public.memberships   to authenticated;
grant select, insert, update, delete on public.api_keys      to authenticated;
grant select, insert, update, delete on public.budgets       to authenticated;
grant select                         on public.usage_events  to authenticated;
grant select                         on public.blocks        to authenticated;
grant select                         on public.subscriptions to authenticated;
