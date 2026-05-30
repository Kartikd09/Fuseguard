// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// Supabase database types matching ARCHITECTURE §5 data model.
// These mirror the Postgres schema; RLS ensures a user sees only their org's rows.

export type PlanName = "free" | "pro";
export type MemberRole = "owner" | "member";
export type BudgetScope = "key" | "session";
export type LimitType = "usd" | "tokens";
export type BudgetWindow = "rolling" | "daily" | "total";
export type EventStatus = "ok" | "upstream_error";
export type BlockReason =
  | "budget_exceeded"
  | "loop_detected"
  | "enforcement_unavailable";
export type SubscriptionStatus = "active" | "past_due" | "cancelled";

export interface Org {
  id: string;
  name: string;
  plan_id: string;
  created_at: string;
}

export interface Membership {
  id: string;
  org_id: string;
  user_id: string;
  role: MemberRole;
  created_at: string;
}

export interface ApiKey {
  id: string;
  org_id: string;
  label: string;
  // fuseguard_key_hash is stored but never returned — we surface a masked prefix
  fuseguard_key_prefix: string; // first 8 chars, e.g. "fg_live_x"
  is_active: boolean;
  created_at: string;
  last_used_at: string | null;
}

export interface Budget {
  id: string;
  org_id: string;
  scope: BudgetScope;
  scope_ref: string | null; // api_key_id or session string; null = all
  limit_type: LimitType;
  limit_value: number;
  window: BudgetWindow;
  window_seconds: number | null; // used when window === "rolling"
  is_active: boolean;
  created_at: string;
}

export interface UsageEvent {
  id: string;
  org_id: string;
  api_key_id: string;
  session: string | null;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cost_usd: number;
  status: EventStatus;
  request_hash: string;
  ts: string;
}

export interface Block {
  id: string;
  org_id: string;
  api_key_id: string;
  session: string | null;
  reason: BlockReason;
  scope: BudgetScope;
  budget_id: string | null;
  projected_usd: number;
  current_usd: number;
  ts: string;
}

export interface Plan {
  id: string;
  name: PlanName;
  price_usd: number;
  max_keys: number;
  features: Record<string, unknown>;
}

export interface Subscription {
  id: string;
  org_id: string;
  lemon_squeezy_subscription_id: string | null;
  plan_id: string;
  status: SubscriptionStatus;
  renews_at: string | null;
  created_at: string;
  updated_at: string;
}
