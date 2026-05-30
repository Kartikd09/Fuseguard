// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// Public landing page. Logged-in users are redirected to the dashboard.
import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Zap, ShieldOff, Check, X, Code2, ArrowRight } from "lucide-react";

export const dynamic = "force-dynamic";
export const runtime = "edge";

const GITHUB_URL = "https://github.com/Kartikd09/Fuseguard";

const WEDGE_ROWS = [
  { label: "Shows you spend", them: true, us: true },
  { label: "Stops the spend", them: false, us: true },
  { label: "Blocks before the call", them: false, us: true },
  { label: "Kills runaway loops", them: false, us: true },
  { label: "One-line integration", them: false, us: true },
];

export default async function LandingPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <main className="relative min-h-screen text-foreground">
      {/* Page-wide faint grid + top glow (behind content, above page bg) */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(130,140,160,0.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(130,140,160,0.18) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          // Grid visible on all edges, gently faded toward the center so it frames content.
          maskImage: "radial-gradient(ellipse 75% 70% at 50% 45%, transparent 35%, black 95%)",
          WebkitMaskImage: "radial-gradient(ellipse 75% 70% at 50% 45%, transparent 35%, black 95%)",
        }}
      >
        <div
          className="absolute left-1/2 -translate-x-1/2"
          style={{
            top: "-140px",
            height: "520px",
            width: "780px",
            borderRadius: "9999px",
            background: "radial-gradient(circle, rgba(232,76,48,0.42), rgba(232,76,48,0.12) 45%, transparent 70%)",
            filter: "blur(70px)",
          }}
        />
      </div>

      <div className="relative z-10">
      {/* Nav */}
      <header className="border-b border-border">
        <div className="mx-auto max-w-5xl px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Zap className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-lg">FuseGuard</span>
          </div>
          <div className="flex items-center gap-3">
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5">
              <Code2 className="h-4 w-4" /> GitHub
            </a>
            <Button asChild size="sm"><Link href="/login">Sign in</Link></Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative mx-auto max-w-3xl px-6 pt-20 pb-16 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground mb-6">
          <ShieldOff className="h-3 w-3 text-primary" /> Enforcement, not observability
        </span>
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
          The circuit breaker for AI agents.
        </h1>
        <p className="mt-5 text-lg text-muted-foreground max-w-2xl mx-auto">
          Set a budget. FuseGuard kills the call <em className="text-foreground not-italic font-medium">before</em> it
          breaks it — not a $47,000 bill later.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg">
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
              <Code2 className="h-4 w-4" /> Self-host free
            </a>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/login">Start hosted — $15/mo <ArrowRight className="h-4 w-4" /></Link>
          </Button>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">
          Open-source · your API key never leaves your infrastructure.
        </p>
      </section>

      {/* The hook */}
      <section className="mx-auto max-w-3xl px-6 py-14">
        <div className="rounded-2xl border border-border bg-muted/30 p-8">
          <p className="text-lg leading-relaxed">
            An AI agent looped for <strong className="text-primary">11 days</strong> and ran up a{" "}
            <strong className="text-primary">$47,000</strong> bill. The team had a dashboard.
            Slack alerts at 50/80/95%. A provider spend cap.{" "}
            <strong className="text-foreground">None of them stopped it.</strong>
          </p>
          <p className="mt-4 text-muted-foreground">
            Alerts fire <em>after</em> the money&apos;s gone. Provider caps reconcile too late.
            FuseGuard refuses the <em>next</em> call, synchronously, before it&apos;s sent.
          </p>
        </div>
      </section>

      {/* Wedge */}
      <section className="mx-auto max-w-3xl px-6 py-14">
        <h2 className="text-2xl font-semibold text-center">They watch. We stop.</h2>
        <div className="mt-8 overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th className="text-left px-5 py-3 font-medium"></th>
                <th className="px-5 py-3 font-medium text-muted-foreground text-center">LangSmith / Helicone / Langfuse</th>
                <th className="px-5 py-3 font-semibold text-primary text-center">FuseGuard</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {WEDGE_ROWS.map((r) => (
                <tr key={r.label}>
                  <td className="px-5 py-3">{r.label}</td>
                  <td className="px-5 py-3 text-center">
                    {r.them ? <Check className="h-4 w-4 text-emerald-500 inline" /> : <X className="h-4 w-4 text-muted-foreground inline" />}
                  </td>
                  <td className="px-5 py-3 text-center">
                    {r.us ? <Check className="h-4 w-4 text-primary inline" /> : <X className="h-4 w-4 text-muted-foreground inline" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-3xl px-6 py-14">
        <h2 className="text-2xl font-semibold text-center">One line. No SDK rewrite.</h2>
        <div className="mt-8 rounded-xl border border-border bg-muted/30 overflow-x-auto">
          <pre className="p-5 text-sm leading-relaxed"><code>{`from anthropic import Anthropic

client = Anthropic(
    api_key="fg_live_...",                  # your FuseGuard key
    base_url="https://fuseguard.app/v1",    # point at FuseGuard
)
# Over budget? You get a 402 — not a $47k bill.`}</code></pre>
        </div>
        <div className="mt-6 grid sm:grid-cols-3 gap-4 text-sm">
          <div className="flex items-start gap-2">
            <span className="fg-step">1</span>
            <p className="text-muted-foreground">Point your <code className="fg-code">base_url</code> at FuseGuard.</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="fg-step">2</span>
            <p className="text-muted-foreground">Set a budget — per key or session, $ or tokens.</p>
          </div>
          <div className="flex items-start gap-2">
            <span className="fg-step">3</span>
            <p className="text-muted-foreground">FuseGuard hard-blocks before a breach. Loops killed.</p>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="mx-auto max-w-3xl px-6 py-14">
        <h2 className="text-2xl font-semibold text-center">Pricing</h2>
        <div className="mt-8 grid sm:grid-cols-2 gap-4">
          <div className="rounded-xl border border-border p-6">
            <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Free / Self-host</p>
            <p className="mt-2 text-3xl font-bold">$0</p>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              <li className="flex gap-2"><Check className="h-4 w-4 text-emerald-500 shrink-0" /> 1 key, budget enforcement, hard kill</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-emerald-500 shrink-0" /> Self-host the full engine (MIT)</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-emerald-500 shrink-0" /> Community support</li>
            </ul>
          </div>
          <div className="rounded-xl border-2 border-primary/40 p-6 relative">
            <span className="absolute top-4 right-4 text-xs bg-primary/15 text-primary px-2 py-0.5 rounded-full font-medium">Popular</span>
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">Pro — $15/mo</p>
            <p className="mt-2 text-3xl font-bold">$15</p>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0" /> Unlimited keys + sessions</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0" /> Loop detection, team, alerts</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0" /> Managed dashboard, no infra</li>
            </ul>
            <Button asChild className="w-full mt-5"><Link href="/login">Get started</Link></Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border mt-10">
        <div className="mx-auto max-w-5xl px-6 py-8 flex flex-wrap items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <ShieldOff className="h-4 w-4" /> FuseGuard — enforcement, not observability.
          </div>
          <div className="flex items-center gap-4">
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="hover:text-foreground">GitHub</a>
            <Link href="/login" className="hover:text-foreground">Sign in</Link>
          </div>
        </div>
      </footer>
      </div>
    </main>
  );
}
