// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
export * from "./database";

// Dashboard-layer aggregated types (computed from raw DB rows)

export interface SpendSummary {
  totalUsd: number;
  blockedCount: number;
  windowLabel: string; // e.g. "last 24h", "this month"
}

export interface KeySpend {
  keyId: string;
  keyLabel: string;
  keyPrefix: string;
  spentUsd: number;
  budgetUsd: number | null; // null if no USD budget set
  budgetPercent: number | null; // 0–100+
  blockedCount: number;
}

export interface TopSpender {
  keyId: string;
  keyLabel: string;
  keyPrefix: string;
  spentUsd: number;
  percentOfTotal: number;
}

export interface BudgetUsage {
  budget: import("./database").Budget;
  spentUsd: number;
  spentTokens: number;
  usedPercent: number;
}

// Form types

export interface CreateKeyForm {
  label: string;
}

export interface CreateBudgetForm {
  scope: import("./database").BudgetScope;
  scope_ref: string | null;
  limit_type: import("./database").LimitType;
  limit_value: number;
  window: import("./database").BudgetWindow;
  window_seconds: number | null;
}
