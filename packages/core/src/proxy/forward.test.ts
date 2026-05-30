// Task 4: Transparent forward (non-stream). TDD — RED → GREEN.
// SSRF: upstream is the constant api.anthropic.com, NEVER from request input.
// Mock upstream fetch at the boundary; no real network calls.

import { describe, expect, it, vi } from "vitest";
import { forwardToAnthropic, ANTHROPIC_HOST } from "./forward.js";

const MOCK_UPSTREAM_BODY = JSON.stringify({
  id: "msg_test",
  type: "message",
  role: "assistant",
  content: [{ type: "text", text: "Hello!" }],
  model: "claude-sonnet-4",
  stop_reason: "end_turn",
  usage: { input_tokens: 10, output_tokens: 5 },
});

function makeMockFetch(
  responseBody: string,
  status = 200,
  headers: Record<string, string> = { "content-type": "application/json" }
): typeof fetch {
  return vi.fn().mockResolvedValue(
    new Response(responseBody, {
      status,
      headers,
    })
  );
}

describe("ANTHROPIC_HOST constant (SSRF protection)", () => {
  it("is exactly api.anthropic.com", () => {
    expect(ANTHROPIC_HOST).toBe("api.anthropic.com");
  });
});

describe("forwardToAnthropic", () => {
  it("returns the upstream response body and status unchanged (byte-identical)", async () => {
    const mockFetch = makeMockFetch(MOCK_UPSTREAM_BODY, 200);
    const incomingRequest = new Request("https://fuseguard.app/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": "sk-ant-real-key" },
      body: MOCK_UPSTREAM_BODY,
    });

    const result = await forwardToAnthropic(incomingRequest, "sk-ant-real-key", mockFetch);

    expect(result.status).toBe(200);
    const body = await result.text();
    expect(body).toBe(MOCK_UPSTREAM_BODY);
  });

  it("always calls api.anthropic.com regardless of incoming URL (SSRF)", async () => {
    const mockFetch = makeMockFetch(MOCK_UPSTREAM_BODY, 200);
    // Attacker tries to redirect upstream via URL manipulation
    const maliciousRequest = new Request(
      "https://fuseguard.app/v1/messages?upstream=https://evil.com",
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": "sk-ant-real-key" },
        body: MOCK_UPSTREAM_BODY,
      }
    );

    await forwardToAnthropic(maliciousRequest, "sk-ant-real-key", mockFetch);

    const calledUrl = (mockFetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
    expect(calledUrl).toMatch(/^https:\/\/api\.anthropic\.com\//);
    expect(calledUrl).not.toContain("evil.com");
  });

  it("never includes x-api-key from the incoming request — uses the decrypted customer key", async () => {
    const mockFetch = makeMockFetch(MOCK_UPSTREAM_BODY, 200);
    const incomingRequest = new Request("https://fuseguard.app/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "fg_fuseguard-key-not-anthropic",
      },
      body: MOCK_UPSTREAM_BODY,
    });

    await forwardToAnthropic(incomingRequest, "sk-ant-real-customer-key", mockFetch);

    const upstreamRequest = (mockFetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as RequestInit;
    const sentKey = (upstreamRequest?.headers as Record<string, string>)?.["x-api-key"];
    expect(sentKey).toBe("sk-ant-real-customer-key");
    expect(sentKey).not.toBe("fg_fuseguard-key-not-anthropic");
  });

  it("preserves upstream 4xx status codes (e.g. 400 from Anthropic)", async () => {
    const errorBody = JSON.stringify({ error: { type: "invalid_request_error", message: "bad" } });
    const mockFetch = makeMockFetch(errorBody, 400);
    const req = new Request("https://fuseguard.app/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": "sk-ant-key" },
      body: MOCK_UPSTREAM_BODY,
    });

    const result = await forwardToAnthropic(req, "sk-ant-key", mockFetch);

    expect(result.status).toBe(400);
    expect(await result.text()).toBe(errorBody);
  });

  it("strips X-FuseGuard-* headers before forwarding upstream", async () => {
    const mockFetch = makeMockFetch(MOCK_UPSTREAM_BODY, 200);
    const req = new Request("https://fuseguard.app/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": "sk-ant-key",
        "x-fuseguard-session": "sess-abc",
        "x-fuseguard-internal": "secret",
      },
      body: MOCK_UPSTREAM_BODY,
    });

    await forwardToAnthropic(req, "sk-ant-key", mockFetch);

    const upstreamRequest = (mockFetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as RequestInit;
    const headers = upstreamRequest?.headers as Record<string, string>;
    expect(headers?.["x-fuseguard-session"]).toBeUndefined();
    expect(headers?.["x-fuseguard-internal"]).toBeUndefined();
  });

  it("constructs the upstream URL from the incoming path (preserving /v1/messages)", async () => {
    const mockFetch = makeMockFetch(MOCK_UPSTREAM_BODY, 200);
    const req = new Request("https://fuseguard.app/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": "sk-ant-key" },
      body: MOCK_UPSTREAM_BODY,
    });

    await forwardToAnthropic(req, "sk-ant-key", mockFetch);

    const calledUrl = (mockFetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as string;
    expect(calledUrl).toBe("https://api.anthropic.com/v1/messages");
  });
});
