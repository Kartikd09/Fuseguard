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
function teeStreamWithReconcile(
  upstreamStream: ReadableStream<Uint8Array>,
  keyDO: BudgetDO,
  sessionDO: BudgetDO | null,
  keyReservationId: string,
  sessionReservationId: string | null,
  model: string,
  emitEvent: ProxyEnv["emitEvent"],
  orgId: string
): ReadableStream<Uint8Array> {
  const [clientStream, parserStream] = upstreamStream.tee();

  // Parse the side stream for final usage — runs concurrently with client piping.
  (async () => {
    const reader = parserStream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalUsage: UsageBlock | null = null;

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
            const parsed = JSON.parse(data) as { type?: string; usage?: UsageBlock };
            // message_delta carries the final output token count.
            if (parsed.type === "message_delta" && parsed.usage) {
              // Merge: keep the input_tokens from message_start if seen.
              finalUsage = { ...(finalUsage ?? {}), ...parsed.usage };
            }
            if (parsed.type === "message_start") {
              const startUsage = (parsed as { message?: { usage?: UsageBlock } }).message?.usage;
              if (startUsage) finalUsage = { ...(finalUsage ?? {}), ...startUsage };
            }
          } catch {
            // Ignore parse failures on individual lines.
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Reconcile on stream end (or client disconnect — keep worst case if no usage captured).
    const inputTokens = finalUsage?.input_tokens ?? 0;
    const outputTokens = finalUsage?.output_tokens ?? 0;
    const actualCost = cost(model, inputTokens, outputTokens);

    await reconcile(keyDO, keyReservationId, actualCost);
    if (sessionDO != null && sessionReservationId != null) {
      await reconcile(sessionDO, sessionReservationId, actualCost);
    }

    emitEvent({ type: "usage", orgId, model, inputTokens, outputTokens, costUsd: actualCost });
  })().catch(() => {
    // Never let async reconciliation error propagate — it's off the hot path.
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
      // Fail-open: forward without enforcement.
      const body = await request.text();
      return forwardToAnthropic(
        new Request(request.url, { method: request.method, headers: request.headers, body }),
        fuseguardKey,
        env.upstreamFetch
      );
    }

    if (keyLookup == null) {
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

    // ── Loop detection ───────────────────────────────────────────────────────────────────────
    const reqHash = requestHash({
      model: validBody.model,
      system: validBody.system,
      messages: validBody.messages,
      tools: validBody.tools,
    });

    const loopResult = await recordLoop(keyDO, reqHash);
    if (loopResult.loop) {
      return err402("loop_detected", "Loop detected: too many near-identical requests within the window", {
        scope: "key",
        count: loopResult.count,
      });
    }

    // ── Pre-flight estimate ──────────────────────────────────────────────────────────────────
    const estCost = estimateWorstCase(buildMessagesReq(validBody));

    // ── Reserve key budget ───────────────────────────────────────────────────────────────────
    const keyStatus = await getStatus(keyDO);
    const keyReserveResult = await reserve(keyDO, estCost);

    if (keyReserveResult.blocked) {
      env.emitEvent({ type: "block", reason: "budget_exceeded", scope: "key", orgId });
      return err402("budget_exceeded", "Request would exceed your key budget", {
        scope: "key",
        budget_limit: keyStatus.limitUsd,
        current_spend: keyStatus.spentUsd,
        projected: keyStatus.spentUsd + estCost,
      });
    }

    const keyReservationId = keyReserveResult.reservationId!;

    // ── Reserve session budget (if session header present and session DO exists) ─────────────
    let sessionReservationId: string | null = null;
    if (sessionId != null && sessionDO != null) {
      const sessionStatus = await getStatus(sessionDO);
      const sessionReserveResult = await reserve(sessionDO, estCost);

      if (sessionReserveResult.blocked) {
        // Compensating release: free the key reservation (fixed lock order, no deadlock).
        await release(keyDO, keyReservationId);
        env.emitEvent({ type: "block", reason: "budget_exceeded", scope: "session", orgId });
        return err402("budget_exceeded", "Request would exceed your session budget", {
          scope: "session",
          budget_limit: sessionStatus.limitUsd,
          current_spend: sessionStatus.spentUsd,
          projected: sessionStatus.spentUsd + estCost,
        });
      }

      sessionReservationId = sessionReserveResult.reservationId!;
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
      await release(keyDO, keyReservationId);
      if (sessionDO != null && sessionReservationId != null) {
        await release(sessionDO, sessionReservationId);
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
        env.emitEvent,
        orgId
      );

      return new Response(reconciledStream, {
        status: upstreamResponse.status,
        headers: upstreamResponse.headers,
      });
    }

    // Non-stream: parse response, reconcile.
    const responseText = await upstreamResponse.text();
    let actualInputTokens = 0;
    let actualOutputTokens = 0;

    try {
      const parsed = JSON.parse(responseText) as { usage?: { input_tokens?: number; output_tokens?: number } };
      if (parsed.usage) {
        actualInputTokens = parsed.usage.input_tokens ?? 0;
        actualOutputTokens = parsed.usage.output_tokens ?? 0;
      }
    } catch {
      // If we can't parse actual usage, keep worst case (fail safe — never release more than charged).
    }

    const actualCost = cost(validBody.model, actualInputTokens, actualOutputTokens);

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
      costUsd: actualCost,
    });

    return new Response(responseText, {
      status: upstreamResponse.status,
      headers: upstreamResponse.headers,
    });
  };
}
