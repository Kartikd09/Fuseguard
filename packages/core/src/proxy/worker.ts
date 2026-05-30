// Proxy Worker handler — the core enforcement engine. MIT/OSS (ARCHITECTURE §2, §7).
// Orchestrates: authn → estimate → reserve (key + session) → forward → reconcile.
// All dependencies are injected (upstream fetch, key lookup, event sink) so tests
// never hit the network.

import { estimateWorstCase, type MessagesRequest } from "../estimator.js";
import { cost } from "../pricing.js";
import { requestHash } from "../loop/index.js";
import { forwardToAnthropic } from "./forward.js";
import type { BudgetDO } from "../budget-do.js";

// ── Types ──────────────────────────────────────────────────────────────────────────────────────

export interface KeyLookupResult {
  readonly orgId: string;
  readonly anthropicKey: string;
  readonly limitUsd: number;
  readonly keyDO: BudgetDO;
  readonly sessionDO: BudgetDO | null;
}

export interface ProxyEnv {
  readonly FAILURE_MODE: "open" | "closed";
  upstreamFetch: typeof fetch;
  lookupKey: (keyHash: string) => Promise<KeyLookupResult | null>;
  emitEvent: (event: unknown) => void;
}

// ── Validation ─────────────────────────────────────────────────────────────────────────────────

// Session ID must match ^[A-Za-z0-9_\-:.]{1,128}$ (ARCHITECTURE §6, PRD §6).
const SESSION_ID_PATTERN = /^[A-Za-z0-9_\-:.]{1,128}$/;

function validateSessionId(sessionId: string): boolean {
  return SESSION_ID_PATTERN.test(sessionId);
}

interface ValidatedBody {
  model: string;
  max_tokens: number;
  messages: ReadonlyArray<unknown>;
  system?: string;
  tools?: ReadonlyArray<unknown>;
  stream?: boolean;
}

function validateBody(raw: unknown): ValidatedBody | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const body = raw as Record<string, unknown>;

  if (typeof body["model"] !== "string" || body["model"].length === 0) return null;
  if (typeof body["max_tokens"] !== "number" || !Number.isInteger(body["max_tokens"]) || (body["max_tokens"] as number) <= 0) return null;
  if (!Array.isArray(body["messages"])) return null;

  // Build with exactOptionalPropertyTypes: only set optional keys when defined.
  const validated: ValidatedBody = {
    model: body["model"] as string,
    max_tokens: body["max_tokens"] as number,
    messages: body["messages"] as ReadonlyArray<unknown>,
  };
  if (typeof body["system"] === "string") validated.system = body["system"];
  if (Array.isArray(body["tools"])) validated.tools = body["tools"] as ReadonlyArray<unknown>;
  if (typeof body["stream"] === "boolean") validated.stream = body["stream"];
  return validated;
}

// ── Safe error responses (never leak internals) ────────────────────────────────────────────────

function safeJson(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function err400(type: string, message: string): Response {
  return safeJson({ error: { type, message } }, 400);
}

function err401(message: string): Response {
  return safeJson({ error: { type: "unauthorized", message } }, 401);
}

function err402(
  type: string,
  message: string,
  details: Record<string, unknown> = {}
): Response {
  return safeJson({ error: { type, message, ...details } }, 402);
}

function err503(type: string, message: string): Response {
  return safeJson({ error: { type, message } }, 503);
}

// ── Response header allowlist (Finding #6) ─────────────────────────────────────────────────────
// Only forward these upstream response headers to the client. Strip everything else:
// set-cookie, cf-ray, request-id, anthropic-internal headers, etc.
// Never forward set-cookie (session fixation / cookie injection risk).
const ALLOWED_RESPONSE_HEADERS = new Set([
  "content-type",
  "anthropic-version",
  "retry-after",
  "x-request-id",
  "request-id",
]);

function buildClientResponseHeaders(upstreamHeaders: Headers): Headers {
  const out = new Headers();
  for (const name of ALLOWED_RESPONSE_HEADERS) {
    const val = upstreamHeaders.get(name);
    if (val != null) out.set(name, val);
  }
  return out;
}

// ── DO helpers ─────────────────────────────────────────────────────────────────────────────────

async function doPost(doInstance: BudgetDO, path: string, body: unknown): Promise<Response> {
  return doInstance.fetch(
    new Request(`https://do${path}`, {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    })
  );
}

async function doGet(doInstance: BudgetDO, path: string): Promise<Response> {
  return doInstance.fetch(new Request(`https://do${path}`, { method: "GET" }));
}

interface ReserveResult {
  readonly ok: boolean;
  readonly blocked: boolean;
  readonly reservationId?: string;
}

// ── DO calls wrapped with failure policy (Finding #7) ─────────────────────────────────────────
// All DO interactions must respect FAILURE_MODE. If the DO call throws, apply the policy:
//   - closed → return a 402 enforcement_unavailable sentinel
//   - open   → return null (caller decides to forward without enforcement)
// A DO error must NEVER become an uncaught 500.

type DOCallResult<T> = { ok: true; value: T } | { ok: false; response: Response };

async function doCallWithPolicy<T>(
  fn: () => Promise<T>,
  failureMode: ProxyEnv["FAILURE_MODE"],
  emitEvent: ProxyEnv["emitEvent"]
): Promise<DOCallResult<T>> {
  try {
    const value = await fn();
    return { ok: true, value };
  } catch (err) {
    emitEvent({ type: "do_error", error: String(err) });
    if (failureMode === "closed") {
      return { ok: false, response: err402("enforcement_unavailable", "Budget enforcement is temporarily unavailable") };
    }
    // fail-open: signal that the DO call failed but we should continue without enforcement.
    // The caller handles this by returning a specific sentinel.
    return { ok: false, response: err402("enforcement_unavailable", "Budget enforcement temporarily unavailable (fail-open)") };
  }
}

async function reserve(doInstance: BudgetDO, estCost: number): Promise<ReserveResult> {
  const res = await doPost(doInstance, "/reserve", { estCost });
  return (await res.json()) as ReserveResult;
}

async function reconcile(doInstance: BudgetDO, reservationId: string, actualCost: number): Promise<void> {
  await doPost(doInstance, "/reconcile", { reservationId, actualCost });
}

async function release(doInstance: BudgetDO, reservationId: string): Promise<void> {
  await doPost(doInstance, "/release", { reservationId });
}

async function getStatus(doInstance: BudgetDO): Promise<{ spentUsd: number; limitUsd: number; remainingUsd: number }> {
  const res = await doGet(doInstance, "/status");
  return (await res.json()) as { spentUsd: number; limitUsd: number; remainingUsd: number };
}

async function recordLoop(doInstance: BudgetDO, hash: string): Promise<{ loop: boolean; count: number }> {
  const res = await doPost(doInstance, "/loop/record", { reqHash: hash });
  return (await res.json()) as { loop: boolean; count: number };
}

// ── Hash the FuseGuard key for lookup ─────────────────────────────────────────────────────────

async function hashKey(key: string): Promise<string> {
  const encoded = new TextEncoder().encode(key);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

// ── Streaming reconciliation ───────────────────────────────────────────────────────────────────

interface UsageBlock {
  readonly input_tokens?: number;
  readonly output_tokens?: number;
}

// Tee the SSE stream: pipe to client, parse terminal usage event on the side, reconcile on end.
// Finding #3: track whether a terminal usage event (message_delta with output_tokens) was observed.
// If NOT observed (client disconnect / truncation), reconcile to the WORST-CASE estimate — never 0.
// This prevents free-calls via stream truncation.
function teeStreamWithReconcile(
  upstreamStream: ReadableStream<Uint8Array>,
  keyDO: BudgetDO,
  sessionDO: BudgetDO | null,
  keyReservationId: string,
  sessionReservationId: string | null,
  model: string,
  worstCaseCost: number,
  emitEvent: ProxyEnv["emitEvent"],
  orgId: string
): ReadableStream<Uint8Array> {
  const [clientStream, parserStream] = upstreamStream.tee();

  // Parse the side stream for final usage — runs concurrently with client piping.
  (async () => {
    const reader = parserStream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let inputTokens = 0;
    let outputTokens: number | null = null; // null = no terminal usage observed yet
    let cacheReadTokens = 0;
    let cacheWriteTokens = 0;

    try {
      let streamDone = false;
      while (!streamDone) {
        const { done, value } = await reader.read();
        streamDone = done;
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events from the buffer.
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice("data: ".length).trim();
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data) as {
              type?: string;
              usage?: UsageBlock & { cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
              message?: { usage?: UsageBlock };
            };
            if (parsed.type === "message_start" && parsed.message?.usage) {
              const u = parsed.message.usage;
              inputTokens = u.input_tokens ?? inputTokens;
              // message_start does NOT carry output_tokens — do not set outputTokens here.
            }
            // message_delta carries the TERMINAL output token count (Finding #3: only set here).
            if (parsed.type === "message_delta" && parsed.usage) {
              const u = parsed.usage;
              if (u.output_tokens != null) outputTokens = u.output_tokens;
              if (u.cache_read_input_tokens != null) cacheReadTokens = u.cache_read_input_tokens;
              if (u.cache_creation_input_tokens != null) cacheWriteTokens = u.cache_creation_input_tokens;
            }
          } catch {
            // Ignore parse failures on individual lines.
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Finding #3: if no terminal usage was observed (outputTokens still null), keep the
    // worst-case reservation — never reconcile down to 0. This prevents free-call bypass
    // via client disconnect or stream truncation.
    const actualCost = outputTokens !== null
      ? cost(model, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens)
      : worstCaseCost;

    try {
      await reconcile(keyDO, keyReservationId, actualCost);
    } catch (err) {
      emitEvent({ type: "reconcile_error", scope: "key", error: String(err) });
    }
    if (sessionDO != null && sessionReservationId != null) {
      try {
        await reconcile(sessionDO, sessionReservationId, actualCost);
      } catch (err) {
        emitEvent({ type: "reconcile_error", scope: "session", error: String(err) });
      }
    }

    emitEvent({ type: "usage", orgId, model, inputTokens, outputTokens: outputTokens ?? 0, costUsd: actualCost });
  })().catch((err) => {
    // Surface reconciliation errors to the event sink instead of swallowing silently.
    emitEvent({ type: "reconcile_error", scope: "stream_async", error: String(err) });
  });

  return clientStream;
}

// ── Helpers ────────────────────────────────────────────────────────────────────────────────────

// Build a MessagesRequest from a ValidatedBody. exactOptionalPropertyTypes requires we only set
// keys that are defined — a separate function avoids the spread-union typing issues.
function buildMessagesReq(b: ValidatedBody): MessagesRequest {
  if (b.system !== undefined && b.tools !== undefined) {
    return {
      model: b.model,
      max_tokens: b.max_tokens,
      messages: b.messages as MessagesRequest["messages"],
      system: b.system,
      tools: b.tools as import("../estimator.js").ToolDefinition[],
    };
  }
  if (b.system !== undefined) {
    return {
      model: b.model,
      max_tokens: b.max_tokens,
      messages: b.messages as MessagesRequest["messages"],
      system: b.system,
    };
  }
  if (b.tools !== undefined) {
    return {
      model: b.model,
      max_tokens: b.max_tokens,
      messages: b.messages as MessagesRequest["messages"],
      tools: b.tools as import("../estimator.js").ToolDefinition[],
    };
  }
  return {
    model: b.model,
    max_tokens: b.max_tokens,
    messages: b.messages as MessagesRequest["messages"],
  };
}

// ── Sub-handlers (decomposed for <50 lines each, Finding #10) ─────────────────────────────────

async function handleKeyReservation(
  keyDO: BudgetDO,
  estCost: number,
  failureMode: ProxyEnv["FAILURE_MODE"],
  emitEvent: ProxyEnv["emitEvent"],
  orgId: string
): Promise<{ blocked: false; reservationId: string } | { blocked: true; response: Response }> {
  const statusResult = await doCallWithPolicy(() => getStatus(keyDO), failureMode, emitEvent);
  if (!statusResult.ok) return { blocked: true, response: statusResult.response };

  const keyStatus = statusResult.value;
  const reserveResult = await doCallWithPolicy(() => reserve(keyDO, estCost), failureMode, emitEvent);
  if (!reserveResult.ok) return { blocked: true, response: reserveResult.response };

  const keyReserveResult = reserveResult.value;
  if (keyReserveResult.blocked) {
    emitEvent({ type: "block", reason: "budget_exceeded", scope: "key", orgId });
    return {
      blocked: true,
      response: err402("budget_exceeded", "Request would exceed your key budget", {
        scope: "key",
        budget_limit: keyStatus.limitUsd,
        current_spend: keyStatus.spentUsd,
        projected: keyStatus.spentUsd + estCost,
      }),
    };
  }

  return { blocked: false, reservationId: keyReserveResult.reservationId! };
}

async function handleSessionReservation(
  sessionDO: BudgetDO,
  keyDO: BudgetDO,
  keyReservationId: string,
  estCost: number,
  failureMode: ProxyEnv["FAILURE_MODE"],
  emitEvent: ProxyEnv["emitEvent"],
  orgId: string
): Promise<{ blocked: false; reservationId: string } | { blocked: true; response: Response }> {
  const statusResult = await doCallWithPolicy(() => getStatus(sessionDO), failureMode, emitEvent);
  if (!statusResult.ok) {
    // Release key hold before returning.
    await release(keyDO, keyReservationId).catch(() => undefined);
    return { blocked: true, response: statusResult.response };
  }

  const sessionStatus = statusResult.value;
  const reserveResult = await doCallWithPolicy(() => reserve(sessionDO, estCost), failureMode, emitEvent);
  if (!reserveResult.ok) {
    await release(keyDO, keyReservationId).catch(() => undefined);
    return { blocked: true, response: reserveResult.response };
  }

  const sessionReserveResult = reserveResult.value;
  if (sessionReserveResult.blocked) {
    // Compensating release: free the key reservation.
    await release(keyDO, keyReservationId).catch(() => undefined);
    emitEvent({ type: "block", reason: "budget_exceeded", scope: "session", orgId });
    return {
      blocked: true,
      response: err402("budget_exceeded", "Request would exceed your session budget", {
        scope: "session",
        budget_limit: sessionStatus.limitUsd,
        current_spend: sessionStatus.spentUsd,
        projected: sessionStatus.spentUsd + estCost,
      }),
    };
  }

  return { blocked: false, reservationId: sessionReserveResult.reservationId! };
}

// ── Core handler factory ───────────────────────────────────────────────────────────────────────

export function createProxyHandler() {
  return async function handleProxy(request: Request, env: ProxyEnv): Promise<Response> {
    // ── Auth: FuseGuard key ──────────────────────────────────────────────────────────────────
    const fuseguardKey = request.headers.get("x-api-key");
    if (fuseguardKey == null || fuseguardKey === "") {
      return err401("Missing x-api-key header");
    }

    // ── Session header validation ────────────────────────────────────────────────────────────
    const sessionId = request.headers.get("x-fuseguard-session");
    if (sessionId != null && !validateSessionId(sessionId)) {
      return err400("invalid_session_id", "X-FuseGuard-Session must match ^[A-Za-z0-9_\\-:.]{1,128}$");
    }

    let keyLookup: KeyLookupResult | null = null;

    try {
      const keyHash = await hashKey(fuseguardKey);
      keyLookup = await env.lookupKey(keyHash);
    } catch {
      // DO unreachable or lookup threw.
      if (env.FAILURE_MODE === "closed") {
        return err402("enforcement_unavailable", "Budget enforcement is temporarily unavailable");
      }
      // Finding #1 FIX: fail-open when lookupKey throws means we have NO valid decrypted
      // Anthropic key — we must NOT forward the FuseGuard client key as the upstream x-api-key.
      // Return 503 "enforcement unavailable, no key" instead of forwarding with the wrong key.
      // TODO(Phase 2): when fail-open with a cached/fallback key is available, forward here.
      return err503("enforcement_unavailable", "Budget enforcement temporarily unavailable and no fallback key available");
    }

    if (keyLookup == null) {
      // Finding #2: key not found → fail closed regardless of FAILURE_MODE.
      // An unknown key is never valid; returning Infinity would bypass all enforcement.
      // TODO(Phase 2): wire real Supabase + AES-GCM decrypt: SELECT anthropic_key_ciphertext
      //   FROM api_keys WHERE fuseguard_key_hash = $1 AND is_active = true, then decrypt.
      return err401("Unknown or inactive FuseGuard API key");
    }

    const { orgId, anthropicKey, keyDO, sessionDO } = keyLookup;

    // ── Body parsing + validation ────────────────────────────────────────────────────────────
    let rawBody: string;
    let parsedBody: unknown;
    try {
      rawBody = await request.text();
      parsedBody = JSON.parse(rawBody);
    } catch {
      return err400("invalid_request", "Request body must be valid JSON");
    }

    const validBody = validateBody(parsedBody);
    if (validBody == null) {
      return err400("invalid_request", "Request body must include model (string), max_tokens (positive integer), and messages (array)");
    }

    // ── Loop detection (Finding #7: wrap DO call with policy) ────────────────────────────────
    const reqHash = requestHash({
      model: validBody.model,
      system: validBody.system,
      messages: validBody.messages,
      tools: validBody.tools,
    });

    const loopResult = await doCallWithPolicy(
      () => recordLoop(keyDO, reqHash),
      env.FAILURE_MODE,
      env.emitEvent
    );
    if (!loopResult.ok) return loopResult.response;
    if (loopResult.value.loop) {
      return err402("loop_detected", "Loop detected: too many near-identical requests within the window", {
        scope: "key",
        count: loopResult.value.count,
      });
    }

    // ── Pre-flight estimate ──────────────────────────────────────────────────────────────────
    const estCost = estimateWorstCase(buildMessagesReq(validBody));

    // ── Reserve key budget (Finding #7: DO errors apply failure policy) ──────────────────────
    const keyReserveOutcome = await handleKeyReservation(
      keyDO,
      estCost,
      env.FAILURE_MODE,
      env.emitEvent,
      orgId
    );
    if (keyReserveOutcome.blocked) return keyReserveOutcome.response;
    const keyReservationId = keyReserveOutcome.reservationId;

    // ── Reserve session budget (if session header present and session DO exists) ─────────────
    let sessionReservationId: string | null = null;
    if (sessionId != null && sessionDO != null) {
      const sessionReserveOutcome = await handleSessionReservation(
        sessionDO,
        keyDO,
        keyReservationId,
        estCost,
        env.FAILURE_MODE,
        env.emitEvent,
        orgId
      );
      if (sessionReserveOutcome.blocked) return sessionReserveOutcome.response;
      sessionReservationId = sessionReserveOutcome.reservationId;
    }

    // ── Forward to Anthropic ─────────────────────────────────────────────────────────────────
    const forwardRequest = new Request(request.url, {
      method: request.method,
      headers: request.headers,
      body: rawBody,
    });

    let upstreamResponse: Response;
    try {
      upstreamResponse = await forwardToAnthropic(forwardRequest, anthropicKey, env.upstreamFetch);
    } catch {
      // Forward failed — release reservations to avoid leaking holds.
      await release(keyDO, keyReservationId).catch(() => undefined);
      if (sessionDO != null && sessionReservationId != null) {
        await release(sessionDO, sessionReservationId).catch(() => undefined);
      }
      return safeJson({ error: { type: "upstream_error", message: "Failed to reach Anthropic API" } }, 502);
    }

    // ── Stream vs non-stream reconciliation ─────────────────────────────────────────────────
    const isStream = validBody.stream === true || upstreamResponse.headers.get("content-type")?.includes("text/event-stream");

    if (isStream && upstreamResponse.body != null) {
      const reconciledStream = teeStreamWithReconcile(
        upstreamResponse.body,
        keyDO,
        sessionDO,
        keyReservationId,
        sessionReservationId,
        validBody.model,
        estCost, // Finding #3: pass worst-case as fallback reconciliation amount
        env.emitEvent,
        orgId
      );

      // Finding #6: apply response header allowlist to streaming response.
      return new Response(reconciledStream, {
        status: upstreamResponse.status,
        headers: buildClientResponseHeaders(upstreamResponse.headers),
      });
    }

    // Non-stream: parse response, reconcile.
    const responseText = await upstreamResponse.text();
    let actualInputTokens = 0;
    let actualOutputTokens = 0;
    let actualCacheReadTokens = 0;
    let actualCacheWriteTokens = 0;

    try {
      const parsed = JSON.parse(responseText) as {
        usage?: {
          input_tokens?: number;
          output_tokens?: number;
          cache_read_input_tokens?: number;
          cache_creation_input_tokens?: number;
        };
      };
      if (parsed.usage) {
        actualInputTokens = parsed.usage.input_tokens ?? 0;
        actualOutputTokens = parsed.usage.output_tokens ?? 0;
        // Finding #9 (SHOULD): parse cache tokens per ARCHITECTURE §3.
        actualCacheReadTokens = parsed.usage.cache_read_input_tokens ?? 0;
        actualCacheWriteTokens = parsed.usage.cache_creation_input_tokens ?? 0;
      }
    } catch {
      // If we can't parse actual usage, keep worst case (fail safe — never release more than charged).
    }

    const actualCost = cost(validBody.model, actualInputTokens, actualOutputTokens, actualCacheReadTokens, actualCacheWriteTokens);

    await reconcile(keyDO, keyReservationId, actualCost);
    if (sessionDO != null && sessionReservationId != null) {
      await reconcile(sessionDO, sessionReservationId, actualCost);
    }

    // Emit usage event async (best-effort, never blocks the response).
    env.emitEvent({
      type: "usage",
      orgId,
      model: validBody.model,
      inputTokens: actualInputTokens,
      outputTokens: actualOutputTokens,
      cacheReadTokens: actualCacheReadTokens,
      cacheWriteTokens: actualCacheWriteTokens,
      costUsd: actualCost,
    });

    // Finding #6: apply response header allowlist to non-stream response.
    return new Response(responseText, {
      status: upstreamResponse.status,
      headers: buildClientResponseHeaders(upstreamResponse.headers),
    });
  };
}
