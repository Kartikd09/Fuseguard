import { describe, expect, it } from "vitest";
import { cost, PRICING, usdPerToken } from "./pricing.js";

const CACHE_WRITE_MULTIPLIER = 1.25;
const CACHE_READ_MULTIPLIER = 0.1;

describe("usdPerToken", () => {
  it("returns the correct input rate for a known model", () => {
    // claude-sonnet-4 input is $3.00 / 1M tokens.
    expect(usdPerToken("claude-sonnet-4", "input")).toBeCloseTo(3.0 / 1_000_000, 12);
  });

  it("returns the correct output rate for a known model", () => {
    // claude-opus-4 output is $75.00 / 1M tokens.
    expect(usdPerToken("claude-opus-4", "output")).toBeCloseTo(75.0 / 1_000_000, 12);
  });

  it("falls back to the most-expensive known rate for an unknown model (fail-closed)", () => {
    const maxInput = Math.max(...Object.values(PRICING).map((p) => p.input));
    const maxOutput = Math.max(...Object.values(PRICING).map((p) => p.output));

    expect(usdPerToken("totally-unknown-model", "input")).toBeCloseTo(maxInput / 1_000_000, 12);
    expect(usdPerToken("totally-unknown-model", "output")).toBeCloseTo(maxOutput / 1_000_000, 12);
  });

  it("prices the unknown model at least as high as every known model (conservative)", () => {
    const unknownInput = usdPerToken("nope", "input");
    for (const model of Object.keys(PRICING)) {
      expect(unknownInput).toBeGreaterThanOrEqual(usdPerToken(model, "input"));
    }
  });
});

describe("cost", () => {
  it("computes input + output cost for a known model", () => {
    // claude-sonnet-4: input $3/1M, output $15/1M.
    const expected = (1000 * 3.0 + 500 * 15.0) / 1_000_000;
    expect(cost("claude-sonnet-4", 1000, 500)).toBeCloseTo(expected, 12);
  });

  it("returns zero for a known model with zero tokens", () => {
    expect(cost("claude-opus-4", 0, 0)).toBe(0);
  });

  it("adds cache-write tokens at 1.25x the input rate", () => {
    const inputRate = usdPerToken("claude-sonnet-4", "input");
    const expected = inputRate * 200 * CACHE_WRITE_MULTIPLIER;
    expect(cost("claude-sonnet-4", 0, 0, 0, 200)).toBeCloseTo(expected, 12);
  });

  it("adds cache-read tokens at 0.1x the input rate", () => {
    const inputRate = usdPerToken("claude-sonnet-4", "input");
    const expected = inputRate * 1000 * CACHE_READ_MULTIPLIER;
    expect(cost("claude-sonnet-4", 0, 0, 1000, 0)).toBeCloseTo(expected, 12);
  });

  it("sums input, output, cache-read and cache-write components", () => {
    const inRate = usdPerToken("claude-haiku-3.5", "input");
    const outRate = usdPerToken("claude-haiku-3.5", "output");
    const expected =
      inRate * 1000 +
      outRate * 500 +
      inRate * 2000 * CACHE_READ_MULTIPLIER +
      inRate * 300 * CACHE_WRITE_MULTIPLIER;
    expect(cost("claude-haiku-3.5", 1000, 500, 2000, 300)).toBeCloseTo(expected, 12);
  });

  it("defaults cache token args to zero", () => {
    const expected = (100 * 0.8 + 50 * 4.0) / 1_000_000;
    expect(cost("claude-haiku-3.5", 100, 50)).toBeCloseTo(expected, 12);
  });

  it("fail-closed: unknown model costs >= the same usage on every known model", () => {
    const inTok = 1000;
    const outTok = 800;
    const cacheRead = 500;
    const cacheWrite = 400;
    const unknownCost = cost("mystery-model", inTok, outTok, cacheRead, cacheWrite);
    for (const model of Object.keys(PRICING)) {
      expect(unknownCost).toBeGreaterThanOrEqual(cost(model, inTok, outTok, cacheRead, cacheWrite));
    }
  });
});
