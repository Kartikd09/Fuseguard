"use client";
// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// Create budget modal — scope, limit type, value, window.

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { ApiKey, BudgetScope, LimitType, BudgetWindow } from "@/types";

interface CreateBudgetButtonProps {
  keys: ApiKey[];
  asText?: boolean;
}

interface BudgetFormData {
  scope: BudgetScope;
  scope_ref: string; // "" = all
  limit_type: LimitType;
  limit_value: string;
  window: BudgetWindow;
  window_hours: string;
}

const WINDOW_OPTIONS: { value: BudgetWindow; label: string }[] = [
  { value: "daily", label: "Per day (resets midnight UTC)" },
  { value: "rolling", label: "Rolling window" },
  { value: "total", label: "Total (never resets)" },
];

export default function CreateBudgetButton({ keys, asText }: CreateBudgetButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const [form, setForm] = useState<BudgetFormData>({
    scope: "key",
    scope_ref: "",
    limit_type: "usd",
    limit_value: "",
    window: "daily",
    window_hours: "24",
  });

  function update<K extends keyof BudgetFormData>(k: K, v: BudgetFormData[K]) {
    setForm((prev) => ({ ...prev, [k]: v }));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setIsSubmitting(true);
    setError("");

    const limitValue = parseFloat(form.limit_value);
    if (isNaN(limitValue) || limitValue <= 0) {
      setError("Limit must be a positive number");
      setIsSubmitting(false);
      return;
    }

    const body = {
      scope: form.scope,
      scope_ref: form.scope_ref || null,
      limit_type: form.limit_type,
      limit_value: limitValue,
      window: form.window,
      window_seconds:
        form.window === "rolling" ? parseInt(form.window_hours, 10) * 3600 : null,
    };

    try {
      const res = await fetch("/api/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { error?: string };

      if (!res.ok) {
        setError(json.error ?? "Failed to create budget");
        setIsSubmitting(false);
        return;
      }

      setIsOpen(false);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const trigger = asText ? (
    <button
      type="button"
      onClick={() => setIsOpen(true)}
      className="inline-flex items-center gap-1.5 rounded-lg bg-brand-500 hover:bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors"
    >
      Create budget →
    </button>
  ) : (
    <button
      type="button"
      onClick={() => setIsOpen(true)}
      className="inline-flex items-center gap-2 rounded-lg bg-brand-500 hover:bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors"
    >
      + Add budget
    </button>
  );

  return (
    <>
      {trigger}

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-budget-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-gray-900 border border-gray-800 p-6 space-y-5">
            <h2 id="create-budget-title" className="text-lg font-bold text-white">
              Create budget
            </h2>

            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
              {/* Scope */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Scope</label>
                <div className="flex gap-3">
                  {(["key", "session"] as BudgetScope[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => update("scope", s)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        form.scope === s
                          ? "border-brand-500 bg-brand-500/10 text-brand-500"
                          : "border-gray-700 text-gray-400 hover:border-gray-600"
                      }`}
                    >
                      {s === "key" ? "API Key" : "Session"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Scope ref (key picker) */}
              {form.scope === "key" && keys.length > 0 && (
                <div>
                  <label htmlFor="scope-ref" className="block text-sm font-medium text-gray-300 mb-1">
                    Apply to (blank = all keys)
                  </label>
                  <select
                    id="scope-ref"
                    value={form.scope_ref}
                    onChange={(e) => update("scope_ref", e.target.value)}
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white focus:border-brand-500 focus:outline-none"
                  >
                    <option value="">All keys</option>
                    {keys.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.label} ({k.fuseguard_key_prefix}…)
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Limit type */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Limit type</label>
                <div className="flex gap-3">
                  {(["usd", "tokens"] as LimitType[]).map((lt) => (
                    <button
                      key={lt}
                      type="button"
                      onClick={() => update("limit_type", lt)}
                      className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                        form.limit_type === lt
                          ? "border-brand-500 bg-brand-500/10 text-brand-500"
                          : "border-gray-700 text-gray-400 hover:border-gray-600"
                      }`}
                    >
                      {lt === "usd" ? "$ USD" : "Tokens"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Limit value */}
              <div>
                <label htmlFor="limit-value" className="block text-sm font-medium text-gray-300 mb-1">
                  {form.limit_type === "usd" ? "Limit ($)" : "Limit (tokens)"}
                </label>
                <input
                  id="limit-value"
                  type="number"
                  min="0.01"
                  step={form.limit_type === "usd" ? "0.01" : "1000"}
                  required
                  value={form.limit_value}
                  onChange={(e) => update("limit_value", e.target.value)}
                  placeholder={form.limit_type === "usd" ? "20.00" : "1000000"}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2.5 text-sm text-white placeholder-gray-500 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  disabled={isSubmitting}
                />
              </div>

              {/* Window */}
              <div>
                <label htmlFor="budget-window" className="block text-sm font-medium text-gray-300 mb-1">
                  Reset window
                </label>
                <select
                  id="budget-window"
                  value={form.window}
                  onChange={(e) => update("window", e.target.value as BudgetWindow)}
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-white focus:border-brand-500 focus:outline-none"
                >
                  {WINDOW_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>

                {form.window === "rolling" && (
                  <div className="mt-2">
                    <label htmlFor="window-hours" className="block text-xs text-gray-400 mb-1">
                      Window size (hours)
                    </label>
                    <input
                      id="window-hours"
                      type="number"
                      min="1"
                      max="720"
                      value={form.window_hours}
                      onChange={(e) => update("window_hours", e.target.value)}
                      className="w-24 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-brand-500 focus:outline-none"
                    />
                  </div>
                )}
              </div>

              {error && (
                <p role="alert" className="text-sm text-red-400">{error}</p>
              )}

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !form.limit_value}
                  className="px-4 py-2 rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-semibold text-white transition-colors"
                >
                  {isSubmitting ? "Saving…" : "Create budget"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
