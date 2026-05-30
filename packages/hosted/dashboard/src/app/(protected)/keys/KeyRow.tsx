// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// A single row in the API keys table.
import type { ApiKey, Budget } from "@/types";
import Link from "next/link";

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
    <tr className="bg-gray-900 hover:bg-gray-800/50 transition-colors">
      <td className="px-4 py-3 font-medium text-white">{apiKey.label}</td>
      <td className="px-4 py-3">
        <code className="font-mono text-xs text-blue-400 bg-gray-800 px-2 py-1 rounded">
          {apiKey.fuseguard_key_prefix}••••••••••••
        </code>
      </td>
      <td className="px-4 py-3">
        {activeBudgetCount > 0 ? (
          <Link
            href="/budgets"
            className="text-green-400 hover:text-green-300 text-xs underline"
          >
            {activeBudgetCount} budget{activeBudgetCount !== 1 ? "s" : ""}
          </Link>
        ) : (
          <Link
            href="/budgets"
            className="text-gray-500 hover:text-gray-300 text-xs underline"
          >
            None — add one
          </Link>
        )}
      </td>
      <td className="px-4 py-3 text-gray-400 text-xs">
        {formatDate(apiKey.last_used_at)}
      </td>
      <td className="px-4 py-3">
        <span className={apiKey.is_active ? "fg-badge-success" : "fg-badge-danger"}>
          {apiKey.is_active ? "Active" : "Revoked"}
        </span>
      </td>
    </tr>
  );
}
