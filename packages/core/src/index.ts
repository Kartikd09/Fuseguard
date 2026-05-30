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
  readonly LEMON_SQUEEZY_WEBHOOK_SECRET?: string;
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
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(body),
  });
  // Log failures server-side so dropped telemetry is observable. Never log body (contains cost metadata only, no secrets).
  if (!res.ok) {
    console.error(`[fuseguard:ingest] ${table} insert failed: ${res.status}`);
  }
}

async function sbUpsert(env: Env, table: string, onConflict: string, body: unknown): Promise<void> {
  // on_conflict must be a query param, not a header (PostgREST spec).
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${table}?on_conflict=${encodeURIComponent(onConflict)}`, {
    method: "POST",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates,return=minimal",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) console.error(`[fuseguard:ingest] ${table} upsert failed: ${res.status}`);
}

// Supabase REST returns bytea columns as \xHEX where the bytes are the UTF-8 encoding
// of the original stored string (base64). Decode hex → UTF-8 string to get the base64 back.
export function hexToBase64(s: string): string {
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

// KeyLookupResult extended to carry keyId for event emission — avoids a second DB round-trip.
interface LookupResult extends KeyLookupResult {
  keyId: string;
}

async function lookupKeyFromSupabase(keyHash: string, env: Env): Promise<LookupResult | null> {
  const rows = await sbGet<ApiKeyRow>(
    env,
    "api_keys",
    `fuseguard_key_hash=eq.${encodeURIComponent(keyHash)}&is_active=eq.true&select=id,org_id,anthropic_key_ciphertext,anthropic_key_iv&limit=1`
  );
  if (rows.length === 0) return null;
  const row = rows[0]!;

  let anthropicKey: string;
  try {
    anthropicKey = await decryptKey(
      hexToBase64(row.anthropic_key_ciphertext),
      hexToBase64(row.anthropic_key_iv),
      env.FG_MASTER_KEY
    );
  } catch (err) {
    // Emit structured error (no plaintext/ciphertext) so key-rotation breakage is observable.
    console.error(`[fuseguard:crypto] decryptKey failed for key ${row.id}: ${String(err)}`);
    throw err; // re-throw so caller applies failure policy
  }

  const budgets = await sbGet<BudgetRow>(
    env,
    "budgets",
    // order: key-specific budgets first (scope_ref not null) so find() prefers them over org-wide
    `org_id=eq.${row.org_id}&is_active=eq.true&limit_type=eq.usd&select=id,scope,scope_ref,limit_value&order=scope_ref.desc.nullslast&limit=20`
  );

  // Prefer key-specific budget (scope_ref === row.id) over org-wide (scope_ref === null).
  const keyBudget =
    budgets.find((b) => b.scope === "key" && b.scope_ref === row.id) ??
    budgets.find((b) => b.scope === "key" && b.scope_ref === null);
  const limitUsd = keyBudget?.limit_value ?? Infinity;

  const keyDO = getDO(env.BudgetDO, `budget:key:${row.id}`);

  // Init the DO limit (idempotent).
  await keyDO.fetch(new Request("https://do/init", {
    method: "POST",
    body: JSON.stringify({ limitUsd }),
    headers: { "content-type": "application/json" },
  }));

  return { orgId: row.org_id, anthropicKey, limitUsd, keyDO, sessionDO: null, keyId: row.id };
}

async function lookupKey(keyHash: string, env: Env): Promise<LookupResult | null> {
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY && env.FG_MASTER_KEY) {
    return lookupKeyFromSupabase(keyHash, env);
  }
  const resolved = resolveSelfhostKey(keyHash, env);
  if (resolved === null) return null;
  // Self-host has no DB key id — use hash prefix as a stable identifier.
  return { ...resolved, keyDO: getDO(env.BudgetDO, `budget:key:${keyHash}`), sessionDO: null, keyId: keyHash.slice(0, 36) };
}

// ── Event emitter → Supabase usage_events + blocks (off hot path) ────────────────────────────

type EmitPayload = { type: string; orgId?: string; [k: string]: unknown };

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

// ── Lemon Squeezy webhook handler ────────────────────────────────────────────────────────────

// Events we act on — ignore all others to prevent accidental downgrades on unrelated events.
const LS_HANDLED_EVENTS = new Set([
  "subscription_created",
  "subscription_updated",
  "subscription_cancelled",
  "subscription_expired",
]);

// Constant-time HMAC-SHA256 verify. Parses hex defensively — rejects malformed signatures cleanly.
async function verifyLsSignature(body: string, signature: string, secret: string): Promise<boolean> {
  // Reject empty or non-hex signatures before touching crypto — avoids NaN/exception paths.
  if (!/^[0-9a-f]{1,}$/i.test(signature) || signature.length % 2 !== 0) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  const sigBytes = new Uint8Array((signature.match(/.{2}/g) ?? []).map((b) => parseInt(b, 16)));
  return crypto.subtle.verify("HMAC", key, sigBytes, enc.encode(body));
}

async function handleLsWebhook(request: Request, env: Env): Promise<Response> {
  if (!env.LEMON_SQUEEZY_WEBHOOK_SECRET) {
    return new Response(JSON.stringify({ error: "webhook not configured" }), { status: 500 });
  }

  const body = await request.text();
  const signature = request.headers.get("x-signature") ?? "";

  const valid = await verifyLsSignature(body, signature, env.LEMON_SQUEEZY_WEBHOOK_SECRET).catch(() => false);
  if (!valid) {
    console.error("[fuseguard:webhook] invalid signature");
    return new Response(JSON.stringify({ error: "invalid signature" }), { status: 401 });
  }

  let payload: {
    meta?: { event_name?: string; custom_data?: { org_id?: string } };
    data?: {
      attributes?: {
        status?: string;
        renews_at?: string;
        order_id?: number;
        customer_id?: number;
      };
      id?: string;
    };
  };

  try {
    payload = JSON.parse(body) as typeof payload;
  } catch {
    return new Response(JSON.stringify({ error: "invalid JSON" }), { status: 400 });
  }

  const eventName = payload.meta?.event_name ?? "";

  // Ignore unrelated events — prevents accidental plan downgrades from payment/other events.
  if (!LS_HANDLED_EVENTS.has(eventName)) {
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  const orgId = payload.meta?.custom_data?.org_id;
  const attrs = payload.data?.attributes;
  const lsSubId = payload.data?.id;

  if (!orgId || !attrs || !lsSubId) {
    console.warn("[fuseguard:webhook] missing org_id in custom_data", eventName);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  // HIGH: verify org_id exists in DB — custom_data is set via public checkout URL query param
  // so a signed-but-attacker-influenced org_id is possible. Reject unknown orgs.
  const orgRows = await sbGet<{ id: string }>(env, "orgs", `id=eq.${encodeURIComponent(orgId)}&select=id&limit=1`).catch(() => []);
  if (orgRows.length === 0) {
    console.warn("[fuseguard:webhook] org_id not found in DB", orgId, eventName);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  // Map LS status to our enum. Only explicit cancellation events reach here (gated above).
  const statusMap: Record<string, string> = {
    active: "active",
    past_due: "past_due",
    cancelled: "cancelled",
    expired: "cancelled",
    unpaid: "past_due",
  };
  const status = statusMap[attrs.status ?? ""] ?? "cancelled";

  const plans = await sbGet<{ id: string }>(env, "plans", "name=eq.pro&select=id&limit=1").catch(() => []);
  const proPlanId = plans[0]?.id;
  const freePlans = await sbGet<{ id: string }>(env, "plans", "name=eq.free&select=id&limit=1").catch(() => []);
  const freePlanId = freePlans[0]?.id;

  if (!proPlanId || !freePlanId) {
    console.error("[fuseguard:webhook] plans not found in DB");
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  const planId = status === "active" ? proPlanId : freePlanId;

  // Upsert subscription — idempotent on org_id (LS may replay).
  await sbUpsert(env, "subscriptions", "org_id", {
    org_id: orgId,
    lemon_squeezy_subscription_id: lsSubId,
    lemon_squeezy_order_id: attrs.order_id?.toString() ?? null,
    lemon_squeezy_customer_id: attrs.customer_id?.toString() ?? null,
    plan_id: planId,
    status,
    renews_at: attrs.renews_at ?? null,
    updated_at: new Date().toISOString(),
  });

  // Sync org plan_id.
  await fetch(`${env.SUPABASE_URL}/rest/v1/orgs?id=eq.${encodeURIComponent(orgId)}`, {
    method: "PATCH",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ plan_id: planId }),
  });

  console.log(`[fuseguard:webhook] ${eventName} org=${orgId} status=${status}`);
  return new Response(JSON.stringify({ ok: true }), { status: 200 });
}

// ── Worker export ─────────────────────────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ status: "ok" });
    }

    // Lemon Squeezy webhook
    if (request.method === "POST" && url.pathname === "/webhook/lemon-squeezy") {
      return handleLsWebhook(request, env);
    }

    // keyId threaded synchronously from lookupKey — no second DB round-trip, no race.
    let resolvedKeyId: string | undefined;

    const proxyEnv: ProxyEnv = {
      FAILURE_MODE: env.FAILURE_MODE ?? "closed",
      upstreamFetch: fetch,
      lookupKey: async (keyHash: string) => {
        const result = await lookupKey(keyHash, env);
        if (result) resolvedKeyId = result.keyId; // set synchronously before pipeline runs
        return result; // KeyLookupResult (extra keyId field ignored by proxy handler)
      },
      emitEvent: (e: unknown) => makeEmitter(env, resolvedKeyId)(e),
    };

    return proxyHandler(request, proxyEnv);
  },
} satisfies ExportedHandler<Env>;
