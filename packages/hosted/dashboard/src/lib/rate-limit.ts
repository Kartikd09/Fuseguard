// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// Edge-safe rate limiting via a Postgres atomic counter (check_rate_limit RPC).
//
// An in-memory Map does NOT work on Cloudflare Pages — requests hit different short-lived
// isolates with no shared memory, so the counter never accumulates. This delegates to a
// DB-side fixed-window counter that is correct across all isolates.

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Returns true if the request is allowed, false if the limit is exceeded.
 * Fail-open: if the DB call errors, allow the request (don't block legitimate users
 * on a transient DB hiccup — rate limiting is abuse protection, not a security gate).
 */
export async function checkRateLimit(
  supabase: SupabaseClient,
  key: string,
  limit: number,
  windowSeconds: number
): Promise<boolean> {
  const { data, error } = await supabase.rpc("check_rate_limit", {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error("[rate-limit] check failed (failing open):", error.message);
    return true;
  }
  return data === true;
}
