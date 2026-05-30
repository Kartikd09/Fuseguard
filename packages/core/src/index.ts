// FuseGuard proxy Worker entry point. MIT/OSS (ARCHITECTURE §2, §7).
// GET /health → 200; /v1/messages → enforcement pipeline (FR-1..FR-4).
//
// Dependency injection: upstream fetch and key-lookup are extracted as injectable
// seams so the proxy logic in proxy/worker.ts can be unit-tested without a real
// Cloudflare Workers runtime.

import { createProxyHandler } from "./proxy/worker.js";
import type { ProxyEnv, KeyLookupResult } from "./proxy/worker.js";
import { BudgetDO } from "./budget-do.js";
export { BudgetDO } from "./budget-do.js";

export interface Env {
  readonly ANTHROPIC_UPSTREAM: string;
  readonly FAILURE_MODE: "open" | "closed";
  readonly BudgetDO: DurableObjectNamespace;
  // Wrangler secrets — never in vars or bundle.
  readonly FG_MASTER_KEY?: string;
  readonly SUPABASE_SERVICE_ROLE_KEY?: string;
  readonly SUPABASE_URL?: string;
  // Phase 1 single-tenant self-host config (one key, one budget). Set via wrangler secrets.
  // Hosted/multi-tenant DB lookup arrives in Phase 2.
  readonly SELFHOST_FUSEGUARD_KEY_HASH?: string; // SHA-256 hex of the allowed FuseGuard key
  readonly SELFHOST_ANTHROPIC_KEY?: string; // the upstream Anthropic key to use
  readonly SELFHOST_BUDGET_USD?: string; // numeric budget ceiling in USD
}

const proxyHandler = createProxyHandler();

// Resolve a DO instance for a given budget scope key (key or session).
// Format: "budget:key:<id>" or "budget:session:<id>".
function getDO(namespace: DurableObjectNamespace, scopeKey: string): BudgetDO {
  const id = namespace.idFromName(scopeKey);
  // The stub returned by namespace.get() satisfies the BudgetDO interface via the DO RPC fetch.
  return namespace.get(id) as unknown as BudgetDO;
}

// Stub event emitter — in Phase 1 this is a best-effort console log; Phase 2 wires Supabase.
function emitEvent(event: unknown): void {
  // Never log prompt/response bodies (ARCHITECTURE §6). Only metadata.
  // console.log("[fuseguard:event]", JSON.stringify(event)); // disabled until logging is structured
  void event;
}

// Pure, testable resolution of the Phase-1 self-host config. Returns the validated
// {anthropicKey, limitUsd} only when fully configured AND the presented key matches.
// FAIL CLOSED on anything missing/invalid → null. No Infinity, no empty-key forward.
// TODO(Phase 2): replace with Supabase api_keys lookup + AES-GCM decrypt (FG_MASTER_KEY),
// per-org budgets, and session DO resolution.
export interface SelfhostConfig {
  readonly SELFHOST_FUSEGUARD_KEY_HASH?: string;
  readonly SELFHOST_ANTHROPIC_KEY?: string;
  readonly SELFHOST_BUDGET_USD?: string;
}

export function resolveSelfhostKey(
  keyHash: string,
  cfg: SelfhostConfig
): { orgId: string; anthropicKey: string; limitUsd: number } | null {
  const { SELFHOST_FUSEGUARD_KEY_HASH: hash, SELFHOST_ANTHROPIC_KEY: anthropicKey, SELFHOST_BUDGET_USD: budgetRaw } = cfg;
  if (!hash || !anthropicKey || !budgetRaw) return null; // not configured → block
  if (keyHash !== hash) return null; // unknown key → block
  const limitUsd = Number(budgetRaw);
  if (!Number.isFinite(limitUsd) || limitUsd <= 0) return null; // bad budget → block
  return { orgId: keyHash.slice(0, 16), anthropicKey, limitUsd };
}

async function lookupKey(keyHash: string, env: Env): Promise<KeyLookupResult | null> {
  const resolved = resolveSelfhostKey(keyHash, env);
  if (resolved === null) return null;
  return {
    ...resolved,
    keyDO: getDO(env.BudgetDO, `budget:key:${keyHash}`),
    sessionDO: null, // Phase 2: resolve from validated session header
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ status: "ok" });
    }

    const proxyEnv: ProxyEnv = {
      FAILURE_MODE: env.FAILURE_MODE ?? "closed",
      upstreamFetch: fetch,
      lookupKey: (keyHash: string) => lookupKey(keyHash, env),
      emitEvent,
    };

    return proxyHandler(request, proxyEnv);
  },
} satisfies ExportedHandler<Env>;
