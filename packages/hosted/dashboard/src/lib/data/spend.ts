// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// Spend aggregation logic — pure functions that shape raw DB rows into dashboard metrics.
// These are tested with mocked data (no live DB required).

import type { UsageEvent, Block, ApiKey, Budget, KeySpend, TopSpender, SpendSummary } from "@/types";

// -- Pure aggregation helpers (testable, no DB dependency) --

/**
 * Aggregate total USD spend from usage events.
 */
export function aggregateTotalSpend(events: UsageEvent[]): number {
  return events.reduce((sum, e) => sum + e.cost_usd, 0);
}

/**
 * Count total blocked calls.
 */
export function countBlocks(blocks: Block[]): number {
  return blocks.length;
}

/**
 * Build per-key spend summary, merging usage events with key metadata and budgets.
 */
export function buildKeySpend(
  keys: ApiKey[],
  events: UsageEvent[],
  blocks: Block[],
  budgets: Budget[]
): KeySpend[] {
  return keys.map((key) => {
    const keyEvents = events.filter((e) => e.api_key_id === key.id);
    const keyBlocks = blocks.filter((b) => b.api_key_id === key.id);
    const spentUsd = keyEvents.reduce((sum, e) => sum + e.cost_usd, 0);

    // Find the most specific active USD budget for this key
    const keyBudget = budgets.find(
      (b) =>
        b.is_active &&
        b.scope === "key" &&
        b.scope_ref === key.id &&
        b.limit_type === "usd"
    );

    const budgetUsd = keyBudget ? keyBudget.limit_value : null;
    const budgetPercent =
      budgetUsd !== null && budgetUsd > 0
        ? Math.round((spentUsd / budgetUsd) * 100)
        : null;

    return {
      keyId: key.id,
      keyLabel: key.label,
      keyPrefix: key.fuseguard_key_prefix,
      spentUsd,
      budgetUsd,
      budgetPercent,
      blockedCount: keyBlocks.length,
    };
  });
}

/**
 * Derive top spenders sorted descending by USD spend.
 * Returns at most `limit` entries.
 */
export function buildTopSpenders(
  keySpend: KeySpend[],
  limit = 5
): TopSpender[] {
  const totalUsd = keySpend.reduce((sum, k) => sum + k.spentUsd, 0);

  return [...keySpend]
    .sort((a, b) => b.spentUsd - a.spentUsd)
    .slice(0, limit)
    .map((k) => ({
      keyId: k.keyId,
      keyLabel: k.keyLabel,
      keyPrefix: k.keyPrefix,
      spentUsd: k.spentUsd,
      percentOfTotal: totalUsd > 0 ? Math.round((k.spentUsd / totalUsd) * 100) : 0,
    }));
}

/**
 * Build the overview spend summary card.
 */
export function buildSpendSummary(
  events: UsageEvent[],
  blocks: Block[],
  windowLabel: string
): SpendSummary {
  return {
    totalUsd: aggregateTotalSpend(events),
    blockedCount: countBlocks(blocks),
    windowLabel,
  };
}

/**
 * Compute budget utilisation percent. Clamps to 0 when limit_value is 0.
 */
export function budgetUsedPercent(
  budget: Budget,
  events: UsageEvent[]
): number {
  if (budget.limit_value <= 0) return 0;

  const relevant = events.filter(
    (e) =>
      (budget.scope === "key"
        ? budget.scope_ref === null || e.api_key_id === budget.scope_ref
        : budget.scope_ref === null || e.session === budget.scope_ref)
  );

  if (budget.limit_type === "usd") {
    const spent = relevant.reduce((sum, e) => sum + e.cost_usd, 0);
    return Math.round((spent / budget.limit_value) * 100);
  }

  // tokens
  const spentTokens = relevant.reduce(
    (sum, e) => sum + e.input_tokens + e.output_tokens,
    0
  );
  return Math.round((spentTokens / budget.limit_value) * 100);
}

/**
 * Filter events to a rolling window (last N seconds from reference time).
 */
export function filterToWindow(
  events: UsageEvent[],
  windowSeconds: number,
  referenceIso: string
): UsageEvent[] {
  const referenceMs = new Date(referenceIso).getTime();
  const cutoffMs = referenceMs - windowSeconds * 1000;
  return events.filter((e) => new Date(e.ts).getTime() >= cutoffMs);
}

/**
 * Format USD for display: "$1,234.56"
 */
export function formatUsd(usd: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(usd);
}

/**
 * Format large token counts: "1.2M", "450K", "12,345"
 */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("en-US");
}

export interface HourlySpendPoint {
  readonly label: string;
  readonly spend: number;
  readonly blocked: number;
}

/**
 * Bucket usage events (spend) and blocks into hourly points over the last `hours`,
 * ending at `referenceIso`. Returns one point per hour, oldest→newest, for the spend chart.
 */
export function buildHourlySpend(
  events: UsageEvent[],
  blocks: Block[],
  hours: number,
  referenceIso: string
): HourlySpendPoint[] {
  const HOUR_MS = 3_600_000;
  const refMs = new Date(referenceIso).getTime();
  const startMs = refMs - hours * HOUR_MS;

  const points: { spend: number; blocked: number; startMs: number }[] = Array.from(
    { length: hours },
    (_, i) => ({ spend: 0, blocked: 0, startMs: startMs + i * HOUR_MS })
  );

  const bucketIndex = (iso: string): number => {
    const ms = new Date(iso).getTime();
    if (ms < startMs || ms > refMs) return -1;
    const idx = Math.floor((ms - startMs) / HOUR_MS);
    return idx >= hours ? hours - 1 : idx;
  };

  for (const e of events) {
    const i = bucketIndex(e.ts);
    if (i >= 0) points[i]!.spend += e.cost_usd;
  }
  for (const b of blocks) {
    const i = bucketIndex(b.ts);
    if (i >= 0) points[i]!.blocked += 1;
  }

  return points.map((p) => ({
    label: new Date(p.startMs).toLocaleTimeString("en-US", { hour: "numeric", hour12: true }),
    spend: Math.round(p.spend * 1_000_000) / 1_000_000,
    blocked: p.blocked,
  }));
}
