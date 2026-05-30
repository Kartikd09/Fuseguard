// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// Billing page — Free vs Pro ($19/mo) tier display. Lemon Squeezy checkout placeholder.
import type { Metadata } from "next";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { fetchSubscription } from "@/lib/data/queries";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Shield, Zap, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Billing — FuseGuard" };
export const dynamic = "force-dynamic";

const LEMON_SQUEEZY_CHECKOUT_URL =
  process.env["LEMON_SQUEEZY_CHECKOUT_URL"] ??
  "https://fuseguard.lemonsqueezy.com/checkout/buy/ba58cb88-b318-471d-9ab6-6fd9d801912b";

const FREE_FEATURES = [
  "1 API key",
  "Per-key hard-kill budget",
  "Basic dashboard",
  "Open-source proxy core (MIT)",
];

const PRO_FEATURES = [
  "Unlimited API keys",
  "Per-key + per-session budgets",
  "Loop detection & kill-switch",
  "Email + webhook alerts",
  "Team members",
  "Full dashboard (top spenders, drill-down)",
  "Priority support",
];

export default async function BillingPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  const subscription = await fetchSubscription(supabase);

  // Pass org_id as checkout custom data so the webhook can attribute the subscription.
  const { data: membership } = await supabase
    .from("memberships").select("org_id").eq("user_id", user?.id ?? "").limit(1).maybeSingle();
  const orgId = (membership as { org_id: string } | null)?.org_id ?? "";
  const checkoutUrl = orgId
    ? `${LEMON_SQUEEZY_CHECKOUT_URL}?checkout[custom][org_id]=${encodeURIComponent(orgId)}`
    : LEMON_SQUEEZY_CHECKOUT_URL;

  const isPro = subscription?.status === "active";
  const renewsAt = subscription?.renews_at
    ? new Intl.DateTimeFormat("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      }).format(new Date(subscription.renews_at))
    : null;

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Billing</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          FuseGuard is free for one key. Upgrade to Pro to unlock the full circuit-breaker.
        </p>
      </div>

      {/* Current plan status */}
      {isPro && (
        <div className="rounded-xl border border-emerald-700/50 bg-emerald-950/30 dark:bg-emerald-900/10 px-5 py-4 flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20">
            <CheckCircle2 className="h-5 w-5 text-emerald-400" aria-hidden="true" />
          </div>
          <div>
            <p className="font-semibold text-emerald-300">You&apos;re on Pro</p>
            {renewsAt && (
              <p className="text-sm text-emerald-400/70">Renews {renewsAt}</p>
            )}
          </div>
        </div>
      )}

      {/* Pricing cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Free */}
        <Card
          className={cn(!isPro && "ring-2 ring-border")}
          aria-label="Free plan"
        >
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Free
              </CardTitle>
              {!isPro && <Badge variant="secondary">Current</Badge>}
            </div>
            <div className="pt-1">
              <span className="text-3xl font-bold text-foreground">$0</span>
              <span className="text-sm text-muted-foreground ml-1">/ month</span>
            </div>
            <CardDescription>forever</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="space-y-2" role="list">
              {FREE_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Check className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" aria-hidden="true" />
                  {f}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {/* Pro */}
        <Card
          className={cn(
            "relative overflow-hidden",
            isPro ? "ring-2 ring-primary" : "border-primary/30"
          )}
          aria-label="Pro plan"
        >
          <div className="absolute top-4 right-4">
            <Badge variant="default" className="text-xs">
              <Zap className="h-3 w-3 mr-1" />
              Popular
            </Badge>
          </div>

          <CardHeader>
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-primary">
              Pro
            </CardTitle>
            <div className="pt-1">
              <span className="text-3xl font-bold text-foreground">$15</span>
              <span className="text-sm text-muted-foreground ml-1">/ month</span>
            </div>
            <CardDescription>billed monthly, cancel anytime</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-2" role="list">
              {PRO_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" aria-hidden="true" />
                  {f}
                </li>
              ))}
            </ul>

            {isPro ? (
              <div className="rounded-lg bg-primary/10 border border-primary/20 px-4 py-2.5 text-center text-sm text-primary">
                Active subscription
              </div>
            ) : (
              <Button asChild className="w-full">
                <a
                  href={checkoutUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Upgrade to Pro
                </a>
              </Button>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Phase 3 note */}
      <Card>
        <CardContent className="py-4">
          <p className="text-sm text-muted-foreground">
            <strong className="text-foreground">Note:</strong> Full Lemon Squeezy checkout
            integration is in Phase 3. The Pro button links to checkout — contact{" "}
            <a
              href="mailto:support@fuseguard.app"
              className="underline hover:text-foreground transition-colors"
            >
              support@fuseguard.app
            </a>{" "}
            if you need manual activation.
          </p>
        </CardContent>
      </Card>

      {/* Loop detection upsell */}
      {!isPro && (
        <Card className="border-yellow-700/50">
          <CardContent className="py-5 space-y-3">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-yellow-500/20 shrink-0">
                <Shield className="h-4 w-4 text-yellow-400" />
              </div>
              <div className="space-y-1">
                <p className="font-semibold text-yellow-300">Loop detection is Pro-only</p>
                <p className="text-sm text-muted-foreground">
                  The $47k agent loop that ran for 11 days — FuseGuard Pro detects and kills loops
                  before they cost you a cent. 10+ near-identical requests in 60s → hard block.
                </p>
              </div>
            </div>
            <Button variant="outline" asChild className="border-yellow-700/50 text-yellow-300 hover:text-yellow-200">
              <a href={checkoutUrl} target="_blank" rel="noopener noreferrer">
                Unlock loop detection →
              </a>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
