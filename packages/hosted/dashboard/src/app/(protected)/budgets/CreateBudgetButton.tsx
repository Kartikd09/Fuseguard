"use client";
// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
import { useState, useEffect, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { ApiKey, Budget, BudgetScope, LimitType, BudgetWindow } from "@/types";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, Loader2, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

interface CreateBudgetButtonProps {
  keys: ApiKey[];
  asText?: boolean;
  defaultKeyId?: string;   // pre-select a specific key when opening from KeyRow
  editBudget?: Budget;     // when set, opens in edit mode
  trigger?: React.ReactNode; // custom trigger element
}

interface BudgetFormData {
  scope: BudgetScope;
  scope_ref: string;
  limit_type: LimitType;
  limit_value: string;
  window_type: BudgetWindow;
  window_hours: string;
}

const WINDOW_OPTIONS: { value: BudgetWindow; label: string }[] = [
  { value: "daily", label: "Per day (resets midnight UTC)" },
  { value: "rolling", label: "Rolling window" },
  { value: "total", label: "Total (never resets)" },
];

const SELECT_CLASS = "flex h-9 w-full rounded-lg border border-input bg-background text-foreground px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring [&>option]:bg-background [&>option]:text-foreground";

export default function CreateBudgetButton({ keys, asText, defaultKeyId, editBudget, trigger }: CreateBudgetButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const defaultForm = (): BudgetFormData => ({
    scope: "key",
    scope_ref: defaultKeyId ?? "",
    limit_type: "usd",
    limit_value: "",
    window_type: "daily",
    window_hours: "24",
  });

  const [form, setForm] = useState<BudgetFormData>(defaultForm);

  // When editBudget changes (edit mode), populate form from existing budget.
  useEffect(() => {
    if (editBudget) {
      setForm({
        scope: editBudget.scope,
        scope_ref: editBudget.scope_ref ?? "",
        limit_type: editBudget.limit_type,
        limit_value: String(editBudget.limit_value),
        window_type: editBudget.window_type,
        window_hours: editBudget.window_seconds ? String(editBudget.window_seconds / 3600) : "24",
      });
    } else {
      setForm(defaultForm());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editBudget, defaultKeyId]);

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
      window_type: form.window_type,
      window_seconds: form.window_type === "rolling" ? parseInt(form.window_hours, 10) * 3600 : null,
    };

    const url = editBudget ? `/api/budgets/${editBudget.id}` : "/api/budgets";
    const method = editBudget ? "PATCH" : "POST";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Failed to save budget");
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
      active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-muted-foreground"
    );

  const isEdit = !!editBudget;

  return (
    <>
      {trigger ? (
        <span onClick={() => setIsOpen(true)}>{trigger}</span>
      ) : asText ? (
        <Button onClick={() => setIsOpen(true)}>
          <Shield className="h-4 w-4" />
          Create budget
        </Button>
      ) : (
        <Button onClick={() => setIsOpen(true)}>
          <Plus className="h-4 w-4" />
          {isEdit ? "Edit budget" : "Add budget"}
        </Button>
      )}

      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) setIsOpen(false); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{isEdit ? "Edit budget" : "Create budget"}</DialogTitle>
            <DialogDescription>
              Set a hard-kill ceiling. FuseGuard blocks calls before a breach occurs.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
            {/* Scope — session budgets are not yet enforced server-side (see docs/AUDIT_FINDINGS C1),
                so only API Key scope is offered until session DO wiring ships. */}
            <div className="space-y-1.5">
              <Label>Scope</Label>
              <div className="flex gap-2">
                {(["key"] as BudgetScope[]).map((s) => (
                  <button key={s} type="button" onClick={() => update("scope", s)}
                    className={toggleButtonClass(form.scope === s)}>
                    API Key
                  </button>
                ))}
              </div>
            </div>

            {/* Key picker */}
            {form.scope === "key" && keys.length > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor="scope-ref">Apply to (blank = all keys)</Label>
                <select id="scope-ref" value={form.scope_ref}
                  onChange={(e) => update("scope_ref", e.target.value)} className={SELECT_CLASS}>
                  <option value="">All keys</option>
                  {keys.map((k) => (
                    <option key={k.id} value={k.id}>{k.label} ({k.fuseguard_key_prefix}…)</option>
                  ))}
                </select>
              </div>
            )}

            {/* Limit type */}
            <div className="space-y-1.5">
              <Label>Limit type</Label>
              <div className="flex gap-2">
                {(["usd", "tokens"] as LimitType[]).map((lt) => (
                  <button key={lt} type="button" onClick={() => update("limit_type", lt)}
                    className={toggleButtonClass(form.limit_type === lt)}>
                    {lt === "usd" ? "$ USD" : "Tokens"}
                  </button>
                ))}
              </div>
            </div>

            {/* Limit value */}
            <div className="space-y-1.5">
              <Label htmlFor="limit-value">{form.limit_type === "usd" ? "Limit ($)" : "Limit (tokens)"}</Label>
              <Input id="limit-value" type="number"
                min={form.limit_type === "usd" ? "0.01" : "1"}
                step={form.limit_type === "usd" ? "0.01" : "1"} required
                value={form.limit_value} onChange={(e) => update("limit_value", e.target.value)}
                placeholder={form.limit_type === "usd" ? "20.00" : "1000000"}
                disabled={isSubmitting} className="h-10" />
            </div>

            {/* Window */}
            <div className="space-y-1.5">
              <Label htmlFor="budget-window">Reset window</Label>
              <select id="budget-window" value={form.window_type}
                onChange={(e) => update("window_type", e.target.value as BudgetWindow)}
                className={SELECT_CLASS}>
                {WINDOW_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              {form.window_type === "rolling" && (
                <div className="space-y-1">
                  <Label htmlFor="window-hours" className="text-xs text-muted-foreground">Window size (hours)</Label>
                  <Input id="window-hours" type="number" min="1" max="720"
                    value={form.window_hours} onChange={(e) => update("window_hours", e.target.value)}
                    className="w-24 h-9" disabled={isSubmitting} />
                </div>
              )}
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <DialogFooter className="gap-2">
              <Button type="button" variant="ghost" onClick={() => setIsOpen(false)} disabled={isSubmitting}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : isEdit ? "Save changes" : "Create budget"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
