-- plans is public reference data. The project has automatic-RLS enabled, which turned on
-- RLS at table creation with no policy → all reads denied → subscriptions→plans joins return
-- null and isPro can never be true. Add an explicit read policy for the authenticated role.

create policy "plans: authenticated can read"
  on plans for select
  to authenticated
  using (true);
