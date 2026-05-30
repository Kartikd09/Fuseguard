"use client";
// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ApiKey, Budget } from "@/types";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface KeyRowProps {
  apiKey: ApiKey;
  budgets: Budget[];
}

function formatDate(iso: string | null): string {
  if (!iso) return "Never";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(iso));
}

export default function KeyRow({ apiKey, budgets }: KeyRowProps) {
  const [revoking, setRevoking] = useState(false);
  const router = useRouter();
  const activeBudgetCount = budgets.filter((b) => b.is_active).length;

  async function handleRevoke() {
    if (!confirm(`Revoke key "${apiKey.label}"? Any agents using it will get 401 errors.`)) return;
    setRevoking(true);
    await fetch(`/api/keys/${apiKey.id}`, { method: "DELETE" });
    router.refresh();
    setRevoking(false);
  }

  return (
    <tr className="hover:bg-muted/40 transition-colors">
      <td className="px-6 py-4 font-medium text-foreground">{apiKey.label}</td>
      <td className="px-6 py-4">
        <code className="font-mono text-xs text-primary/80 bg-muted px-2 py-1 rounded-md">
          {apiKey.fuseguard_key_prefix}••••••••••••
        </code>
      </td>
      <td className="px-6 py-4">
        {activeBudgetCount > 0 ? (
          <Link href="/budgets" className="text-xs text-emerald-400 hover:text-emerald-300 underline underline-offset-2 transition-colors">
            {activeBudgetCount} budget{activeBudgetCount !== 1 ? "s" : ""}
          </Link>
        ) : (
          <Link href={`/budgets?keyId=${apiKey.id}`} className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors">
            None — add one
          </Link>
        )}
      </td>
      <td className="px-6 py-4 text-muted-foreground text-xs">{formatDate(apiKey.last_used_at)}</td>
      <td className="px-6 py-4">
        <Badge variant={apiKey.is_active ? "success" : "destructive"}>
          {apiKey.is_active ? "Active" : "Revoked"}
        </Badge>
      </td>
      <td className="px-6 py-4 text-right">
        {apiKey.is_active && (
          <Button variant="ghost" size="sm" onClick={handleRevoke} disabled={revoking}
            className="text-destructive hover:text-destructive hover:bg-destructive/10 text-xs">
            {revoking ? <Loader2 className="h-3 w-3 animate-spin" /> : "Revoke"}
          </Button>
        )}
      </td>
    </tr>
  );
}
