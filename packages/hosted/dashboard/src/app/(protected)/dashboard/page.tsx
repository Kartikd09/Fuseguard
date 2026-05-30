// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// Dashboard overview — total spend, blocked calls, top spenders, per-key drill-down.
// Server Component: fetches data server-side; client child polls for freshness (2s).
import type { Metadata } from "next";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { fetchApiKeys, fetchBudgets, fetchBlocks, fetchUsageEvents, hoursAgoIso } from "@/lib/data/queries";
import {
  buildSpendSummary,
  buildKeySpend,
  buildTopSpenders,
  formatUsd,
} from "@/lib/data/spend";
import StatCard from "@/components/ui/StatCard";
import BudgetBar from "@/components/ui/BudgetBar";
import EmptyState from "@/components/ui/EmptyState";
import DashboardPoller from "./DashboardPoller";
import Link from "next/link";

export const metadata: Metadata = { title: "Overview — FuseGuard" };

// Force dynamic — reads from Supabase auth + live data; cannot be statically prerendered.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createServerSupabaseClient();
  const since24h = hoursAgoIso(24);

  const [keys, budgets, events, blocks] = await Promise.all([
    fetchApiKeys(supabase),
    fetchBudgets(supabase),
    fetchUsageEvents(supabase, since24h),
    fetchBlocks(supabase, since24h),
  ]);

  const summary = buildSpendSummary(events, blocks, "last 24h");
  const keySpend = buildKeySpend(keys, events, blocks, budgets);
  const topSpenders = buildTopSpenders(keySpend, 5);

  const hasActivity = events.length > 0 || blocks.length > 0;
  const hasFirstBlock = blocks.length > 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Overview</h1>
        <DashboardPoller />
      </div>

      {/* First-block celebration moment */}
      {hasFirstBlock && (
        <div
          role="status"
          className="rounded-xl border border-green-700 bg-green-900/20 px-5 py-4 flex items-start gap-3"
        >
          <span className="text-2xl" aria-hidden="true">🛡️</span>
          <div>
            <p className="font-semibold text-green-300">FuseGuard just earned its keep</p>
            <p className="text-sm text-green-400/80 mt-0.5">
              A call was blocked before it could breach your budget.{" "}
              <strong>That&apos;s the whole product.</strong>
            </p>
          </div>
        </div>
      )}

      {/* Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Total spend (24h)"
          value={formatUsd(summary.totalUsd)}
          sub={summary.windowLabel}
        />
        <StatCard
          label="Blocked calls (24h)"
          value={summary.blockedCount.toLocaleString()}
          variant={summary.blockedCount > 0 ? "danger" : "default"}
          sub={summary.blockedCount > 0 ? "pre-flight enforcements" : "none yet"}
        />
        <StatCard
          label="Active API keys"
          value={keys.length.toLocaleString()}
          sub={keys.length === 0 ? "Create one in Setup →" : undefined}
        />
      </div>

      {/* No activity yet */}
      {!hasActivity && (
        <EmptyState
          icon="📡"
          title="No usage yet in the last 24 hours"
          description="Point your Anthropic client at your FuseGuard proxy URL and make your first call."
          action={
            <Link
              href="/setup"
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors"
            >
              View setup instructions →
            </Link>
          }
        />
      )}

      {/* Top spenders */}
      {topSpenders.length > 0 && (
        <section aria-labelledby="top-spenders-heading">
          <h2
            id="top-spenders-heading"
            className="text-lg font-semibold text-white mb-4"
          >
            Top spenders (24h)
          </h2>
          <div className="fg-card space-y-4">
            {topSpenders.map((ts) => (
              <div key={ts.keyId} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="fg-code truncate">{ts.keyPrefix}…</span>
                    <span className="text-sm text-gray-400 truncate">{ts.keyLabel}</span>
                  </div>
                  <span className="text-sm font-medium text-white tabular-nums ml-3 shrink-0">
                    {formatUsd(ts.spentUsd)}
                  </span>
                </div>
                <BudgetBar percent={ts.percentOfTotal} label="% of total" />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Per-key drill-down */}
      {keySpend.length > 0 && (
        <section aria-labelledby="per-key-heading">
          <h2
            id="per-key-heading"
            className="text-lg font-semibold text-white mb-4"
          >
            Per-key breakdown
          </h2>
          <div className="overflow-x-auto rounded-xl border border-gray-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 bg-gray-900/50">
                  <th className="text-left px-4 py-3 text-gray-400 font-medium">Key</th>
                  <th className="text-right px-4 py-3 text-gray-400 font-medium">Spend</th>
                  <th className="text-right px-4 py-3 text-gray-400 font-medium">Budget</th>
                  <th className="text-right px-4 py-3 text-gray-400 font-medium">Blocked</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {keySpend.map((k) => (
                  <tr key={k.keyId} className="bg-gray-900 hover:bg-gray-800/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-white font-medium">{k.keyLabel}</span>
                        <span className="fg-code text-xs">{k.keyPrefix}…</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-white">
                      {formatUsd(k.spentUsd)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {k.budgetUsd !== null ? (
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-white tabular-nums">{formatUsd(k.budgetUsd)}</span>
                          {k.budgetPercent !== null && (
                            <span
                              className={`text-xs tabular-nums ${
                                k.budgetPercent >= 100
                                  ? "text-red-400"
                                  : k.budgetPercent >= 80
                                  ? "text-yellow-400"
                                  : "text-gray-400"
                              }`}
                            >
                              {k.budgetPercent}%
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-500">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {k.blockedCount > 0 ? (
                        <span className="fg-badge-danger">{k.blockedCount}</span>
                      ) : (
                        <span className="text-gray-500 tabular-nums">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
