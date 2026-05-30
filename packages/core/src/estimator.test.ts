import { describe, expect, it } from "vitest";
import { estimateInputTokens, estimateWorstCase, type MessagesRequest } from "./estimator.js";
import { cost } from "./pricing.js";

const baseRequest = (overrides: Partial<MessagesRequest> = {}): MessagesRequest => ({
  model: "claude-sonnet-4",
  max_tokens: 1024,
  messages: [{ role: "user", content: "hello world" }],
  ...overrides,
});

describe("estimateInputTokens", () => {
  it("counts ceil(totalChars / 3.5) over system + messages", () => {
    // "hello world" = 11 chars ⇒ ceil(11 / 3.5) = 4.
    expect(estimateInputTokens(baseRequest())).toBe(4);
  });

  it("includes system prompt characters", () => {
    const withSystem = estimateInputTokens(baseRequest({ system: "be terse" }));
    const withoutSystem = estimateInputTokens(baseRequest());
    expect(withSystem).toBeGreaterThan(withoutSystem);
  });

  it("counts structured content blocks (array message content)", () => {
    const structured = estimateInputTokens(
      baseRequest({
        messages: [
          { role: "user", content: [{ type: "text", text: "a structured block of text" }] },
        ],
      })
    );
    expect(structured).toBeGreaterThan(0);
  });

  it("adds 8 tokens of overhead per tool", () => {
    const noTools = estimateInputTokens(baseRequest());
    const twoTools = estimateInputTokens(
      baseRequest({
        tools: [
          { name: "a", description: "" },
          { name: "b", description: "" },
        ],
      })
    );
    // Tool names/descriptions are empty here, so the only delta is 2 × 8 = 16.
    expect(twoTools - noTools).toBe(16);
  });
});

describe("estimateWorstCase", () => {
  it("charges full max_tokens as output (worst case)", () => {
    const request = baseRequest({ max_tokens: 2000 });
    const inputTokens = estimateInputTokens(request);
    const expected = cost("claude-sonnet-4", inputTokens, 2000);
    expect(estimateWorstCase(request)).toBeCloseTo(expected, 12);
  });

  it("scales up with larger max_tokens", () => {
    const small = estimateWorstCase(baseRequest({ max_tokens: 100 }));
    const large = estimateWorstCase(baseRequest({ max_tokens: 10000 }));
    expect(large).toBeGreaterThan(small);
  });

  it("scales up with more input characters", () => {
    const short = estimateWorstCase(
      baseRequest({ messages: [{ role: "user", content: "hi" }] })
    );
    const long = estimateWorstCase(
      baseRequest({ messages: [{ role: "user", content: "x".repeat(10000) }] })
    );
    expect(long).toBeGreaterThan(short);
  });

  it("fails closed: unknown model estimate >= same request on every known model", () => {
    const request = baseRequest({ model: "future-model-9000" });
    const unknown = estimateWorstCase(request);
    for (const model of ["claude-opus-4", "claude-sonnet-4", "claude-haiku-3.5"]) {
      expect(unknown).toBeGreaterThanOrEqual(estimateWorstCase({ ...request, model }));
    }
  });

  it("throws when max_tokens is missing", () => {
    const invalid = { model: "claude-sonnet-4", messages: [] } as unknown as MessagesRequest;
    expect(() => estimateWorstCase(invalid)).toThrow();
  });

  it("throws when max_tokens is not a positive integer", () => {
    expect(() => estimateWorstCase(baseRequest({ max_tokens: 0 }))).toThrow();
    expect(() => estimateWorstCase(baseRequest({ max_tokens: -5 }))).toThrow();
  });

  it("throws when messages is missing", () => {
    const invalid = {
      model: "claude-sonnet-4",
      max_tokens: 100,
    } as unknown as MessagesRequest;
    expect(() => estimateWorstCase(invalid)).toThrow();
  });
});
