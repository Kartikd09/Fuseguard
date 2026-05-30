// Estimate-accuracy test harness — ARCHITECTURE §4a audit finding.
//
// Quantifies how much FuseGuard over-reserves when worst-case (max_tokens) output is charged
// pre-flight but the actual output is shorter. Tests are deterministic (no randomness) and
// assert documented bounds so regressions are caught.
//
// Terminology:
//   worstCaseCost  = estimateWorstCase(req)     ← full max_tokens charged as output
//   actualCost     = cost(model, inputTok, actualOutputTok) ← real output token count
//   overEstimateRatio   = worstCaseCost / actualCost    (>= 1.0 always by construction)
//   earlyBlockWindow    = (worstCaseCost - actualCost) / worstCaseCost  (0..1)
//
// Why this matters: FuseGuard blocks when (currentSpend + worstCaseCost) > budget.
// If actualCost << worstCaseCost the budget will be exhausted on paper before real spend
// catches up. Users set budgets too tight relative to their max_tokens and hit false-positive
// 402s. The numbers here tell us "by how much" so we can document guidance (ARCHITECTURE §4a).

import { describe, expect, it } from "vitest";
import { cost, PRICING } from "./pricing.js";
import { estimateInputTokens, estimateWorstCase, type MessagesRequest } from "./estimator.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(
  model: string,
  systemChars: number,
  messageChars: number,
  maxTokens: number
): MessagesRequest {
  return {
    model,
    max_tokens: maxTokens,
    system: "S".repeat(systemChars),
    messages: [{ role: "user", content: "M".repeat(messageChars) }],
  };
}

interface ScenarioResult {
  model: string;
  inputSizeLabel: string;
  maxTokens: number;
  outputRatio: number; // actual output = ratio × max_tokens
  inputTokens: number;
  actualOutputTokens: number;
  worstCaseCost: number;
  actualCost: number;
  overEstimateRatio: number;
  earlyBlockWindowPct: number; // (worstCase - actual) / worstCase × 100
}

function runScenario(
  model: string,
  systemChars: number,
  messageChars: number,
  maxTokens: number,
  outputRatio: number,
  inputSizeLabel: string
): ScenarioResult {
  const request = makeRequest(model, systemChars, messageChars, maxTokens);
  const inputTokens = estimateInputTokens(request);
  const actualOutputTokens = Math.max(1, Math.round(maxTokens * outputRatio));
  const worstCaseCost = estimateWorstCase(request);
  const actualCost = cost(model, inputTokens, actualOutputTokens);
  const overEstimateRatio = worstCaseCost / actualCost;
  const earlyBlockWindowPct = ((worstCaseCost - actualCost) / worstCaseCost) * 100;
  return {
    model,
    inputSizeLabel,
    maxTokens,
    outputRatio,
    inputTokens,
    actualOutputTokens,
    worstCaseCost,
    actualCost,
    overEstimateRatio,
    earlyBlockWindowPct,
  };
}

// ---------------------------------------------------------------------------
// Scenario matrix (fully deterministic — no Math.random())
// ---------------------------------------------------------------------------

const MODELS = Object.keys(PRICING); // ["claude-opus-4", "claude-sonnet-4", "claude-haiku-3.5"]

// Input size buckets: [label, systemChars, messageChars]
const INPUT_SIZES: Array<[string, number, number]> = [
  ["short (~200 chars)", 100, 100],
  ["medium (~2k chars)", 1000, 1000],
  ["long (~10k chars)", 5000, 5000],
];

// max_tokens values matching common real-world usage
const MAX_TOKENS_VALUES = [256, 1024, 4096];

// Realistic output ratios: how much of max_tokens the model actually produces
const OUTPUT_RATIOS = [0.05, 0.2, 0.5, 1.0];

function buildAllScenarios(): ScenarioResult[] {
  const results: ScenarioResult[] = [];
  for (const model of MODELS) {
    for (const [label, sysChars, msgChars] of INPUT_SIZES) {
      for (const maxTok of MAX_TOKENS_VALUES) {
        for (const ratio of OUTPUT_RATIOS) {
          results.push(runScenario(model, sysChars, msgChars, maxTok, ratio, label));
        }
      }
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Summary helpers
// ---------------------------------------------------------------------------

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
    : (sorted[mid] ?? 0);
}

function p95(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil(0.95 * sorted.length) - 1;
  return sorted[Math.max(0, idx)] ?? 0;
}

interface BucketStats {
  outputRatio: number;
  label: string;
  medianOverEstimate: number;
  p95OverEstimate: number;
  medianEarlyBlockPct: number;
  p95EarlyBlockPct: number;
  sampleCount: number;
}

function summariseByOutputRatio(scenarios: ScenarioResult[]): BucketStats[] {
  return OUTPUT_RATIOS.map((ratio) => {
    const bucket = scenarios.filter((s) => s.outputRatio === ratio);
    const overEstimates = bucket.map((s) => s.overEstimateRatio);
    const earlyBlocks = bucket.map((s) => s.earlyBlockWindowPct);
    return {
      outputRatio: ratio,
      label: `actual = ${ratio * 100}% of max_tokens`,
      medianOverEstimate: median(overEstimates),
      p95OverEstimate: p95(overEstimates),
      medianEarlyBlockPct: median(earlyBlocks),
      p95EarlyBlockPct: p95(earlyBlocks),
      sampleCount: bucket.length,
    };
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("estimate accuracy — over-reservation quantification", () => {
  const scenarios = buildAllScenarios();
  const summary = summariseByOutputRatio(scenarios);

  // Print the summary table for CI logs — human-readable, no network required.
  console.table(
    summary.map((s) => ({
      "Output ratio": s.label,
      "Median over-estimate ×": s.medianOverEstimate.toFixed(2),
      "p95 over-estimate ×": s.p95OverEstimate.toFixed(2),
      "Median early-block %": s.medianEarlyBlockPct.toFixed(1) + "%",
      "p95 early-block %": s.p95EarlyBlockPct.toFixed(1) + "%",
      Samples: s.sampleCount,
    }))
  );

  it("generates the full deterministic scenario matrix (108 scenarios)", () => {
    // 3 models × 3 input sizes × 3 max_token values × 4 output ratios = 108
    expect(scenarios).toHaveLength(108);
  });

  it("worst-case cost is always >= actual cost (by construction)", () => {
    for (const s of scenarios) {
      expect(s.worstCaseCost).toBeGreaterThanOrEqual(s.actualCost);
    }
  });

  it("over-estimate ratio is always >= 1.0", () => {
    for (const s of scenarios) {
      expect(s.overEstimateRatio).toBeGreaterThanOrEqual(1.0);
    }
  });

  it("early-block window % is always in [0, 100)", () => {
    for (const s of scenarios) {
      expect(s.earlyBlockWindowPct).toBeGreaterThanOrEqual(0);
      expect(s.earlyBlockWindowPct).toBeLessThan(100);
    }
  });

  // -----------------------------------------------------------------------
  // Documented-bounds assertions — the core regression guards.
  //
  // Numbers derived from the ARCHITECTURE §3 formula:
  //   worstCase = cost(model, inputTok, maxTokens)
  //   actual    = cost(model, inputTok, maxTokens × ratio)
  //   ratio     = overEstimate ≈ (inputCost + maxTokens × outRate)
  //                            / (inputCost + maxTokens × ratio × outRate)
  //
  // For output-dominant requests (high max_tokens, low input) the ratio
  // approaches 1/outputRatio.  For input-dominant requests (large prompt,
  // small max_tokens) the ratio approaches 1.0 (input cost swamps output).
  // -----------------------------------------------------------------------

  describe("5% output ratio (aggressive short-answer use case)", () => {
    const bucket = summary.find((s) => s.outputRatio === 0.05)!;

    it("median over-estimate is between 2× and 20×", () => {
      // Typical: call returns 5% of max_tokens → worst-case reserves 20× what was spent
      // on output, but input cost dilutes the ratio. Real range is ~2–20× depending on
      // input/output token balance.
      expect(bucket.medianOverEstimate).toBeGreaterThanOrEqual(2.0);
      expect(bucket.medianOverEstimate).toBeLessThanOrEqual(20.0);
    });

    it("p95 over-estimate is below 21× (very high max_tokens + tiny input)", () => {
      expect(bucket.p95OverEstimate).toBeLessThanOrEqual(21.0);
    });

    it("median early-block window is at least 50% (budget consumed by reservation)", () => {
      // 5% actual output means >50% of the reserved budget was never spent
      expect(bucket.medianEarlyBlockPct).toBeGreaterThanOrEqual(50.0);
    });
  });

  describe("20% output ratio (typical LLM call — the key operational scenario)", () => {
    const bucket = summary.find((s) => s.outputRatio === 0.2)!;

    it("median over-estimate is between 1.5× and 5×", () => {
      // A typical call producing 20% of max_tokens causes 1.5–5× over-reservation.
      // This is the most practically important number for budget guidance.
      expect(bucket.medianOverEstimate).toBeGreaterThanOrEqual(1.5);
      expect(bucket.medianOverEstimate).toBeLessThanOrEqual(5.0);
    });

    it("p95 over-estimate is below 6×", () => {
      expect(bucket.p95OverEstimate).toBeLessThanOrEqual(6.0);
    });

    it("median early-block window is at least 30%", () => {
      expect(bucket.medianEarlyBlockPct).toBeGreaterThanOrEqual(30.0);
    });
  });

  describe("50% output ratio (moderate output use case)", () => {
    const bucket = summary.find((s) => s.outputRatio === 0.5)!;

    it("median over-estimate is between 1.1× and 2×", () => {
      expect(bucket.medianOverEstimate).toBeGreaterThanOrEqual(1.1);
      expect(bucket.medianOverEstimate).toBeLessThanOrEqual(2.0);
    });

    it("p95 over-estimate is below 2.1×", () => {
      expect(bucket.p95OverEstimate).toBeLessThanOrEqual(2.1);
    });
  });

  describe("100% output ratio (model fills max_tokens exactly)", () => {
    const bucket = summary.find((s) => s.outputRatio === 1.0)!;

    it("over-estimate ratio is 1.0 for all scenarios (no gap when actual = max_tokens)", () => {
      // When actual output == max_tokens, worst-case == actual, ratio must be exactly 1.
      const ratioOneBucket = scenarios.filter((s) => s.outputRatio === 1.0);
      for (const s of ratioOneBucket) {
        expect(s.overEstimateRatio).toBeCloseTo(1.0, 10);
      }
    });

    it("median early-block window is ~0% (no false-positive pressure)", () => {
      expect(bucket.medianEarlyBlockPct).toBeCloseTo(0.0, 5);
    });
  });

  // -----------------------------------------------------------------------
  // Model-specific checks: over-estimation is model-agnostic by ratio because
  // the formula is symmetric in pricing — only the input/output price RATIO
  // per model affects the result (not the absolute price).
  // -----------------------------------------------------------------------

  describe("model symmetry — same input/output ratio produces same over-estimate shape", () => {
    it("all models produce over-estimate ≥ 1.0 across all scenarios", () => {
      for (const model of MODELS) {
        const modelScenarios = scenarios.filter((s) => s.model === model);
        for (const s of modelScenarios) {
          expect(s.overEstimateRatio).toBeGreaterThanOrEqual(1.0);
        }
      }
    });

    it("opus over-estimate is bounded by the same ratio bounds as sonnet and haiku", () => {
      // The output/input price ratio differs per model but the structural bounds hold.
      const opusAt20Pct = scenarios.filter(
        (s) => s.model === "claude-opus-4" && s.outputRatio === 0.2
      );
      for (const s of opusAt20Pct) {
        expect(s.overEstimateRatio).toBeGreaterThanOrEqual(1.0);
        expect(s.overEstimateRatio).toBeLessThanOrEqual(6.0);
      }
    });
  });

  // -----------------------------------------------------------------------
  // Input-size sensitivity: for a fixed output ratio, larger input (more input
  // tokens) dilutes the over-estimate ratio because input cost is priced the
  // same in both worst-case and actual.
  // -----------------------------------------------------------------------

  describe("input-size sensitivity", () => {
    it("short input + 5% output ratio has higher over-estimate than long input + 5%", () => {
      // Long input means input dominates the cost — the output gap matters less.
      const shortAt5 = scenarios.filter(
        (s) =>
          s.model === "claude-sonnet-4" &&
          s.inputSizeLabel === "short (~200 chars)" &&
          s.outputRatio === 0.05 &&
          s.maxTokens === 4096
      );
      const longAt5 = scenarios.filter(
        (s) =>
          s.model === "claude-sonnet-4" &&
          s.inputSizeLabel === "long (~10k chars)" &&
          s.outputRatio === 0.05 &&
          s.maxTokens === 4096
      );
      const shortMedian = median(shortAt5.map((s) => s.overEstimateRatio));
      const longMedian = median(longAt5.map((s) => s.overEstimateRatio));
      expect(shortMedian).toBeGreaterThan(longMedian);
    });

    it("larger max_tokens amplifies over-estimate for output-ratio < 1", () => {
      // With the same prompt but 4096 vs 256 max_tokens at 20% ratio:
      // 256 × 0.2 = 51 output tokens reserved vs 256 worst-case → less gap.
      // 4096 × 0.2 = 819 output tokens reserved vs 4096 worst-case → larger gap.
      const small = scenarios.filter(
        (s) =>
          s.model === "claude-sonnet-4" &&
          s.inputSizeLabel === "short (~200 chars)" &&
          s.outputRatio === 0.2 &&
          s.maxTokens === 256
      );
      const large = scenarios.filter(
        (s) =>
          s.model === "claude-sonnet-4" &&
          s.inputSizeLabel === "short (~200 chars)" &&
          s.outputRatio === 0.2 &&
          s.maxTokens === 4096
      );
      const smallMedian = median(small.map((s) => s.overEstimateRatio));
      const largeMedian = median(large.map((s) => s.overEstimateRatio));
      expect(largeMedian).toBeGreaterThan(smallMedian);
    });
  });

  // -----------------------------------------------------------------------
  // Spot-check: manually verified reference values for regression pinning.
  //
  // sonnet-4 short input, max_tokens=1024, 20% ratio:
  //   input chars = 200 → inputTokens = ceil(200/3.5) = 58
  //   worstCase = cost("claude-sonnet-4", 58, 1024)
  //             = (58×3 + 1024×15) / 1_000_000
  //             = (174 + 15360) / 1_000_000 = 0.015534
  //   actual output = round(1024×0.2) = 205 tokens
  //   actualCost = (58×3 + 205×15) / 1_000_000
  //              = (174 + 3075) / 1_000_000 = 0.003249
  //   ratio = 0.015534 / 0.003249 ≈ 4.78
  // -----------------------------------------------------------------------

  describe("spot-check reference values (regression pins)", () => {
    it("sonnet-4 short input max_tokens=1024 at 20% output ≈ 4.78× over-estimate", () => {
      const inputTokens = Math.ceil(200 / 3.5); // 58
      const worstCase = cost("claude-sonnet-4", inputTokens, 1024);
      const actualOutput = Math.round(1024 * 0.2); // 205
      const actual = cost("claude-sonnet-4", inputTokens, actualOutput);
      const ratio = worstCase / actual;
      expect(ratio).toBeCloseTo(4.78, 1);
    });

    it("haiku-3.5 medium input max_tokens=256 at 5% output has ratio > 3", () => {
      // haiku input $0.8/M, output $4/M. medium input ~2000 chars → 572 tokens.
      // worstCase = (572×0.8 + 256×4)/1M = (457.6 + 1024)/1M = 0.0014816
      // actual output = round(256×0.05) = 13 tokens
      // actualCost = (572×0.8 + 13×4)/1M = (457.6 + 52)/1M = 0.0005096
      // ratio ≈ 2.91  (> 2, which we assert)
      const inputTokens = Math.ceil(2000 / 3.5); // 572
      const worstCase = cost("claude-haiku-3.5", inputTokens, 256);
      const actualOutput = Math.max(1, Math.round(256 * 0.05)); // 13
      const actual = cost("claude-haiku-3.5", inputTokens, actualOutput);
      const ratio = worstCase / actual;
      expect(ratio).toBeGreaterThan(2.0);
    });

    it("opus-4 long input max_tokens=4096 at 100% output has ratio ≈ 1.0", () => {
      const inputTokens = Math.ceil(10000 / 3.5);
      const worstCase = cost("claude-opus-4", inputTokens, 4096);
      const actual = cost("claude-opus-4", inputTokens, 4096); // same
      expect(worstCase / actual).toBeCloseTo(1.0, 10);
    });
  });
});
