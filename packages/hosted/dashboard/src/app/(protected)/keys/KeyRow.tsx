// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// A single row in the API keys table.
import type { ApiKey, Budget } from "@/types";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";

interface KeyRowProps {
  apiKey: ApiKey;
  budgets: Budget[];
}

function formatDate(iso: string | null): string {
  if (!iso) return "Never";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(iso));
}

export default function KeyRow({ apiKey, budgets }: KeyRowProps) {
  const activeBudgetCount = budgets.filter((b) => b.is_active).length;

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
          <Link
            href="/budgets"
            className="text-xs text-emerald-400 hover:text-emerald-300 underline underline-offset-2 transition-colors"
          >
            {activeBudgetCount} budget{activeBudgetCount !== 1 ? "s" : ""}
          </Link>
        ) : (
          <Link
            href="/budgets"
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
          >
            None — add one
          </Link>
        )}
      </td>
      <td className="px-6 py-4 text-muted-foreground text-xs">
        {formatDate(apiKey.last_used_at)}
      </td>
      <td className="px-6 py-4">
        <Badge variant={apiKey.is_active ? "success" : "destructive"}>
          {apiKey.is_active ? "Active" : "Revoked"}
        </Badge>
      </td>
    </tr>
  );
}
