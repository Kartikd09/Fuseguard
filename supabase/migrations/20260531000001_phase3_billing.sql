-- Phase 3: add lemon_squeezy_variant_id to plans, add idempotency key to subscriptions

alter table subscriptions
  add column if not exists lemon_squeezy_order_id text,
  add column if not exists lemon_squeezy_customer_id text;

-- Update plans with LS variant IDs (filled in via env/config, not hardcoded here)
-- Free plan: max_keys=1, Pro plan: max_keys=-1 (unlimited)
update plans set max_keys = 1   where name = 'free';
update plans set max_keys = -1  where name = 'pro';
