"use client";
// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ApiKey, Budget } from "@/types";
import { Button } from "@/components/ui/button";
import { Loader2, Pencil, Trash2 } from "lucide-react";
import CreateBudgetButton from "./CreateBudgetButton";

export default function BudgetActions({ budget, keys }: { budget: Budget; keys: ApiKey[] }) {
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  async function handleDelete() {
    if (!confirm("Delete this budget? FuseGuard will stop enforcing this ceiling.")) return;
    setDeleting(true);
    await fetch(`/api/budgets/${budget.id}`, { method: "DELETE" });
    router.refresh();
    setDeleting(false);
  }

  return (
    <div className="flex items-center gap-1">
      <CreateBudgetButton
        keys={keys}
        editBudget={budget}
        trigger={
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground">
            <Pencil className="h-3.5 w-3.5" />
          </Button>
        }
      />
      <Button variant="ghost" size="sm" onClick={handleDelete} disabled={deleting}
        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive">
        {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}
