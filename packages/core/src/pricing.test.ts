import { describe, expect, it } from "vitest";
import { PRICING, usdPerToken } from "./pricing.js";

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
