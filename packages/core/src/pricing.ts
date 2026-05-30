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

// Unknown model ⇒ fail-closed: price as the most-expensive known model (ARCHITECTURE §3).
function mostExpensive(kind: PriceKind): number {
  return Object.values(PRICING).reduce((max, price) => Math.max(max, price[kind]), 0);
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
 * Authoritative post-flight cost in USD. TODO(ROADMAP Phase 1, task 1): implement cache
 * read/write multipliers (write ≈ 1.25×, read ≈ 0.1× of input) and full reconciliation.
 */
export function cost(
  _model: string,
  _inputTokens: number,
  _outputTokens: number,
  _cacheReadTokens = 0,
  _cacheWriteTokens = 0
): number {
  throw new Error("cost() not implemented — see ROADMAP Phase 1 task 1");
}
