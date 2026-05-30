// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// Supabase query helpers — called from Server Components / Route Handlers.
// Returns typed rows; errors propagated explicitly (never swallowed).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApiKey, Budget, UsageEvent, Block, Org, Subscription } from "@/types";

/** Fetch the current user's org (first membership — single-user MVP). */
export async function fetchUserOrg(
  supabase: SupabaseClient
): Promise<Org | null> {
  const { data, error } = await supabase
    .from("orgs")
    .select("id, name, plan_id, created_at")
    .limit(1)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null; // no rows — new user
    throw new Error(`fetchUserOrg: ${error.message}`);
  }
  return data as Org;
}

/** Fetch all active API keys for the org (RLS-scoped automatically). */
export async function fetchApiKeys(supabase: SupabaseClient): Promise<ApiKey[]> {
  const { data, error } = await supabase
    .from("api_keys")
    .select(
      "id, org_id, label, fuseguard_key_prefix, is_active, created_at, last_used_at"
    )
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`fetchApiKeys: ${error.message}`);
  return (data ?? []) as ApiKey[];
}

/** Fetch all active budgets for the org. */
export async function fetchBudgets(supabase: SupabaseClient): Promise<Budget[]> {
  const { data, error } = await supabase
    .from("budgets")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`fetchBudgets: ${error.message}`);
  return (data ?? []) as Budget[];
}

/**
 * Fetch usage events for a given time window.
 * `since` is an ISO-8601 string (e.g. start of today, or 24h ago).
 */
export async function fetchUsageEvents(
  supabase: SupabaseClient,
  since: string
): Promise<UsageEvent[]> {
  const { data, error } = await supabase
    .from("usage_events")
    .select(
      "id, org_id, api_key_id, session, model, input_tokens, output_tokens, " +
        "cache_read_tokens, cache_write_tokens, cost_usd, status, request_hash, ts"
    )
    .gte("ts", since)
    .order("ts", { ascending: false });

  if (error) throw new Error(`fetchUsageEvents: ${error.message}`);
  return (data ?? []) as unknown as UsageEvent[];
}

/**
 * Fetch block events for a given time window.
 */
export async function fetchBlocks(
  supabase: SupabaseClient,
  since: string
): Promise<Block[]> {
  const { data, error } = await supabase
    .from("blocks")
    .select("*")
    .gte("ts", since)
    .order("ts", { ascending: false });

  if (error) throw new Error(`fetchBlocks: ${error.message}`);
  return (data ?? []) as Block[];
}

/** Fetch subscription + plan for the org. */
export async function fetchSubscription(
  supabase: SupabaseClient
): Promise<(Subscription & { plan_name?: string }) | null> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("*, plans(name)")
    .limit(1)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`fetchSubscription: ${error.message}`);
  }
  return data as Subscription;
}

/** ISO string for N hours ago from now. */
export function hoursAgoIso(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

/** ISO string for start of current UTC day. */
export function startOfDayIso(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}
