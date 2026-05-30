// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// Budgets page — CRUD budgets (scope, limit_type, value, window).
import type { Metadata } from "next";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { fetchBudgets, fetchApiKeys, fetchUsageEvents, hoursAgoIso } from "@/lib/data/queries";
import { budgetUsedPercent, formatUsd, formatTokens } from "@/lib/data/spend";
import EmptyState from "@/components/ui/EmptyState";
import BudgetBar from "@/components/ui/BudgetBar";
import CreateBudgetButton from "./CreateBudgetButton";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Budget } from "@/types";
import { Shield, AlertTriangle, Ban, Info } from "lucide-react";

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
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Budgets</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Hard-kill ceilings. FuseGuard blocks calls <em>before</em> a breach.
          </p>
        </div>
        <CreateBudgetButton keys={keys} />
      </div>

      {budgets.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={<Shield className="h-6 w-6 text-muted-foreground" />}
              title="No budgets set"
              description="Without a budget, FuseGuard tracks spend but won't block anything. Add one to enable hard enforcement."
              action={<CreateBudgetButton keys={keys} asText />}
            />
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {budgets.map((budget) => {
            const key = budget.scope_ref ? keyById.get(budget.scope_ref) : undefined;
            const scopeLabel = budgetScopeLabel(budget, key?.label);
            const used = budgetUsedPercent(budget, events);

            return (
              <Card key={budget.id}>
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-foreground">{scopeLabel}</span>
                        <Badge variant="secondary">{budgetWindowLabel(budget)}</Badge>
                        <Badge variant={budget.limit_type === "usd" ? "info" : "default"}>
                          {budget.limit_type === "usd" ? "$ USD" : "Tokens"}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Limit:{" "}
                        <span className="font-mono text-foreground font-medium">
                          {limitLabel(budget)}
                        </span>
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p
                        className={`text-2xl font-bold tabular-nums ${
                          used >= 100
                            ? "text-destructive"
                            : used >= 80
                            ? "text-yellow-400"
                            : "text-foreground"
                        }`}
                      >
                        {used}%
                      </p>
                      <p className="text-xs text-muted-foreground">used (24h)</p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-3">
                  <BudgetBar
                    percent={used}
                    label={`${limitLabel(budget)} ceiling`}
                  />

                  {used >= 80 && used < 100 && (
                    <div className="flex items-start gap-2 text-xs text-yellow-400">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      Approaching limit — next calls will be blocked when this hits 100%.
                    </div>
                  )}
                  {used >= 100 && (
                    <div className="flex items-start gap-2 text-xs text-destructive">
                      <Ban className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      Budget exceeded — new calls are being blocked.
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card>
        <CardContent className="py-4">
          <div className="flex items-start gap-3 text-sm text-muted-foreground">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <p>
              <strong className="text-foreground">How it works:</strong> FuseGuard estimates
              worst-case cost before each call (input tokens + max_tokens × output price). If that
              projection breaches the ceiling, the call is blocked with HTTP 402 —{" "}
              <em>before</em> it reaches Anthropic.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
