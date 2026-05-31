import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveSelfhostKey, makeEmitter } from "./index.js";

// Finding #2: the self-host key resolution must FAIL CLOSED — never return an
// Infinity budget or an empty Anthropic key. Unconfigured / mismatched / invalid → null.
describe("resolveSelfhostKey (fail-closed Phase-1 self-host lookup)", () => {
  const HASH = "a".repeat(64);
  const fullCfg = {
    SELFHOST_FUSEGUARD_KEY_HASH: HASH,
    SELFHOST_ANTHROPIC_KEY: "sk-ant-real",
    SELFHOST_BUDGET_USD: "10",
  };

  it("returns the configured key + finite budget when fully configured and key matches", () => {
    const r = resolveSelfhostKey(HASH, fullCfg);
    expect(r).not.toBeNull();
    expect(r?.anthropicKey).toBe("sk-ant-real");
    expect(r?.limitUsd).toBe(10);
    expect(Number.isFinite(r?.limitUsd)).toBe(true);
  });

  it("fails closed (null) when not configured", () => {
    expect(resolveSelfhostKey(HASH, {})).toBeNull();
    expect(resolveSelfhostKey(HASH, { SELFHOST_FUSEGUARD_KEY_HASH: HASH })).toBeNull();
    expect(resolveSelfhostKey(HASH, { SELFHOST_FUSEGUARD_KEY_HASH: HASH, SELFHOST_ANTHROPIC_KEY: "x" })).toBeNull();
  });

  it("fails closed when the presented key hash does not match", () => {
    expect(resolveSelfhostKey("b".repeat(64), fullCfg)).toBeNull();
  });

  it("fails closed on a non-numeric, zero, or negative budget (never Infinity)", () => {
    expect(resolveSelfhostKey(HASH, { ...fullCfg, SELFHOST_BUDGET_USD: "abc" })).toBeNull();
    expect(resolveSelfhostKey(HASH, { ...fullCfg, SELFHOST_BUDGET_USD: "0" })).toBeNull();
    expect(resolveSelfhostKey(HASH, { ...fullCfg, SELFHOST_BUDGET_USD: "-5" })).toBeNull();
    expect(resolveSelfhostKey(HASH, { ...fullCfg, SELFHOST_BUDGET_USD: "Infinity" })).toBeNull();
  });
});

// H1: self-host keyId must be null to avoid FK violation on usage_events.
// Previously keyHash.slice(0,36) was used which is not a valid UUID.
describe("H1 — self-host telemetry FK safety", () => {
  const SB_ENV = {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
  } as const;

  const USAGE_EVENT = {
    type: "usage",
    orgId: "org-1",
    model: "claude-sonnet-4",
    inputTokens: 10,
    outputTokens: 5,
    costUsd: 0.001,
  };

  // Capture the JSON body makeEmitter would POST to Supabase for a given table.
  function captureInserts(table: string) {
    const payloads: Record<string, unknown>[] = [];
    globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const urlStr = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
      if (urlStr.includes(table)) payloads.push(JSON.parse((init?.body as string) ?? "{}"));
      return new Response(null, { status: 201 });
    }) as typeof fetch;
    return payloads;
  }

  const origFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = origFetch;
    vi.restoreAllMocks();
  });

  it("omits api_key_id from the usage_events payload when keyId is null (self-host)", async () => {
    const payloads = captureInserts("usage_events");
    makeEmitter(SB_ENV as never, null)(USAGE_EVENT);
    await vi.waitFor(() => expect(payloads).toHaveLength(1));
    expect(Object.prototype.hasOwnProperty.call(payloads[0], "api_key_id")).toBe(false);
    expect(payloads[0]?.["org_id"]).toBe("org-1");
  });

  it("includes api_key_id when a hosted keyId is present", async () => {
    const payloads = captureInserts("usage_events");
    const KEY_ID = "11111111-1111-1111-1111-111111111111";
    makeEmitter(SB_ENV as never, KEY_ID)(USAGE_EVENT);
    await vi.waitFor(() => expect(payloads).toHaveLength(1));
    expect(payloads[0]?.["api_key_id"]).toBe(KEY_ID);
  });
});
