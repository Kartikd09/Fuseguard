// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// Single source of truth for "which org is active for this request."
//
// MVP: deterministic primary org = oldest owner membership (created_at asc).
// Future upgrade path: read fg_active_org cookie first, validate membership,
// fall back to primary — change only this one function, nothing else changes.

import type { SupabaseClient } from "@supabase/supabase-js";

export async function resolveActiveOrgId(supabase: SupabaseClient): Promise<string | null> {
  // MVP: oldest owner membership = primary org. member-only users are not supported yet
  // (Pro team feature). Stable secondary sort on org_id prevents non-determinism when
  // two orgs share a created_at timestamp. Upgrade path: read fg_active_org cookie first.
  // Order by memberships.created_at (proxy for org age) + org_id for stable tie-break.
  const { data, error } = await supabase
    .from("memberships")
    .select("org_id, orgs(id, created_at)")
    .eq("role", "owner")
    .order("created_at", { ascending: true })
    .order("org_id", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`resolveActiveOrgId: ${error.message}`);
  return (data as { org_id: string } | null)?.org_id ?? null;
}
