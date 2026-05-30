// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// Billing page — Free vs Pro ($19/mo) tier display. Lemon Squeezy checkout placeholder.
import type { Metadata } from "next";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { fetchSubscription } from "@/lib/data/queries";

export const metadata: Metadata = { title: "Billing — FuseGuard" };
export const dynamic = "force-dynamic";

// Phase 3: replace with real Lemon Squeezy checkout URL from env
const LEMON_SQUEEZY_CHECKOUT_URL =
  process.env["LEMON_SQUEEZY_CHECKOUT_URL"] ??
  "https://fuseguard.lemonsqueezy.com/checkout/buy/placeholder";

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
  const subscription = await fetchSubscription(supabase);

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
        <h1 className="text-2xl font-bold text-white">Billing</h1>
        <p className="mt-1 text-sm text-gray-400">
          FuseGuard is free for one key. Upgrade to Pro to unlock the full circuit-breaker.
        </p>
      </div>

      {/* Current plan status */}
      {isPro && (
        <div className="rounded-xl border border-green-700 bg-green-900/20 px-5 py-4 flex items-center gap-3">
          <span className="text-xl" aria-hidden="true">✅</span>
          <div>
            <p className="font-semibold text-green-300">You&apos;re on Pro</p>
            {renewsAt && (
              <p className="text-sm text-green-400/80">Renews {renewsAt}</p>
            )}
          </div>
        </div>
      )}

      {/* Pricing cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Free */}
        <div
          className={`fg-card space-y-4 ${!isPro ? "ring-2 ring-gray-600" : ""}`}
          aria-label="Free plan"
        >
          <div>
            <p className="text-sm text-gray-400 uppercase tracking-wider font-medium">Free</p>
            <p className="text-3xl font-bold text-white mt-1">$0</p>
            <p className="text-sm text-gray-500">forever</p>
          </div>

          <ul className="space-y-2" role="list">
            {FREE_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-gray-300">
                <span className="text-green-400 mt-0.5 shrink-0" aria-hidden="true">✓</span>
                {f}
              </li>
            ))}
          </ul>

          {!isPro && (
            <div className="rounded-lg bg-gray-800 px-4 py-2 text-center text-sm text-gray-400">
              Current plan
            </div>
          )}
        </div>

        {/* Pro */}
        <div
          className={`fg-card space-y-4 relative overflow-hidden ${isPro ? "ring-2 ring-brand-500" : "border-brand-500/40"}`}
          aria-label="Pro plan"
        >
          {/* Popular badge */}
          <div
            className="absolute top-4 right-4 text-xs font-bold bg-brand-500 text-white px-2 py-1 rounded-full"
            aria-label="Most popular plan"
          >
            Pro
          </div>

          <div>
            <p className="text-sm text-brand-500 uppercase tracking-wider font-medium">Pro</p>
            <p className="text-3xl font-bold text-white mt-1">$19</p>
            <p className="text-sm text-gray-500">per month</p>
          </div>

          <ul className="space-y-2" role="list">
            {PRO_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm text-gray-300">
                <span className="text-brand-500 mt-0.5 shrink-0" aria-hidden="true">✓</span>
                {f}
              </li>
            ))}
          </ul>

          {isPro ? (
            <div className="rounded-lg bg-brand-500/10 border border-brand-500/30 px-4 py-2 text-center text-sm text-brand-400">
              Active subscription
            </div>
          ) : (
            <a
              href={LEMON_SQUEEZY_CHECKOUT_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full rounded-lg bg-brand-500 hover:bg-brand-600 text-center px-4 py-2.5 text-sm font-semibold text-white transition-colors"
            >
              Upgrade to Pro →
            </a>
          )}
        </div>
      </div>

      {/* Phase 3 note */}
      <div className="rounded-xl border border-gray-800 bg-gray-900/30 px-5 py-4 text-sm text-gray-400">
        <p>
          <strong className="text-gray-300">Note:</strong> Full Lemon Squeezy checkout integration
          (subscription management, customer portal, webhook-driven plan updates) is in Phase 3.
          The Pro button links to checkout — contact{" "}
          <a href="mailto:support@fuseguard.app" className="underline hover:text-white">
            support@fuseguard.app
          </a>{" "}
          if you need manual activation.
        </p>
      </div>

      {/* Loop detection upsell */}
      {!isPro && (
        <div className="rounded-xl border border-yellow-800 bg-yellow-900/10 px-5 py-4 space-y-2">
          <p className="font-semibold text-yellow-300">Loop detection is Pro-only</p>
          <p className="text-sm text-yellow-400/80">
            The $47k agent loop that ran for 11 days — FuseGuard Pro detects and kills loops before
            they cost you a cent. 10+ near-identical requests in 60s → hard block.
          </p>
          <a
            href={LEMON_SQUEEZY_CHECKOUT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-sm font-medium text-yellow-300 underline hover:text-yellow-200"
          >
            Unlock loop detection →
          </a>
        </div>
      )}
    </div>
  );
}
