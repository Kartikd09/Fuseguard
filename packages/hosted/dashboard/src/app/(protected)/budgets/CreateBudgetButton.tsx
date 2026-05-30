"use client";
// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// Create budget modal — scope, limit type, value, window.

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { ApiKey, BudgetScope, LimitType, BudgetWindow } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Loader2, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

interface CreateBudgetButtonProps {
  keys: ApiKey[];
  asText?: boolean;
}

interface BudgetFormData {
  scope: BudgetScope;
  scope_ref: string;
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

  const toggleButtonClass = (active: boolean) =>
    cn(
      "flex-1 py-2 rounded-lg text-sm font-medium border transition-colors",
      active
        ? "border-primary bg-primary/10 text-primary"
        : "border-border text-muted-foreground hover:border-muted-foreground"
    );

  return (
    <>
      {asText ? (
        <Button onClick={() => setIsOpen(true)}>
          <Shield className="h-4 w-4" />
          Create budget
        </Button>
      ) : (
        <Button onClick={() => setIsOpen(true)}>
          <Plus className="h-4 w-4" />
          Add budget
        </Button>
      )}

      <Dialog open={isOpen} onOpenChange={(open) => !open && setIsOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create budget</DialogTitle>
            <DialogDescription>
              Set a hard-kill ceiling. FuseGuard blocks calls before a breach occurs.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            {/* Scope */}
            <div className="space-y-1.5">
              <Label>Scope</Label>
              <div className="flex gap-2">
                {(["key", "session"] as BudgetScope[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => update("scope", s)}
                    className={toggleButtonClass(form.scope === s)}
                  >
                    {s === "key" ? "API Key" : "Session"}
                  </button>
                ))}
              </div>
            </div>

            {/* Scope ref (key picker) */}
            {form.scope === "key" && keys.length > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor="scope-ref">Apply to (blank = all keys)</Label>
                <select
                  id="scope-ref"
                  value={form.scope_ref}
                  onChange={(e) => update("scope_ref", e.target.value)}
                  className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
            <div className="space-y-1.5">
              <Label>Limit type</Label>
              <div className="flex gap-2">
                {(["usd", "tokens"] as LimitType[]).map((lt) => (
                  <button
                    key={lt}
                    type="button"
                    onClick={() => update("limit_type", lt)}
                    className={toggleButtonClass(form.limit_type === lt)}
                  >
                    {lt === "usd" ? "$ USD" : "Tokens"}
                  </button>
                ))}
              </div>
            </div>

            {/* Limit value */}
            <div className="space-y-1.5">
              <Label htmlFor="limit-value">
                {form.limit_type === "usd" ? "Limit ($)" : "Limit (tokens)"}
              </Label>
              <Input
                id="limit-value"
                type="number"
                min="0.01"
                step={form.limit_type === "usd" ? "0.01" : "1000"}
                required
                value={form.limit_value}
                onChange={(e) => update("limit_value", e.target.value)}
                placeholder={form.limit_type === "usd" ? "20.00" : "1000000"}
                disabled={isSubmitting}
                className="h-10"
              />
            </div>

            {/* Window */}
            <div className="space-y-1.5">
              <Label htmlFor="budget-window">Reset window</Label>
              <select
                id="budget-window"
                value={form.window}
                onChange={(e) => update("window", e.target.value as BudgetWindow)}
                className="flex h-9 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {WINDOW_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>

              {form.window === "rolling" && (
                <div className="space-y-1">
                  <Label htmlFor="window-hours" className="text-xs text-muted-foreground">
                    Window size (hours)
                  </Label>
                  <Input
                    id="window-hours"
                    type="number"
                    min="1"
                    max="720"
                    value={form.window_hours}
                    onChange={(e) => update("window_hours", e.target.value)}
                    className="w-24 h-9"
                  />
                </div>
              )}
            </div>

            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setIsOpen(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={isSubmitting || !form.limit_value}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving…
                  </>
                ) : (
                  "Create budget"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
