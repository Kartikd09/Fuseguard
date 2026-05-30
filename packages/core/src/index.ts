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

async function lookupKey(
  keyHash: string,
  env: Env
): Promise<KeyLookupResult | null> {
  // Phase 1 stub: load from DO storage keyed by hash.
  // Phase 2 wires a real Supabase lookup via SUPABASE_SERVICE_ROLE_KEY.
  // For now we use the DO itself — the key DO for "budget:key:<hash>" holds the budget state.
  // This means Phase 1 self-host works without a database; the budget limit defaults to Infinity.
  const keyDO = getDO(env.BudgetDO, `budget:key:${keyHash}`);

  // Self-host: every key is valid; budget is managed purely by the DO counter.
  // The hosted dashboard (Phase 2) will gate on DB records and tier limits.
  return {
    orgId: keyHash.slice(0, 16), // use first 16 chars of hash as org placeholder
    anthropicKey: "", // Phase 2: decrypt from DB; Phase 1: key forwarding happens via x-api-key passthrough
    limitUsd: Infinity, // Phase 2: pull from budgets table
    keyDO,
    sessionDO: null, // Phase 2: look up from session header
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
