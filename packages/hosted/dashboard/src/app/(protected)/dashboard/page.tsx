// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// Dashboard overview — total spend, blocked calls, top spenders, per-key drill-down.
// Server Component: fetches data server-side; client child polls for freshness (2s).
import type { Metadata } from "next";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { fetchApiKeys, fetchBudgets, fetchBlocks, fetchUsageEvents, hoursAgoIso, resolveActiveOrgId } from "@/lib/data/queries";
import SpendChart from "@/components/ui/SpendChart";
import {
  buildHourlySpend,
  buildSpendSummary,
  buildKeySpend,
  buildTopSpenders,
  formatUsd,
} from "@/lib/data/spend";
import StatCard from "@/components/ui/StatCard";
import BudgetBar from "@/components/ui/BudgetBar";
import EmptyState from "@/components/ui/EmptyState";
import DashboardPoller from "./DashboardPoller";
import RangeSelector from "./RangeSelector";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DollarSign,
  ShieldOff,
  KeyRound,
  ArrowRight,
  Wifi,
} from "lucide-react";

export const metadata: Metadata = { title: "Overview — FuseGuard" };

// Force dynamic — reads from Supabase auth + live data; cannot be statically prerendered.
export const dynamic = "force-dynamic";

const RANGE_CONFIG = {
  "24h": { hours: 24,  label: "last 24h" },
  "7d":  { hours: 168, label: "last 7 days" },
  "30d": { hours: 720, label: "last 30 days" },
} as const;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { range: rawRange } = await searchParams;
  const range = (rawRange && rawRange in RANGE_CONFIG ? rawRange : "24h") as keyof typeof RANGE_CONFIG;
  const { hours, label } = RANGE_CONFIG[range];

  const supabase = await createServerSupabaseClient();
  const since = hoursAgoIso(hours);
  const orgId = await resolveActiveOrgId(supabase);

  if (!orgId) {
    return <div className="p-8 text-muted-foreground">No organization found. Please sign out and sign in again.</div>;
  }

  const [keys, budgets, events, blocks] = await Promise.all([
    fetchApiKeys(supabase, orgId),
    fetchBudgets(supabase, orgId),
    fetchUsageEvents(supabase, orgId, since),
    fetchBlocks(supabase, orgId, since),
  ]);

  const summary = buildSpendSummary(events, blocks, label);
  const keySpend = buildKeySpend(keys, events, blocks, budgets);
  const topSpenders = buildTopSpenders(keySpend, 5);
  const hourly = buildHourlySpend(events, blocks, hours, new Date().toISOString());

  const hasActivity = events.length > 0 || blocks.length > 0;
  const hasFirstBlock = blocks.length > 0;

  // Compute total spend blocked value (approximate using avg event cost)
  const avgCostPerEvent = events.length > 0 ? summary.totalUsd / events.length : 0;
  const savedUsd = blocks.length * avgCostPerEvent;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Overview</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{label}</p>
        </div>
        <div className="flex items-center gap-3">
          <RangeSelector current={range} />
          <DashboardPoller />
        </div>
      </div>

      {/* First-block celebration moment */}
      {hasFirstBlock && (
        <div
          role="status"
          className="rounded-xl border border-emerald-600/40 bg-emerald-50 dark:bg-emerald-950/30 px-5 py-4 flex items-start gap-3"
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20">
            <ShieldOff className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          </div>
          <div>
            <p className="font-semibold text-emerald-800 dark:text-emerald-300">
              FuseGuard just earned its keep
              {savedUsd > 0 && (
                <span className="ml-2 text-emerald-700 dark:text-emerald-400/90 font-normal">
                  — saved ~{formatUsd(savedUsd)}
                </span>
              )}
            </p>
            <p className="text-sm text-emerald-700/80 dark:text-emerald-400/70 mt-0.5">
              {blocks.length} call{blocks.length !== 1 ? "s" : ""} blocked before breaching your
              budget.{" "}
              <strong className="font-medium text-emerald-700 dark:text-emerald-300/80">That&apos;s the whole product.</strong>
            </p>
          </div>
        </div>
      )}

      {/* KPI Stats row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label={`Total spend (${range})`}
          value={formatUsd(summary.totalUsd)}
          sub={summary.windowLabel}
          icon={<DollarSign className="h-4 w-4" />}
        />
        <StatCard
          label={`Blocked calls (${range})`}
          value={summary.blockedCount.toLocaleString()}
          variant={summary.blockedCount > 0 ? "danger" : "default"}
          sub={summary.blockedCount > 0 ? "pre-flight enforcements" : "none yet"}
          icon={<ShieldOff className="h-4 w-4" />}
        />
        <StatCard
          label="Active API keys"
          value={keys.length.toLocaleString()}
          sub={keys.length === 0 ? "Create one in Setup" : `${keys.filter(k => k.is_active).length} active`}
          icon={<KeyRound className="h-4 w-4" />}
        />
      </div>

      {/* Spend-over-time chart */}
      {hasActivity && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Spend &amp; blocks — {label}</CardTitle>
          </CardHeader>
          <CardContent>
            <SpendChart data={hourly} height={240} />
          </CardContent>
        </Card>
      )}

      {/* No activity yet */}
      {!hasActivity && (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={<Wifi className="h-6 w-6 text-muted-foreground" />}
              title="No usage yet in the last 24 hours"
              description="Point your Anthropic client at your FuseGuard proxy URL and make your first call."
              action={
                <Button asChild>
                  <Link href="/setup">
                    View setup instructions
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              }
            />
          </CardContent>
        </Card>
      )}

      {/* Top spenders */}
      {topSpenders.length > 0 && (
        <section aria-labelledby="top-spenders-heading">
          <Card>
            <CardHeader className="pb-4">
              <CardTitle id="top-spenders-heading" className="text-base">
                Top spenders ({range})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {topSpenders.map((ts) => (
                <div key={ts.keyId} className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <code className="fg-code truncate text-xs">{ts.keyPrefix}…</code>
                      <span className="text-sm text-muted-foreground truncate">{ts.keyLabel}</span>
                    </div>
                    <span className="text-sm font-semibold tabular-nums text-foreground shrink-0">
                      {formatUsd(ts.spentUsd)}
                    </span>
                  </div>
                  <BudgetBar percent={ts.percentOfTotal} label="share of total spend" />
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      )}

      {/* Per-key drill-down */}
      {keySpend.length > 0 && (
        <section aria-labelledby="per-key-heading">
          <Card>
            <CardHeader className="pb-0">
              <CardTitle id="per-key-heading" className="text-base">
                Per-key breakdown
              </CardTitle>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Key
                    </th>
                    <th className="text-right px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Spend
                    </th>
                    <th className="text-right px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Budget
                    </th>
                    <th className="text-right px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      Blocked
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {keySpend.map((k) => (
                    <tr
                      key={k.keyId}
                      className="hover:bg-muted/40 transition-colors group"
                    >
                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium text-foreground">{k.keyLabel}</span>
                          <code className="text-xs text-muted-foreground font-mono">
                            {k.keyPrefix}…
                          </code>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right tabular-nums font-medium text-foreground">
                        {formatUsd(k.spentUsd)}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {k.budgetUsd !== null ? (
                          <div className="flex flex-col items-end gap-1.5">
                            <span className="tabular-nums text-foreground">{formatUsd(k.budgetUsd)}</span>
                            {k.budgetPercent !== null && (
                              <div className="w-20">
                                <BudgetBar percent={k.budgetPercent} />
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {k.blockedCount > 0 ? (
                          <Badge variant="destructive">{k.blockedCount}</Badge>
                        ) : (
                          <span className="text-muted-foreground tabular-nums text-xs">0</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </section>
      )}
    </div>
  );
}
