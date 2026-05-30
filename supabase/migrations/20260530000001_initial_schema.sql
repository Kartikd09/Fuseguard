-- FuseGuard v0.1 — initial schema
-- ARCHITECTURE §5 data model + RLS policies + column grants

create extension if not exists "pgcrypto";

-- ─────────────────────────────────────────────
-- Plans (seed — read-only reference, no RLS needed)
-- ─────────────────────────────────────────────
create table if not exists plans (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (name in ('free', 'pro')),
  price_usd  numeric(10,2) not null default 0,
  max_keys   int  not null default 1,
  features   jsonb not null default '{}'
);

insert into plans (name, price_usd, max_keys, features) values
  ('free', 0,    1,   '{"loop_detection": false, "alerts": false, "team": false}'),
  ('pro',  19.00, -1,  '{"loop_detection": true,  "alerts": true,  "team": true}')
on conflict do nothing;

-- ─────────────────────────────────────────────
-- Orgs (table only — policies come after memberships)
-- ─────────────────────────────────────────────
create table if not exists orgs (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  plan_id    uuid not null references plans(id),
  created_at timestamptz not null default now()
);

alter table orgs enable row level security;

-- ─────────────────────────────────────────────
-- Memberships (must exist before orgs policies reference it)
-- ─────────────────────────────────────────────
create table if not exists memberships (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references orgs(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);

alter table memberships enable row level security;

create policy "memberships: user sees own rows"
  on memberships for select
  using (user_id = auth.uid());

-- Now safe to add orgs policies (memberships table exists)
create policy "orgs: members can read own org"
  on orgs for select
  using (
    id in (select org_id from memberships where user_id = auth.uid())
  );

create policy "orgs: owner can update"
  on orgs for update
  using (
    id in (select org_id from memberships where user_id = auth.uid() and role = 'owner')
  );

-- ─────────────────────────────────────────────
-- API Keys
-- ─────────────────────────────────────────────
create table if not exists api_keys (
  id                        uuid primary key default gen_random_uuid(),
  org_id                    uuid not null references orgs(id) on delete cascade,
  label                     text not null,
  fuseguard_key_hash        text not null unique,
  fuseguard_key_prefix      text not null,
  anthropic_key_ciphertext  bytea,
  anthropic_key_iv          bytea,
  key_version               int  not null default 1,
  is_active                 bool not null default true,
  created_at                timestamptz not null default now(),
  last_used_at              timestamptz
);

alter table api_keys enable row level security;

create policy "api_keys: org members can read"
  on api_keys for select
  using (org_id in (select org_id from memberships where user_id = auth.uid()));

create policy "api_keys: org owner can insert"
  on api_keys for insert
  with check (org_id in (select org_id from memberships where user_id = auth.uid() and role = 'owner'));

create policy "api_keys: org owner can update"
  on api_keys for update
  using (org_id in (select org_id from memberships where user_id = auth.uid() and role = 'owner'));

create policy "api_keys: org owner can delete"
  on api_keys for delete
  using (org_id in (select org_id from memberships where user_id = auth.uid() and role = 'owner'));

-- Strip ciphertext/iv from authenticated role — Worker uses service role
revoke select (anthropic_key_ciphertext, anthropic_key_iv) on api_keys from authenticated;

-- ─────────────────────────────────────────────
-- Budgets
-- ─────────────────────────────────────────────
create table if not exists budgets (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references orgs(id) on delete cascade,
  scope          text not null check (scope in ('key', 'session')),
  scope_ref      text,
  limit_type     text not null check (limit_type in ('usd', 'tokens')),
  limit_value    numeric(14,6) not null,
  window_type    text not null check (window_type in ('rolling', 'daily', 'total')),
  window_seconds int,
  is_active      bool not null default true,
  created_at     timestamptz not null default now()
);

alter table budgets enable row level security;

create policy "budgets: org members can read"
  on budgets for select
  using (org_id in (select org_id from memberships where user_id = auth.uid()));

create policy "budgets: org owner can insert"
  on budgets for insert
  with check (org_id in (select org_id from memberships where user_id = auth.uid() and role = 'owner'));

create policy "budgets: org owner can update"
  on budgets for update
  using (org_id in (select org_id from memberships where user_id = auth.uid() and role = 'owner'));

create policy "budgets: org owner can delete"
  on budgets for delete
  using (org_id in (select org_id from memberships where user_id = auth.uid() and role = 'owner'));

-- ─────────────────────────────────────────────
-- Usage Events
-- ─────────────────────────────────────────────
create table if not exists usage_events (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references orgs(id) on delete cascade,
  api_key_id          uuid not null references api_keys(id) on delete cascade,
  session             text,
  model               text not null,
  input_tokens        int  not null default 0,
  output_tokens       int  not null default 0,
  cache_read_tokens   int  not null default 0,
  cache_write_tokens  int  not null default 0,
  cost_usd            numeric(14,8) not null default 0,
  status              text not null check (status in ('ok', 'upstream_error')),
  request_hash        text not null,
  ts                  timestamptz not null default now()
);

alter table usage_events enable row level security;

create policy "usage_events: org members can read"
  on usage_events for select
  using (org_id in (select org_id from memberships where user_id = auth.uid()));

create index if not exists usage_events_org_ts on usage_events (org_id, ts desc);
create index if not exists usage_events_key_ts on usage_events (api_key_id, ts desc);

-- ─────────────────────────────────────────────
-- Blocks
-- ─────────────────────────────────────────────
create table if not exists blocks (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs(id) on delete cascade,
  api_key_id    uuid not null references api_keys(id) on delete cascade,
  session       text,
  reason        text not null check (reason in ('budget_exceeded', 'loop_detected', 'enforcement_unavailable')),
  scope         text not null check (scope in ('key', 'session')),
  budget_id     uuid references budgets(id) on delete set null,
  projected_usd numeric(14,8) not null default 0,
  current_usd   numeric(14,8) not null default 0,
  ts            timestamptz not null default now()
);

alter table blocks enable row level security;

create policy "blocks: org members can read"
  on blocks for select
  using (org_id in (select org_id from memberships where user_id = auth.uid()));

create index if not exists blocks_org_ts on blocks (org_id, ts desc);

-- ─────────────────────────────────────────────
-- Subscriptions
-- ─────────────────────────────────────────────
create table if not exists subscriptions (
  id                            uuid primary key default gen_random_uuid(),
  org_id                        uuid not null unique references orgs(id) on delete cascade,
  lemon_squeezy_subscription_id text unique,
  plan_id                       uuid not null references plans(id),
  status                        text not null check (status in ('active', 'past_due', 'cancelled')),
  renews_at                     timestamptz,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now()
);

alter table subscriptions enable row level security;

create policy "subscriptions: org members can read"
  on subscriptions for select
  using (org_id in (select org_id from memberships where user_id = auth.uid()));

-- ─────────────────────────────────────────────
-- Auto-provision org + membership + subscription on sign-up
-- ─────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_free_plan_id uuid;
  v_org_id       uuid;
begin
  select id into v_free_plan_id from plans where name = 'free' limit 1;

  insert into orgs (name, plan_id)
    values (coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)), v_free_plan_id)
    returning id into v_org_id;

  insert into memberships (org_id, user_id, role)
    values (v_org_id, new.id, 'owner');

  insert into subscriptions (org_id, plan_id, status)
    values (v_org_id, v_free_plan_id, 'active');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
