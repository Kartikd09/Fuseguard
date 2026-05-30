// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// Budgets page — CRUD budgets (scope, limit_type, value, window).
import type { Metadata } from "next";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { fetchBudgets, fetchApiKeys, fetchUsageEvents, hoursAgoIso } from "@/lib/data/queries";
import { budgetUsedPercent, formatUsd, formatTokens } from "@/lib/data/spend";
import EmptyState from "@/components/ui/EmptyState";
import BudgetBar from "@/components/ui/BudgetBar";
import CreateBudgetButton from "./CreateBudgetButton";
import type { Budget } from "@/types";

export const metadata: Metadata = { title: "Budgets — FuseGuard" };
export const dynamic = "force-dynamic";

function budgetScopeLabel(budget: Budget, keyLabel?: string): string {
  if (budget.scope === "key") {
    return keyLabel ? `Key: ${keyLabel}` : "All keys";
  }
  return budget.scope_ref ? `Session: ${budget.scope_ref}` : "All sessions";
}

function budgetWindowLabel(budget: Budget): string {
  const map: Record<string, string> = {
    daily: "Per day",
    total: "Total (no reset)",
    rolling: budget.window_seconds
      ? `Rolling ${Math.round(budget.window_seconds / 3600)}h`
      : "Rolling",
  };
  return map[budget.window] ?? budget.window;
}

function limitLabel(budget: Budget): string {
  if (budget.limit_type === "usd") return formatUsd(budget.limit_value);
  return `${formatTokens(budget.limit_value)} tokens`;
}

export default async function BudgetsPage() {
  const supabase = await createServerSupabaseClient();
  const [budgets, keys, events] = await Promise.all([
    fetchBudgets(supabase),
    fetchApiKeys(supabase),
    fetchUsageEvents(supabase, hoursAgoIso(24)),
  ]);

  const keyById = new Map(keys.map((k) => [k.id, k]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Budgets</h1>
          <p className="mt-1 text-sm text-gray-400">
            Hard-kill ceilings. FuseGuard blocks calls <em>before</em> a breach.
          </p>
        </div>
        <CreateBudgetButton keys={keys} />
      </div>

      {budgets.length === 0 ? (
        <EmptyState
          icon="🛡️"
          title="No budgets set"
          description="Without a budget, FuseGuard tracks spend but won't block anything. Add one to enable hard enforcement."
          action={<CreateBudgetButton keys={keys} asText />}
        />
      ) : (
        <div className="space-y-4">
          {budgets.map((budget) => {
            const key = budget.scope_ref ? keyById.get(budget.scope_ref) : undefined;
            const scopeLabel = budgetScopeLabel(budget, key?.label);
            const used = budgetUsedPercent(budget, events);

            return (
              <div key={budget.id} className="fg-card space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-white font-medium">{scopeLabel}</span>
                      <span className="fg-badge-success text-xs">{budgetWindowLabel(budget)}</span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          budget.limit_type === "usd"
                            ? "bg-blue-900/40 text-blue-400"
                            : "bg-purple-900/40 text-purple-400"
                        }`}
                      >
                        {budget.limit_type === "usd" ? "$ USD" : "tokens"}
                      </span>
                    </div>
                    <p className="text-sm text-gray-400">
                      Limit: <span className="text-white font-mono">{limitLabel(budget)}</span>
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-2xl font-bold tabular-nums text-white">{used}%</p>
                    <p className="text-xs text-gray-500">used (24h)</p>
                  </div>
                </div>

                <BudgetBar
                  percent={used}
                  label={`${limitLabel(budget)} ceiling`}
                />

                {used >= 80 && used < 100 && (
                  <p className="text-xs text-yellow-400">
                    ⚠️ Approaching limit — next calls will be blocked when this hits 100%.
                  </p>
                )}
                {used >= 100 && (
                  <p className="text-xs text-red-400">
                    🚫 Budget exceeded — new calls are being blocked.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-xl border border-gray-800 bg-gray-900/30 px-5 py-4 text-sm text-gray-400">
        <p>
          <strong className="text-gray-300">How it works:</strong> FuseGuard estimates worst-case
          cost before each call (input tokens + max_tokens × output price). If that projection
          breaches the ceiling, the call is blocked with HTTP 402 — <em>before</em> it reaches
          Anthropic.
        </p>
      </div>
    </div>
  );
}
