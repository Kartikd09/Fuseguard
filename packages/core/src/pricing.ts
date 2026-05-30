// Pricing config + cost helpers. MIT/OSS — must be inspectable (ARCHITECTURE §3, §7).
//
// USD per 1M tokens. Source: platform.claude.com/docs/about-claude/pricing (verified 2026-05-31).
// Aliases + dated IDs are both listed so either form is priced exactly, not via the fallback.
// Legacy Opus 4 / 4.1 ($15/$75) kept for back-compat; current Opus 4.5+ is $5/$25.

export type PriceKind = "input" | "output";

export interface ModelPrice {
  readonly input: number;
  readonly output: number;
}

const OPUS = { input: 5.0, output: 25.0 };          // Opus 4.5 / 4.6 / 4.7 / 4.8
const OPUS_LEGACY = { input: 15.0, output: 75.0 };  // Opus 4 / 4.1 (deprecated)
const SONNET = { input: 3.0, output: 15.0 };        // Sonnet 4 / 4.5 / 4.6
const HAIKU = { input: 1.0, output: 5.0 };          // Haiku 4.5
const HAIKU_LEGACY = { input: 0.8, output: 4.0 };   // Haiku 3.5 (retired)

export const PRICING: Record<string, ModelPrice> = {
  // Opus (current)
  "claude-opus-4-8": OPUS,
  "claude-opus-4-7": OPUS,
  "claude-opus-4-6": OPUS,
  "claude-opus-4-5": OPUS,
  // Opus (legacy / deprecated)
  "claude-opus-4-1": OPUS_LEGACY,
  "claude-opus-4-1-20250805": OPUS_LEGACY,
  "claude-opus-4": OPUS_LEGACY,
  // Sonnet
  "claude-sonnet-4-6": SONNET,
  "claude-sonnet-4-5": SONNET,
  "claude-sonnet-4-5-20250929": SONNET,
  "claude-sonnet-4": SONNET,
  // Haiku
  "claude-haiku-4-5": HAIKU,
  "claude-haiku-4-5-20251001": HAIKU,
  "claude-haiku-3.5": HAIKU_LEGACY,
  "claude-3-5-haiku-20241022": HAIKU_LEGACY,
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
