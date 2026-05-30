// Unit tests for spend aggregation — all mocked data, no live DB.
import { describe, it, expect } from "vitest";
import {
  aggregateTotalSpend,
  countBlocks,
  buildKeySpend,
  buildTopSpenders,
  buildSpendSummary,
  budgetUsedPercent,
  filterToWindow,
  formatUsd,
  formatTokens,
} from "../spend";
import {
  mockEvents,
  mockBlocks,
  mockKey1,
  mockKey2,
  mockBudgetUsd,
  mockBudgetTokens,
} from "@/test/fixtures";

describe("aggregateTotalSpend", () => {
  it("sums cost_usd across all events", () => {
    const total = aggregateTotalSpend(mockEvents);
    expect(total).toBeCloseTo(0.0093 + 0.15 + 0.0014, 6);
  });

  it("returns 0 for empty events", () => {
    expect(aggregateTotalSpend([])).toBe(0);
  });
});

describe("countBlocks", () => {
  it("returns the number of block events", () => {
    expect(countBlocks(mockBlocks)).toBe(2);
  });

  it("returns 0 for empty blocks", () => {
    expect(countBlocks([])).toBe(0);
  });
});

describe("buildKeySpend", () => {
  const keys = [mockKey1, mockKey2];
  const budgets = [mockBudgetUsd, mockBudgetTokens];

  it("assigns events to the correct key", () => {
    const spend = buildKeySpend(keys, mockEvents, mockBlocks, budgets);
    const key1 = spend.find((k) => k.keyId === "key-001")!;
    const key2 = spend.find((k) => k.keyId === "key-002")!;

    expect(key1.spentUsd).toBeCloseTo(0.0093 + 0.15, 6);
    expect(key2.spentUsd).toBeCloseTo(0.0014, 6);
  });

  it("computes budgetPercent correctly for USD budget", () => {
    const spend = buildKeySpend(keys, mockEvents, mockBlocks, budgets);
    const key1 = spend.find((k) => k.keyId === "key-001")!;
    // spent ≈ 0.1593, budget = $50 → ~0%
    expect(key1.budgetUsd).toBe(50);
    expect(key1.budgetPercent).toBe(0); // 0.1593/50 = 0.318% → rounds to 0
  });

  it("returns null budgetPercent when no USD budget is set", () => {
    const spend = buildKeySpend(keys, mockEvents, mockBlocks, []);
    const key1 = spend.find((k) => k.keyId === "key-001")!;
    expect(key1.budgetUsd).toBeNull();
    expect(key1.budgetPercent).toBeNull();
  });

  it("counts blocks per key", () => {
    const spend = buildKeySpend(keys, mockEvents, mockBlocks, budgets);
    const key1 = spend.find((k) => k.keyId === "key-001")!;
    const key2 = spend.find((k) => k.keyId === "key-002")!;
    expect(key1.blockedCount).toBe(2);
    expect(key2.blockedCount).toBe(0);
  });
});

describe("buildTopSpenders", () => {
  it("sorts keys by spend descending", () => {
    const keys = [mockKey1, mockKey2];
    const keySpend = buildKeySpend(keys, mockEvents, mockBlocks, []);
    const top = buildTopSpenders(keySpend, 5);

    expect(top[0]?.keyId).toBe("key-001"); // higher spend
    expect(top[1]?.keyId).toBe("key-002");
  });

  it("respects the limit", () => {
    const keys = [mockKey1, mockKey2];
    const keySpend = buildKeySpend(keys, mockEvents, mockBlocks, []);
    const top = buildTopSpenders(keySpend, 1);
    expect(top).toHaveLength(1);
  });

  it("computes percentOfTotal correctly", () => {
    const keys = [mockKey1, mockKey2];
    const keySpend = buildKeySpend(keys, mockEvents, mockBlocks, []);
    const top = buildTopSpenders(keySpend, 5);
    const totalPercent = top.reduce((s, t) => s + t.percentOfTotal, 0);
    // percentages should roughly sum to 100
    expect(totalPercent).toBeGreaterThanOrEqual(99);
    expect(totalPercent).toBeLessThanOrEqual(101);
  });

  it("returns 0 percentOfTotal when total spend is 0", () => {
    const keys = [mockKey1];
    const keySpend = buildKeySpend(keys, [], [], []);
    const top = buildTopSpenders(keySpend, 5);
    expect(top[0]?.percentOfTotal).toBe(0);
  });
});

describe("buildSpendSummary", () => {
  it("aggregates total and block count", () => {
    const summary = buildSpendSummary(mockEvents, mockBlocks, "last 24h");
    expect(summary.totalUsd).toBeCloseTo(0.0093 + 0.15 + 0.0014, 6);
    expect(summary.blockedCount).toBe(2);
    expect(summary.windowLabel).toBe("last 24h");
  });
});

describe("budgetUsedPercent", () => {
  it("computes USD budget utilisation correctly", () => {
    // key-001 events: 0.0093 + 0.15 = 0.1593 of $50 budget
    const pct = budgetUsedPercent(mockBudgetUsd, mockEvents);
    expect(pct).toBe(0); // 0.319% rounds to 0
  });

  it("computes token budget utilisation correctly", () => {
    // key-002 events: 800+200 = 1000 tokens of 1,000,000 budget
    const pct = budgetUsedPercent(mockBudgetTokens, mockEvents);
    expect(pct).toBe(0); // 0.1% rounds to 0
  });

  it("returns 0 when limit_value is 0 (avoids divide-by-zero)", () => {
    const zeroLimitBudget = { ...mockBudgetUsd, limit_value: 0 };
    expect(budgetUsedPercent(zeroLimitBudget, mockEvents)).toBe(0);
  });

  it("returns >100 when over budget", () => {
    const tinyBudget = { ...mockBudgetUsd, limit_value: 0.01 };
    const pct = budgetUsedPercent(tinyBudget, mockEvents);
    expect(pct).toBeGreaterThan(100);
  });
});

describe("filterToWindow", () => {
  it("filters events older than the window", () => {
    // reference = 2025-05-30T09:00:00Z, window = 3600s (1h)
    // evt-001 at 07:00 → outside; evt-002 at 07:30 → outside; evt-003 at 06:00 → outside
    const filtered = filterToWindow(
      mockEvents,
      3600,
      "2025-05-30T09:00:00Z"
    );
    expect(filtered).toHaveLength(0);
  });

  it("includes events within the window", () => {
    // window = 3 days (259200s) from reference = 2025-05-30T09:00:00Z
    const filtered = filterToWindow(
      mockEvents,
      259200,
      "2025-05-30T09:00:00Z"
    );
    expect(filtered).toHaveLength(3);
  });
});

describe("formatUsd", () => {
  it("formats zero as $0.00", () => {
    expect(formatUsd(0)).toBe("$0.00");
  });

  it("formats whole dollars", () => {
    expect(formatUsd(19)).toBe("$19.00");
  });

  it("includes sign and two decimal places minimum", () => {
    expect(formatUsd(1234.5)).toMatch(/^\$1,234\.5/);
  });
});

describe("formatTokens", () => {
  it("formats millions with M suffix", () => {
    expect(formatTokens(1_500_000)).toBe("1.5M");
  });

  it("formats thousands with K suffix", () => {
    expect(formatTokens(45_000)).toBe("45.0K");
  });

  it("formats small counts without suffix", () => {
    expect(formatTokens(999)).toBe("999");
  });
});
