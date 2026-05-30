// Worker proxy tests: Tasks 6, 7, 9, 10, 12, 13 + integration (Tasks 4, 6).
// All Anthropic upstream calls and Supabase event sinks are mocked at the boundary.
// No real network calls.

import { describe, expect, it, vi } from "vitest";
import type { ProxyEnv } from "./worker.js";
import { createProxyHandler } from "./worker.js";

// ── Fixtures ───────────────────────────────────────────────────────────────────────────────────

const VALID_ANTHROPIC_RESPONSE = JSON.stringify({
  id: "msg_01XFDUDYJgAACzvnptvVoYEL",
  type: "message",
  role: "assistant",
  content: [{ type: "text", text: "Hello!" }],
  model: "claude-sonnet-4",
  stop_reason: "end_turn",
  usage: { input_tokens: 10, output_tokens: 5 },
});

const BASE_MESSAGES_BODY = JSON.stringify({
  model: "claude-sonnet-4",
  max_tokens: 100,
  messages: [{ role: "user", content: "hello" }],
});

// ── Mock key store ─────────────────────────────────────────────────────────────────────────────
// In tests, lookupKey is injected as a stub that always resolves to the test record.
// Production behaviour (hash → DB row → decryption) is covered by auth.test.ts + crypto tests.

// ── Mock DO factory ────────────────────────────────────────────────────────────────────────────
// Returns a stub DurableObjectNamespace that delegates to an in-process BudgetDO.
// This keeps concurrency behaviour correct while avoiding Miniflare.

import { BudgetDO } from "../budget-do.js";

class FakeStorage {
  private store = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | undefined> {
    return this.store.get(key) as T | undefined;
  }
  async put(key: string, value: unknown): Promise<void> {
    this.store.set(key, value);
  }
  async transaction<T>(closure: (txn: FakeStorage) => Promise<T>): Promise<T> {
    return closure(this);
  }
}

class FakeDOState {
  readonly storage = new FakeStorage();
  blockConcurrencyWhile(fn: () => Promise<unknown>): Promise<unknown> {
    return fn();
  }
}

function makeBudgetDO(_limitUsd: number): BudgetDO {
  const env = { ANTHROPIC_UPSTREAM: "https://api.anthropic.com", FAILURE_MODE: "closed" as const };
  const doInstance = new BudgetDO(new FakeDOState() as unknown as DurableObjectState, env);
  // Init budget synchronously via a fire-and-forget; tests await before first reserve.
  return doInstance;
}

async function initialiseDO(doInstance: BudgetDO, limitUsd: number): Promise<void> {
  await doInstance.fetch(
    new Request("https://do/init", {
      method: "POST",
      body: JSON.stringify({ limitUsd }),
      headers: { "content-type": "application/json" },
    })
  );
}

// ── Test helpers ───────────────────────────────────────────────────────────────────────────────

function makeUpstreamFetch(responseBody: string, status = 200): typeof fetch {
  // Use mockImplementation (not mockResolvedValue) so each call gets a fresh Response.
  // A single Response body can only be read once; reusing the same object causes
  // "Body is unusable" on the second read.
  return vi.fn().mockImplementation(
    async () =>
      new Response(responseBody, {
        status,
        headers: { "content-type": "application/json" },
      })
  );
}

function makeRequest(
  body: string,
  extraHeaders: Record<string, string> = {}
): Request {
  return new Request("https://fuseguard.app/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": "fg_test-key",
      ...extraHeaders,
    },
    body,
  });
}

interface TestEnvOptions {
  limitUsd?: number;
  failureMode?: "open" | "closed";
  doBudget?: BudgetDO;
  upstreamFetch?: typeof fetch;
  eventSink?: (event: unknown) => void;
}

async function buildEnv(opts: TestEnvOptions = {}): Promise<{
  env: ProxyEnv;
  keyDO: BudgetDO;
}> {
  const limitUsd = opts.limitUsd ?? 1.0;
  const keyDO = opts.doBudget ?? makeBudgetDO(limitUsd);
  await initialiseDO(keyDO, limitUsd);

  const env: ProxyEnv = {
    FAILURE_MODE: opts.failureMode ?? "closed",
    // Inject the fetch fn; the worker uses this for upstream calls.
    upstreamFetch: opts.upstreamFetch ?? makeUpstreamFetch(VALID_ANTHROPIC_RESPONSE),
    // Injected key lookup: accepts any hash and returns the test record.
    // Production logic (hash → DB row) is tested via auth.test.ts. Here we verify
    // the enforcement behaviour with a simple stub.
    lookupKey: async (_keyHash: string) => {
      return {
        orgId: "org-1",
        anthropicKey: "sk-ant-real",
        limitUsd,
        keyDO,
        sessionDO: null,
      };
    },
    // Injected event sink — no Supabase in tests.
    emitEvent: opts.eventSink ?? vi.fn(),
  };

  return { env, keyDO };
}

// ── Task 6: Hard kill — 402 budget_exceeded ────────────────────────────────────────────────────
describe("Hard kill — per-key budget (FR-3, Task 6)", () => {
  it("returns 402 budget_exceeded when budget is exhausted, no upstream call made", async () => {
    const upstreamFetch = makeUpstreamFetch(VALID_ANTHROPIC_RESPONSE);
    // Zero budget — every call is over-budget.
    const { env } = await buildEnv({ limitUsd: 0.0, upstreamFetch });
    const handler = createProxyHandler();

    const request = makeRequest(BASE_MESSAGES_BODY);
    const response = await handler(request, env);

    expect(response.status).toBe(402);
    const body = (await response.json()) as {
      error: { type: string; scope: string; budget_limit: number; current_spend: number; projected: number; message: string };
    };
    expect(body.error.type).toBe("budget_exceeded");
    expect(body.error.scope).toBe("key");
    expect(typeof body.error.budget_limit).toBe("number");
    expect(typeof body.error.current_spend).toBe("number");
    expect(typeof body.error.projected).toBe("number");
    expect(typeof body.error.message).toBe("string");
    // Upstream must NOT have been called.
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it("emits a block event when blocking due to budget (FR-6)", async () => {
    const eventSink = vi.fn();
    const { env } = await buildEnv({ limitUsd: 0.0, eventSink });
    const handler = createProxyHandler();

    await handler(makeRequest(BASE_MESSAGES_BODY), env);

    expect(eventSink).toHaveBeenCalledWith(
      expect.objectContaining({ type: "block", reason: "budget_exceeded" })
    );
  });

  it("allows a call when budget is sufficient", async () => {
    const upstreamFetch = makeUpstreamFetch(VALID_ANTHROPIC_RESPONSE);
    const { env } = await buildEnv({ limitUsd: 10.0, upstreamFetch });
    const handler = createProxyHandler();

    const response = await handler(makeRequest(BASE_MESSAGES_BODY), env);

    expect(response.status).toBe(200);
    expect(upstreamFetch).toHaveBeenCalledOnce();
  });
});

// ── Task 7: Per-session budget ─────────────────────────────────────────────────────────────────
describe("Per-session budget (FR-2/FR-3, Task 7)", () => {
  it("skips session budget when X-FuseGuard-Session header is absent (key budget still applies)", async () => {
    const upstreamFetch = makeUpstreamFetch(VALID_ANTHROPIC_RESPONSE);
    const { env } = await buildEnv({ limitUsd: 10.0, upstreamFetch });
    const handler = createProxyHandler();

    // No session header — should still work (key budget applies, no session budget enforced).
    const response = await handler(makeRequest(BASE_MESSAGES_BODY), env);
    expect(response.status).toBe(200);
  });

  it("blocks on session budget when session budget is exhausted", async () => {
    const upstreamFetch = makeUpstreamFetch(VALID_ANTHROPIC_RESPONSE);
    const sessionDO = makeBudgetDO(0); // Session limit = $0
    await initialiseDO(sessionDO, 0);

    const { env } = await buildEnv({ limitUsd: 10.0, upstreamFetch });
    // Override lookupKey to return a session DO with zero budget.
    const keyDO = makeBudgetDO(10);
    await initialiseDO(keyDO, 10);
    env.lookupKey = async () => ({
      orgId: "org-1",
      anthropicKey: "sk-ant-real",
      limitUsd: 10,
      keyDO,
      sessionDO, // exhausted
    });

    const handler = createProxyHandler();
    const response = await handler(
      makeRequest(BASE_MESSAGES_BODY, { "x-fuseguard-session": "sess-exhausted" }),
      env
    );

    expect(response.status).toBe(402);
    const body = (await response.json()) as { error: { type: string; scope: string } };
    expect(body.error.type).toBe("budget_exceeded");
    expect(body.error.scope).toBe("session");
    // Upstream must NOT have been called.
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it("releases key reservation when session budget blocks (compensating release)", async () => {
    const upstreamFetch = makeUpstreamFetch(VALID_ANTHROPIC_RESPONSE);
    // Key has plenty of budget, session has zero.
    const keyDO = makeBudgetDO(100);
    await initialiseDO(keyDO, 100);
    const sessionDO = makeBudgetDO(0);
    await initialiseDO(sessionDO, 0);

    const { env } = await buildEnv({ limitUsd: 100.0, upstreamFetch });
    env.lookupKey = async () => ({
      orgId: "org-1",
      anthropicKey: "sk-ant-real",
      limitUsd: 100,
      keyDO,
      sessionDO,
    });

    const handler = createProxyHandler();
    await handler(
      makeRequest(BASE_MESSAGES_BODY, { "x-fuseguard-session": "sess-zero" }),
      env
    );

    // After compensating release, key DO's reserved should be 0 (not stuck holding a reservation).
    const statusReq = new Request("https://do/status", { method: "GET" });
    const statusRes = await keyDO.fetch(statusReq);
    const status = (await statusRes.json()) as { reservedUsd: number };
    expect(status.reservedUsd).toBeCloseTo(0, 6);
  });
});

// ── Task 9: Post-flight reconciliation ────────────────────────────────────────────────────────
describe("Post-flight reconciliation (Task 9)", () => {
  it("reconciles actual cost (not worst case) into the DO counter", async () => {
    const upstreamFetch = makeUpstreamFetch(VALID_ANTHROPIC_RESPONSE);
    const keyDO = makeBudgetDO(10);
    await initialiseDO(keyDO, 10);

    const { env } = await buildEnv({ limitUsd: 10.0, upstreamFetch });
    env.lookupKey = async () => ({
      orgId: "org-1",
      anthropicKey: "sk-ant-real",
      limitUsd: 10,
      keyDO,
      sessionDO: null,
    });

    const handler = createProxyHandler();
    await handler(makeRequest(BASE_MESSAGES_BODY), env);

    const statusRes = await keyDO.fetch(new Request("https://do/status", { method: "GET" }));
    const status = (await statusRes.json()) as { spentUsd: number; reservedUsd: number };

    // Should be reconciled (reservedUsd=0) and spentUsd should reflect actual (not max_tokens).
    expect(status.reservedUsd).toBeCloseTo(0, 6);
    expect(status.spentUsd).toBeGreaterThan(0);
  });

  it("emits a usage event with actual tokens after reconciliation", async () => {
    const eventSink = vi.fn();
    const { env } = await buildEnv({ limitUsd: 10.0, eventSink });
    const handler = createProxyHandler();

    await handler(makeRequest(BASE_MESSAGES_BODY), env);

    expect(eventSink).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "usage",
        inputTokens: 10,
        outputTokens: 5,
      })
    );
  });
});

// ── Task 10: Streaming ────────────────────────────────────────────────────────────────────────
describe("Streaming (stream:true, Task 10)", () => {
  function makeStreamBody(): string {
    return JSON.stringify({
      model: "claude-sonnet-4",
      max_tokens: 100,
      stream: true,
      messages: [{ role: "user", content: "hello" }],
    });
  }

  function makeSSEStream(usage?: { input_tokens: number; output_tokens: number }): ReadableStream<Uint8Array> {
    const enc = new TextEncoder();
    const events: string[] = [
      "data: " + JSON.stringify({ type: "message_start", message: { id: "msg_1", model: "claude-sonnet-4", usage: { input_tokens: 10 } } }) + "\n\n",
      "data: " + JSON.stringify({ type: "content_block_delta", delta: { type: "text_delta", text: "Hello" } }) + "\n\n",
      "data: " + JSON.stringify({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: usage ?? { output_tokens: 5 } }) + "\n\n",
      "data: " + JSON.stringify({ type: "message_stop" }) + "\n\n",
    ];

    return new ReadableStream<Uint8Array>({
      start(controller) {
        for (const event of events) {
          controller.enqueue(enc.encode(event));
        }
        controller.close();
      },
    });
  }

  it("pipes streaming response to client (non-blocking stream)", async () => {
    const sseStream = makeSSEStream();
    const upstreamFetch = vi.fn().mockResolvedValue(
      new Response(sseStream, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      })
    );

    const { env } = await buildEnv({ limitUsd: 10.0, upstreamFetch });
    const handler = createProxyHandler();

    const response = await handler(makeRequest(makeStreamBody()), env);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
  });

  it("reconciles actual streaming usage after stream end", async () => {
    const sseStream = makeSSEStream({ input_tokens: 10, output_tokens: 5 });
    const upstreamFetch = vi.fn().mockResolvedValue(
      new Response(sseStream, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      })
    );
    const keyDO = makeBudgetDO(10);
    await initialiseDO(keyDO, 10);
    const eventSink = vi.fn();

    const { env } = await buildEnv({ limitUsd: 10.0, upstreamFetch, eventSink });
    env.lookupKey = async () => ({
      orgId: "org-1",
      anthropicKey: "sk-ant-real",
      limitUsd: 10,
      keyDO,
      sessionDO: null,
    });

    const handler = createProxyHandler();
    const response = await handler(makeRequest(makeStreamBody()), env);

    // Consume the stream so reconciliation fires.
    if (response.body) {
      const reader = response.body.getReader();
      let done = false;
      while (!done) {
        ({ done } = await reader.read());
      }
    }

    // Give the async reconciliation time to run (it's queued after stream close).
    await new Promise((resolve) => setTimeout(resolve, 50));

    const statusRes = await keyDO.fetch(new Request("https://do/status", { method: "GET" }));
    const status = (await statusRes.json()) as { reservedUsd: number; spentUsd: number };
    expect(status.reservedUsd).toBeCloseTo(0, 6);
    expect(status.spentUsd).toBeGreaterThan(0);
  });
});

// ── Task 12: Fail-closed / fail-open ──────────────────────────────────────────────────────────
describe("Fail-closed / fail-open (Task 12)", () => {
  it("returns 402 enforcement_unavailable when DO is unreachable and FAILURE_MODE=closed", async () => {
    const upstreamFetch = makeUpstreamFetch(VALID_ANTHROPIC_RESPONSE);
    const { env } = await buildEnv({ limitUsd: 10.0, upstreamFetch, failureMode: "closed" });

    // Override lookupKey to throw (simulating DO unreachable).
    env.lookupKey = async () => {
      throw new Error("DO unreachable");
    };

    const handler = createProxyHandler();
    const response = await handler(makeRequest(BASE_MESSAGES_BODY), env);

    expect(response.status).toBe(402);
    const body = (await response.json()) as { error: { type: string } };
    expect(body.error.type).toBe("enforcement_unavailable");
    expect(upstreamFetch).not.toHaveBeenCalled();
  });

  it("forwards when DO is unreachable and FAILURE_MODE=open", async () => {
    const upstreamFetch = makeUpstreamFetch(VALID_ANTHROPIC_RESPONSE);
    const { env } = await buildEnv({ limitUsd: 10.0, upstreamFetch, failureMode: "open" });

    env.lookupKey = async () => {
      throw new Error("DO unreachable");
    };

    const handler = createProxyHandler();
    const response = await handler(makeRequest(BASE_MESSAGES_BODY), env);

    expect(response.status).toBe(200);
    expect(upstreamFetch).toHaveBeenCalledOnce();
  });
});

// ── Task 13: Error hygiene + validation ───────────────────────────────────────────────────────
describe("Error hygiene + input validation (Task 13)", () => {
  it("returns 400 for malformed JSON body", async () => {
    const { env } = await buildEnv();
    const handler = createProxyHandler();

    const request = new Request("https://fuseguard.app/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": "fg_test-key" },
      body: "not-json{{{",
    });

    const response = await handler(request, env);
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { type: string } };
    expect(body.error.type).toBe("invalid_request");
  });

  it("returns 400 for missing model field in body", async () => {
    const { env } = await buildEnv();
    const handler = createProxyHandler();

    const request = makeRequest(JSON.stringify({ max_tokens: 100, messages: [] }));
    const response = await handler(request, env);
    expect(response.status).toBe(400);
  });

  it("returns 400 for missing max_tokens field", async () => {
    const { env } = await buildEnv();
    const handler = createProxyHandler();

    const request = makeRequest(
      JSON.stringify({ model: "claude-sonnet-4", messages: [{ role: "user", content: "hi" }] })
    );
    const response = await handler(request, env);
    expect(response.status).toBe(400);
  });

  it("returns 400 for invalid X-FuseGuard-Session format", async () => {
    const { env } = await buildEnv();
    const handler = createProxyHandler();

    const request = makeRequest(BASE_MESSAGES_BODY, {
      "x-fuseguard-session": "bad session with spaces!", // invalid
    });
    const response = await handler(request, env);
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { type: string } };
    expect(body.error.type).toBe("invalid_session_id");
  });

  it("returns 400 for session header exceeding 128 characters", async () => {
    const { env } = await buildEnv();
    const handler = createProxyHandler();

    const longSession = "a".repeat(129);
    const request = makeRequest(BASE_MESSAGES_BODY, {
      "x-fuseguard-session": longSession,
    });
    const response = await handler(request, env);
    expect(response.status).toBe(400);
  });

  it("returns 401 for missing x-api-key header", async () => {
    const { env } = await buildEnv();
    const handler = createProxyHandler();

    const request = new Request("https://fuseguard.app/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: BASE_MESSAGES_BODY,
    });

    const response = await handler(request, env);
    expect(response.status).toBe(401);
  });

  it("returns 401 for unknown FuseGuard key", async () => {
    const { env } = await buildEnv();
    env.lookupKey = async () => null; // key not found

    const handler = createProxyHandler();
    const response = await handler(makeRequest(BASE_MESSAGES_BODY), env);

    expect(response.status).toBe(401);
  });

  it("never leaks Anthropic key in error responses", async () => {
    const { env } = await buildEnv({ limitUsd: 0 }); // will block
    const handler = createProxyHandler();

    const response = await handler(makeRequest(BASE_MESSAGES_BODY), env);
    const bodyText = await response.text();

    expect(bodyText).not.toContain("sk-ant");
    expect(bodyText).not.toContain("sk-ant-real");
  });

  it("never leaks stack traces in error responses", async () => {
    const { env } = await buildEnv();
    env.lookupKey = async () => {
      throw new TypeError("Internal storage error at budget-do.ts:42");
    };

    const handler = createProxyHandler();
    const response = await handler(makeRequest(BASE_MESSAGES_BODY), env);
    const bodyText = await response.text();

    expect(bodyText).not.toContain("budget-do.ts");
    expect(bodyText).not.toContain("TypeError");
    expect(bodyText).not.toContain("stack");
  });
});

// ── Integration tests: end-to-end flow ────────────────────────────────────────────────────────
describe("Integration: end-to-end proxy flow", () => {
  it("allowed request: worker → reserve → anthropic → reconcile", async () => {
    const upstreamFetch = makeUpstreamFetch(VALID_ANTHROPIC_RESPONSE);
    const keyDO = makeBudgetDO(10);
    await initialiseDO(keyDO, 10);
    const eventSink = vi.fn();

    const { env } = await buildEnv({ limitUsd: 10.0, upstreamFetch, eventSink });
    env.lookupKey = async () => ({
      orgId: "org-1",
      anthropicKey: "sk-ant-real",
      limitUsd: 10,
      keyDO,
      sessionDO: null,
    });

    const handler = createProxyHandler();
    const response = await handler(makeRequest(BASE_MESSAGES_BODY), env);

    // Upstream was called once.
    expect(upstreamFetch).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);

    // Usage event emitted.
    expect(eventSink).toHaveBeenCalledWith(expect.objectContaining({ type: "usage" }));

    // Counter reconciled (reservedUsd=0).
    const statusRes = await keyDO.fetch(new Request("https://do/status", { method: "GET" }));
    const status = (await statusRes.json()) as { reservedUsd: number; spentUsd: number };
    expect(status.reservedUsd).toBeCloseTo(0, 6);
    expect(status.spentUsd).toBeGreaterThan(0);
  });

  it("blocked request: budget exhausted → 402, no upstream call", async () => {
    const upstreamFetch = makeUpstreamFetch(VALID_ANTHROPIC_RESPONSE);
    const eventSink = vi.fn();

    const { env } = await buildEnv({ limitUsd: 0.0, upstreamFetch, eventSink });
    const handler = createProxyHandler();

    const response = await handler(makeRequest(BASE_MESSAGES_BODY), env);

    expect(response.status).toBe(402);
    expect(upstreamFetch).not.toHaveBeenCalled();
    // Block event emitted, not usage event.
    expect(eventSink).toHaveBeenCalledWith(expect.objectContaining({ type: "block" }));
  });
});

// ── Task 11: Loop detection wired into Worker ──────────────────────────────────────────────────
describe("Loop detection in Worker (Task 11)", () => {
  it("blocks with 402 loop_detected after ≥10 identical requests", async () => {
    const upstreamFetch = makeUpstreamFetch(VALID_ANTHROPIC_RESPONSE);
    const keyDO = makeBudgetDO(1000); // plenty of budget
    await initialiseDO(keyDO, 1000);

    const { env } = await buildEnv({ limitUsd: 1000.0, upstreamFetch });
    env.lookupKey = async () => ({
      orgId: "org-1",
      anthropicKey: "sk-ant-real",
      limitUsd: 1000,
      keyDO,
      sessionDO: null,
    });

    const handler = createProxyHandler();
    // Send 10 identical requests — the 10th should trigger loop detection.
    let lastResponse: Response | null = null;
    for (let i = 0; i < 10; i++) {
      lastResponse = await handler(makeRequest(BASE_MESSAGES_BODY), env);
    }

    // The 10th call should be blocked as loop_detected.
    expect(lastResponse!.status).toBe(402);
    const body = (await lastResponse!.json()) as { error: { type: string } };
    expect(body.error.type).toBe("loop_detected");
  });
});
