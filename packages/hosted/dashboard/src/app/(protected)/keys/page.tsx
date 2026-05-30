// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// API Keys page — list (masked), create, per-key budget summary.
import type { Metadata } from "next";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { fetchApiKeys, fetchBudgets } from "@/lib/data/queries";
import EmptyState from "@/components/ui/EmptyState";
import CreateKeyButton from "./CreateKeyButton";
import KeyRow from "./KeyRow";

export const metadata: Metadata = { title: "API Keys — FuseGuard" };
export const dynamic = "force-dynamic";

export default async function KeysPage() {
  const supabase = await createServerSupabaseClient();
  const [keys, budgets] = await Promise.all([
    fetchApiKeys(supabase),
    fetchBudgets(supabase),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">API Keys</h1>
          <p className="mt-1 text-sm text-gray-400">
            Each key proxies calls to Anthropic with your encrypted API key.
          </p>
        </div>
        <CreateKeyButton keyCount={keys.length} />
      </div>

      {keys.length === 0 ? (
        <EmptyState
          icon="🔑"
          title="No keys yet"
          description="Create a key and FuseGuard will store your Anthropic API key encrypted. You'll see a one-time reveal — copy it immediately."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-900/50">
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Label</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Key prefix</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Budget</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Last used</th>
                <th className="text-left px-4 py-3 text-gray-400 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {keys.map((key) => {
                const keyBudgets = budgets.filter(
                  (b) => b.scope === "key" && b.scope_ref === key.id
                );
                return (
                  <KeyRow key={key.id} apiKey={key} budgets={keyBudgets} />
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-xl border border-gray-800 bg-gray-900/30 px-5 py-4 text-sm text-gray-400 space-y-1">
        <p>
          <strong className="text-gray-300">Free tier:</strong> 1 API key.{" "}
          <a href="/billing" className="underline hover:text-white">Upgrade to Pro</a> for unlimited keys.
        </p>
        <p>
          Keys are shown once at creation — we store only a hash. If you lose it, revoke and create a new one.
        </p>
      </div>
    </div>
  );
}
