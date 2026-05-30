// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// API Keys page — list (masked), create, per-key budget summary.
import type { Metadata } from "next";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { fetchApiKeys, fetchBudgets, fetchOrgPlan, resolveActiveOrgId } from "@/lib/data/queries";
import EmptyState from "@/components/ui/EmptyState";
import CreateKeyButton from "./CreateKeyButton";
import KeyRow from "./KeyRow";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { KeyRound, Info } from "lucide-react";

export const metadata: Metadata = { title: "API Keys — FuseGuard" };
export const dynamic = "force-dynamic";
export const runtime = "edge";

export default async function KeysPage() {
  const supabase = await createServerSupabaseClient();
  const orgId = await resolveActiveOrgId(supabase);
  if (!orgId) return <div className="p-8 text-muted-foreground">No organization found. Please sign out and sign in again.</div>;
  const [keys, budgets, plan] = await Promise.all([
    fetchApiKeys(supabase, orgId),
    fetchBudgets(supabase, orgId),
    fetchOrgPlan(supabase, orgId),
  ]);
  const maxKeys = plan?.max_keys ?? 1; // -1 = unlimited

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">API Keys</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Each key proxies calls to Anthropic with your encrypted API key.
          </p>
        </div>
        <CreateKeyButton keyCount={keys.length} maxKeys={maxKeys} />
      </div>

      {keys.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={<KeyRound className="h-6 w-6 text-muted-foreground" />}
              title="No keys yet"
              description="Create a key and FuseGuard will store your Anthropic API key encrypted. You'll see a one-time reveal — copy it immediately."
            />
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Label
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Key prefix
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Budget
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Last used
                  </th>
                  <th className="text-left px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Status
                  </th>
                  <th className="text-right px-6 py-3 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {keys.map((key) => {
                  const keyBudgets = budgets.filter(
                    (b) => b.scope === "key" && b.scope_ref === key.id
                  );
                  return <KeyRow key={key.id} apiKey={key} budgets={keyBudgets} />;
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card>
        <CardContent className="py-4">
          <div className="flex items-start gap-3 text-sm text-muted-foreground">
            <Info className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
            <div className="space-y-1">
              <p>
                <strong className="text-foreground">Free tier:</strong> 1 API key.{" "}
                <Button variant="link" asChild className="h-auto p-0 text-sm">
                  <Link href="/billing">Upgrade to Pro</Link>
                </Button>{" "}
                for unlimited keys.
              </p>
              <p>
                Keys are shown once at creation — we store only a hash. If you lose it, revoke and
                create a new one.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
