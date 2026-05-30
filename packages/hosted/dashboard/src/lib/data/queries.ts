// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// Supabase query helpers — called from Server Components / Route Handlers.
// All queries take an explicit orgId — RLS is the security boundary,
// explicit org_id filter is the selection logic. Never rely on RLS alone for selection.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApiKey, Budget, UsageEvent, Block, Subscription } from "@/types";
import { resolveActiveOrgId } from "./org-context";

/** Resolve the active org ID for the current user. Single source of truth. */
export { resolveActiveOrgId };

/** Fetch all active API keys for the org. */
export async function fetchApiKeys(supabase: SupabaseClient, orgId: string): Promise<ApiKey[]> {
  const { data, error } = await supabase
    .from("api_keys")
    .select("id, org_id, label, fuseguard_key_prefix, is_active, created_at, last_used_at")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`fetchApiKeys: ${error.message}`);
  return (data ?? []) as ApiKey[];
}

/** Fetch all active budgets for the org. */
export async function fetchBudgets(supabase: SupabaseClient, orgId: string): Promise<Budget[]> {
  const { data, error } = await supabase
    .from("budgets")
    .select("*")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`fetchBudgets: ${error.message}`);
  return (data ?? []) as Budget[];
}

/** Fetch usage events for a given time window scoped to the org. */
export async function fetchUsageEvents(
  supabase: SupabaseClient,
  orgId: string,
  since: string
): Promise<UsageEvent[]> {
  const { data, error } = await supabase
    .from("usage_events")
    .select(
      "id, org_id, api_key_id, session, model, input_tokens, output_tokens, " +
        "cache_read_tokens, cache_write_tokens, cost_usd, status, request_hash, ts"
    )
    .eq("org_id", orgId)
    .gte("ts", since)
    .order("ts", { ascending: false });

  if (error) throw new Error(`fetchUsageEvents: ${error.message}`);
  return (data ?? []) as unknown as UsageEvent[];
}

/** Fetch block events for a given time window scoped to the org. */
export async function fetchBlocks(
  supabase: SupabaseClient,
  orgId: string,
  since: string
): Promise<Block[]> {
  const { data, error } = await supabase
    .from("blocks")
    .select("*")
    .eq("org_id", orgId)
    .gte("ts", since)
    .order("ts", { ascending: false });

  if (error) throw new Error(`fetchBlocks: ${error.message}`);
  return (data ?? []) as Block[];
}

/** Fetch subscription + plan for the org. */
export async function fetchSubscription(
  supabase: SupabaseClient,
  orgId: string
): Promise<Subscription | null> {
  const { data, error } = await supabase
    .from("subscriptions")
    .select("*, plans(name)")
    .eq("org_id", orgId)
    .maybeSingle();

  if (error) throw new Error(`fetchSubscription: ${error.message}`);
  return data as Subscription | null;
}

/** Fetch the org's plan (name + max_keys). max_keys = -1 means unlimited. */
export async function fetchOrgPlan(
  supabase: SupabaseClient,
  orgId: string
): Promise<{ name: string; max_keys: number } | null> {
  const { data, error } = await supabase
    .from("orgs")
    .select("plans(name, max_keys)")
    .eq("id", orgId)
    .maybeSingle();

  if (error) throw new Error(`fetchOrgPlan: ${error.message}`);
  return (data as unknown as { plans?: { name: string; max_keys: number } } | null)?.plans ?? null;
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
