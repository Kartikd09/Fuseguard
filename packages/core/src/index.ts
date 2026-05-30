// FuseGuard proxy Worker entry point. MIT/OSS (ARCHITECTURE §2, §7).
// GET /health → 200; /v1/messages → enforcement pipeline (FR-1..FR-4).

import { createProxyHandler } from "./proxy/worker.js";
import type { ProxyEnv, KeyLookupResult } from "./proxy/worker.js";
import { BudgetDO } from "./budget-do.js";
import { decryptKey } from "./crypto/index.js";
export { BudgetDO } from "./budget-do.js";

export interface Env {
  readonly ANTHROPIC_UPSTREAM: string;
  readonly FAILURE_MODE: "open" | "closed";
  readonly BudgetDO: DurableObjectNamespace;
  // Wrangler secrets — never in vars or bundle.
  readonly FG_MASTER_KEY: string;
  readonly SUPABASE_SERVICE_ROLE_KEY: string;
  readonly SUPABASE_URL: string;
  // Self-host fallback (no Supabase) — set these to use without a DB.
  readonly SELFHOST_FUSEGUARD_KEY_HASH?: string;
  readonly SELFHOST_ANTHROPIC_KEY?: string;
  readonly SELFHOST_BUDGET_USD?: string;
}

// ── Supabase REST helpers (no SDK — keeps Worker bundle lean) ─────────────────────────────────

async function sbGet<T>(env: Env, table: string, query: string): Promise<T[]> {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}?${query}`, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`supabase GET ${table} ${res.status}`);
  return res.json() as Promise<T[]>;
}

async function sbInsert(env: Env, table: string, body: unknown): Promise<void> {
  // Best-effort write — never block the hot path.
  await fetch(`${env.SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(body),
  });
}

// Supabase REST returns bytea columns as \xHEX where the bytes are the UTF-8 encoding
// of the original stored string (base64). Decode hex → UTF-8 string to get the base64 back.
function hexToBase64(s: string): string {
  if (!s.startsWith("\\x")) return s; // already a plain string / base64
  const hex = s.slice(2);
  let str = "";
  for (let i = 0; i < hex.length; i += 2) {
    str += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
  }
  return str; // this IS the base64 string that was originally stored
}

const proxyHandler = createProxyHandler();

function getDO(namespace: DurableObjectNamespace, scopeKey: string): BudgetDO {
  return namespace.get(namespace.idFromName(scopeKey)) as unknown as BudgetDO;
}

// ── Self-host fallback (no Supabase) ─────────────────────────────────────────────────────────
// Kept for OSS self-hosters who set SELFHOST_* env vars instead of Supabase.

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
  if (!hash || !anthropicKey || !budgetRaw) return null;
  if (keyHash !== hash) return null;
  const limitUsd = Number(budgetRaw);
  if (!Number.isFinite(limitUsd) || limitUsd <= 0) return null;
  return { orgId: keyHash.slice(0, 16), anthropicKey, limitUsd };
}

// ── Supabase-backed key lookup + AES-GCM decrypt ─────────────────────────────────────────────

interface ApiKeyRow {
  id: string;
  org_id: string;
  anthropic_key_ciphertext: string; // \xHEX bytea
  anthropic_key_iv: string;
}

interface BudgetRow {
  id: string;
  scope: "key" | "session";
  scope_ref: string | null;
  limit_value: number;
}

async function lookupKeyFromSupabase(keyHash: string, env: Env): Promise<KeyLookupResult | null> {
  const rows = await sbGet<ApiKeyRow>(
    env,
    "api_keys",
    `fuseguard_key_hash=eq.${encodeURIComponent(keyHash)}&is_active=eq.true&select=id,org_id,anthropic_key_ciphertext,anthropic_key_iv&limit=1`
  );
  if (rows.length === 0) return null;
  const row = rows[0]!;

  const anthropicKey = await decryptKey(
    hexToBase64(row.anthropic_key_ciphertext),
    hexToBase64(row.anthropic_key_iv),
    env.FG_MASTER_KEY
  );

  const budgets = await sbGet<BudgetRow>(
    env,
    "budgets",
    `org_id=eq.${row.org_id}&is_active=eq.true&limit_type=eq.usd&select=id,scope,scope_ref,limit_value&limit=20`
  );

  const keyBudget = budgets.find(
    (b) => b.scope === "key" && (b.scope_ref === row.id || b.scope_ref === null)
  );
  const limitUsd = keyBudget?.limit_value ?? Infinity;

  const keyDO = getDO(env.BudgetDO, `budget:key:${row.id}`);

  // Init the DO limit (idempotent — DO ignores if already set to same value).
  await keyDO.fetch(new Request("https://do/init", {
    method: "POST",
    body: JSON.stringify({ limitUsd }),
    headers: { "content-type": "application/json" },
  }));

  return { orgId: row.org_id, anthropicKey, limitUsd, keyDO, sessionDO: null };
}

async function lookupKey(keyHash: string, env: Env): Promise<KeyLookupResult | null> {
  // Hosted path: Supabase configured.
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY && env.FG_MASTER_KEY) {
    return lookupKeyFromSupabase(keyHash, env);
  }
  // Self-host fallback.
  const resolved = resolveSelfhostKey(keyHash, env);
  if (resolved === null) return null;
  return { ...resolved, keyDO: getDO(env.BudgetDO, `budget:key:${keyHash}`), sessionDO: null };
}

// ── Event emitter → Supabase usage_events + blocks (off hot path) ────────────────────────────

type EmitPayload = { type: string; orgId?: string; [k: string]: unknown };

// keyId is captured by the worker per-request after lookupKey resolves.
function makeEmitter(env: Env, keyId: string | undefined): (e: unknown) => void {
  return (event: unknown) => {
    const e = event as EmitPayload;
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return;
    if (e.type === "usage" && e.orgId) {
      void sbInsert(env, "usage_events", {
        org_id: e.orgId,
        api_key_id: keyId,
        model: e["model"],
        input_tokens: e["inputTokens"] ?? 0,
        output_tokens: e["outputTokens"] ?? 0,
        cache_read_tokens: e["cacheReadTokens"] ?? 0,
        cache_write_tokens: e["cacheWriteTokens"] ?? 0,
        cost_usd: e["costUsd"] ?? 0,
        status: "ok",
        request_hash: "",
        ts: new Date().toISOString(),
      });
    }
    if (e.type === "block" && e.orgId) {
      void sbInsert(env, "blocks", {
        org_id: e.orgId,
        api_key_id: keyId,
        reason: e["reason"] ?? "budget_exceeded",
        scope: e["scope"] ?? "key",
        projected_usd: e["projected"] ?? 0,
        current_usd: e["currentSpend"] ?? 0,
        ts: new Date().toISOString(),
      });
    }
  };
}

// ── Worker export ─────────────────────────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ status: "ok" });
    }

    // Per-request key id captured after lookup for event emission.
    let resolvedKeyId: string | undefined;

    const proxyEnv: ProxyEnv = {
      FAILURE_MODE: env.FAILURE_MODE ?? "closed",
      upstreamFetch: fetch,
      lookupKey: async (keyHash: string) => {
        const result = await lookupKey(keyHash, env);
        if (result && env.SUPABASE_URL) {
          sbGet<{ id: string }>(env, "api_keys", `fuseguard_key_hash=eq.${encodeURIComponent(keyHash)}&select=id&limit=1`)
            .then((rows) => { resolvedKeyId = rows[0]?.id; })
            .catch(() => undefined);
        }
        return result;
      },
      // Closure over resolvedKeyId so each event emission uses the current value.
      emitEvent: (e: unknown) => makeEmitter(env, resolvedKeyId)(e),
    };

    return proxyHandler(request, proxyEnv);
  },
} satisfies ExportedHandler<Env>;
