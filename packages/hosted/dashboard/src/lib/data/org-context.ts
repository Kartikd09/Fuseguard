// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// Single source of truth for "which org is active for this request."
//
// Resolution order:
//   1. fg_active_org cookie — if present AND the user is a validated member, use it.
//   2. Primary fallback: owner membership preferred, then any membership.
//      Owner-first ordering, then created_at asc, then org_id asc (stable tie-break).
//
// Signature is `(supabase, cookieOrgId?) => Promise<string|null>` so callers can
// optionally pass the cookie value they already parsed (e.g. from Next.js cookies()).
// The cookie value is ONLY accepted after a server-side membership check — never trusted raw.

import type { SupabaseClient } from "@supabase/supabase-js";

/** Row shape returned by the memberships query below. */
interface MembershipRow {
  org_id: string;
  role: string;
}

/**
 * Fetch all org memberships for the authenticated user, ordered owner-first
 * then by created_at asc + org_id asc for a stable, deterministic result.
 */
async function fetchUserMemberships(supabase: SupabaseClient): Promise<MembershipRow[]> {
  const { data, error } = await supabase
    .from("memberships")
    .select("org_id, role")
    .order("created_at", { ascending: true })
    .order("org_id", { ascending: true });

  if (error) throw new Error(`resolveActiveOrgId: ${error.message}`);
  return (data ?? []) as MembershipRow[];
}

/**
 * Resolve the org the current user should see.
 *
 * @param supabase  Authenticated Supabase client (server or route handler).
 * @param cookieOrgId  Value of the fg_active_org cookie, already read by the caller.
 *                     Passed separately because `cookies()` is only available in
 *                     Server Components / Route Handlers, not in arbitrary helpers.
 */
export async function resolveActiveOrgId(
  supabase: SupabaseClient,
  cookieOrgId?: string | null,
): Promise<string | null> {
  const memberships = await fetchUserMemberships(supabase);
  if (memberships.length === 0) return null;

  // Validate cookie org: user must actually be a member (defense-in-depth on top of RLS).
  if (cookieOrgId) {
    const isMember = memberships.some((m) => m.org_id === cookieOrgId);
    if (isMember) return cookieOrgId;
    // Cookie points to an org the user is not a member of — fall through to primary.
  }

  // Primary: owner membership first (stable owner-before-member sort), then any role.
  const ownerRow = memberships.find((m) => m.role === "owner");
  return ownerRow?.org_id ?? memberships[0]?.org_id ?? null;
}

/** Lightweight org descriptor for the switcher UI. */
export interface OrgOption {
  id: string;
  name: string;
  role: string;
}

/**
 * Fetch all orgs the user belongs to (id + name + role) for the org switcher.
 * Returns [] when the user has no memberships.
 */
export async function fetchUserOrgs(supabase: SupabaseClient): Promise<OrgOption[]> {
  const { data, error } = await supabase
    .from("memberships")
    .select("org_id, role, orgs(id, name)")
    .order("created_at", { ascending: true })
    .order("org_id", { ascending: true });

  if (error) throw new Error(`fetchUserOrgs: ${error.message}`);

  type RawRow = {
    org_id: string;
    role: string;
    // Supabase returns a FK-joined object as a single record (not an array)
    // when the relationship is many-to-one. Cast through unknown to satisfy TS.
    orgs: { id: string; name: string } | null;
  };

  return ((data ?? []) as unknown as RawRow[])
    .filter((row) => row.orgs !== null)
    .map((row) => ({
      id: row.org_id,
      name: row.orgs!.name,
      role: row.role,
    }));
}
