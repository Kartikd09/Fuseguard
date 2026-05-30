// Pricing config + cost helpers. MIT/OSS — must be inspectable (ARCHITECTURE §3, §7).
//
// USD per 1M tokens. Verify against Anthropic live pricing at build time; values illustrative.

export type PriceKind = "input" | "output";

export interface ModelPrice {
  readonly input: number;
  readonly output: number;
}

export const PRICING: Record<string, ModelPrice> = {
  "claude-opus-4": { input: 15.0, output: 75.0 },
  "claude-sonnet-4": { input: 3.0, output: 15.0 },
  "claude-haiku-3.5": { input: 0.8, output: 4.0 },
  // cache read/write multipliers handled in cost()
};

const TOKENS_PER_PRICE_UNIT = 1_000_000;

// Anthropic cache pricing, relative to the model's input rate (ARCHITECTURE §3).
const CACHE_WRITE_MULTIPLIER = 1.25;
const CACHE_READ_MULTIPLIER = 0.1;

// Unknown model ⇒ fail-closed: price as the most-expensive known model (ARCHITECTURE §3).
// Throws if the table is empty — returning 0 would silently un-fail-closed (charge nothing).
function mostExpensive(kind: PriceKind): number {
  const prices = Object.values(PRICING);
  if (prices.length === 0) {
    throw new Error("PRICING table is empty — cannot apply fail-closed fallback rate");
  }
  return prices.reduce((max, price) => Math.max(max, price[kind]), 0);
}

/**
 * Deterministic per-token rate (USD) for a model + kind. Unknown model falls back to the
 * most-expensive known rate (conservative). Pure — safe for unit testing.
 */
export function usdPerToken(model: string, kind: PriceKind): number {
  const price = PRICING[model];
  const perMillion = price ? price[kind] : mostExpensive(kind);
  return perMillion / TOKENS_PER_PRICE_UNIT;
}

/**
 * Authoritative USD cost for a usage breakdown. Cache write/read are priced as multiples of the
 * model's input rate (write 1.25×, read 0.1×). Unknown model fails closed via usdPerToken.
 * Pure — safe for unit testing.
 */
export function cost(
  model: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens = 0,
  cacheWriteTokens = 0
): number {
  const inputRate = usdPerToken(model, "input");
  const outputRate = usdPerToken(model, "output");
  return (
    inputTokens * inputRate +
    outputTokens * outputRate +
    cacheReadTokens * inputRate * CACHE_READ_MULTIPLIER +
    cacheWriteTokens * inputRate * CACHE_WRITE_MULTIPLIER
  );
}
