// PROPRIETARY (NOT MIT) — see packages/hosted/NOTICE.
// Public landing page. Logged-in users are redirected to the dashboard.
import { redirect } from "next/navigation";
import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { ShieldOff, Check, X, Code2, ArrowRight } from "lucide-react";
import FluidCursor from "@/components/landing/FluidCursor";
import Reveal from "@/components/landing/Reveal";
import Logo from "@/components/landing/Logo";

export const dynamic = "force-dynamic";

const GITHUB_URL = "https://github.com/Kartikd09/Fuseguard";
// Public proxy endpoint shown in the copy-paste sample. Single prod deploy — the
// live URL is the intended content (no separate staging dashboard deploy).
const PROXY_URL = "https://fuseguard-proxy.kartikds009.workers.dev";

const STATS = [
  { value: "11 days", label: "loop ran unstopped" },
  { value: "$47,000", label: "burned before anyone saw" },
  { value: "0", label: "calls blocked in time" },
];

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
      {/* WebGL fluid cursor trail (desktop only, respects reduced-motion) — behind all content */}
      <FluidCursor />
      {/* Page-wide faint grid + top glow (behind content, above page bg) */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(130,140,160,0.18) 1px, transparent 1px), linear-gradient(to bottom, rgba(130,140,160,0.18) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
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
          <div className="flex items-center gap-2 text-primary">
            <Logo size={28} decorative />
            <span className="font-semibold text-lg text-foreground">FuseGuard</span>
          </div>
          <div className="flex items-center gap-3">
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5">
              <Code2 className="h-4 w-4" /> GitHub
            </a>
            <Button asChild size="sm" variant="ghost"><Link href="/login">Sign in</Link></Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative mx-auto max-w-3xl px-6 pt-20 pb-14 text-center">
        <span className="fg-hero-item fg-hero-1 inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground mb-6">
          <ShieldOff className="h-3 w-3 text-primary" /> Enforcement, not observability
        </span>
        <h1 className="fg-hero-item fg-hero-2 text-4xl sm:text-5xl font-bold tracking-tight">
          The circuit breaker for AI agents.
        </h1>
        <p className="fg-hero-item fg-hero-3 mt-5 text-lg text-muted-foreground max-w-2xl mx-auto">
          A spend firewall for your LLM calls. Set a budget — FuseGuard kills the call{" "}
          <em className="text-foreground not-italic font-medium">before</em> it breaks it,
          not a $47,000 bill later.
        </p>
        <div className="fg-hero-item fg-hero-4 mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg">
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
              <Code2 className="h-4 w-4" /> Self-host free
            </a>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/login">Try the hosted beta <ArrowRight className="h-4 w-4" /></Link>
          </Button>
        </div>
        <p className="fg-hero-item fg-hero-5 mt-4 text-xs text-muted-foreground">
          Free during beta · no card · your API key never leaves your infrastructure.
        </p>

        {/* Stat tiles */}
        <dl className="fg-hero-item fg-hero-6 mt-12 grid grid-cols-3 gap-3 sm:gap-4">
          {STATS.map((s) => (
            <div key={s.label} className="rounded-xl border border-border bg-muted/20 px-3 py-4 text-center">
              <dt className="font-mono text-xl sm:text-2xl font-bold text-primary tabular-nums">{s.value}</dt>
              <dd className="mt-1 text-[11px] sm:text-xs text-muted-foreground leading-tight">{s.label}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* The hook */}
      <Reveal>
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
      </Reveal>

      {/* How it works — terminal + 402 card */}
      <Reveal>
      <section className="mx-auto max-w-3xl px-6 py-14">
        <p className="fg-eyebrow text-primary text-center">Integration</p>
        <h2 className="mt-2 text-2xl font-semibold text-center">One line. No SDK rewrite.</h2>

        <div className="mt-8 grid gap-4 md:grid-cols-[1.3fr_1fr]">
          {/* Terminal-chrome code block */}
          <div className="overflow-hidden rounded-xl border border-border bg-[#0c0f17]">
            {/* macOS traffic-light colors — intentional terminal chrome, not design tokens */}
            <div aria-hidden className="flex items-center gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
              <span className="h-3 w-3 rounded-full bg-[#ff5f56]" />
              <span className="h-3 w-3 rounded-full bg-[#ffbd2e]" />
              <span className="h-3 w-3 rounded-full bg-[#27c93f]" />
              <span className="ml-2 font-mono text-xs text-muted-foreground">quickstart.py</span>
            </div>
            <pre className="overflow-x-auto p-5 text-sm leading-relaxed"><code>{`from anthropic import Anthropic

client = Anthropic(
    api_key="fg_live_...",   # your FuseGuard key
    base_url="${PROXY_URL}",
)
# Over budget? A clean 402 — not a $47k bill.`}</code></pre>
          </div>

          {/* Live 402 block card */}
          <div className="rounded-xl border border-destructive/40 bg-destructive/5 overflow-hidden">
            <div className="flex items-center gap-2 border-b border-destructive/30 px-4 py-2.5">
              <span aria-hidden className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-destructive/60" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-destructive" />
              </span>
              <span className="font-mono text-xs font-semibold text-destructive">402 budget_exceeded</span>
            </div>
            <dl className="p-4 font-mono text-xs space-y-2">
              {[
                ["scope", "key:fg_live_…"],
                ["limit", "$10.00"],
                ["spent", "$9.94"],
                ["decision", "blocked"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{k}</dt>
                  <dd className={k === "decision" ? "text-destructive font-semibold" : "text-foreground/90"}>{v}</dd>
                </div>
              ))}
            </dl>
          </div>
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

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Today: Anthropic · per-key &amp; per-session budgets. Next: OpenAI-compatible + per-tenant limits.
        </p>
      </section>
      </Reveal>

      {/* Wedge — spec grid */}
      <Reveal>
      <section className="mx-auto max-w-3xl px-6 py-14">
        <p className="fg-eyebrow text-primary text-center">Why FuseGuard</p>
        <h2 className="mt-2 text-2xl font-semibold text-center">They watch. We stop.</h2>
        <div className="mt-8 overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <th scope="col" className="text-left px-5 py-3 font-medium"><span className="sr-only">Capability</span></th>
                <th scope="col" className="px-5 py-3 font-mono text-xs font-medium text-muted-foreground text-center">LangSmith / Helicone / Langfuse</th>
                <th scope="col" className="px-5 py-3 font-mono text-xs font-semibold text-primary text-center">FuseGuard</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {WEDGE_ROWS.map((r) => (
                <tr key={r.label} className="transition-colors hover:bg-muted/20">
                  <th scope="row" className="px-5 py-3 font-mono text-xs font-normal text-left text-foreground/90">{r.label}</th>
                  <td className="px-5 py-3 text-center">
                    {r.them
                      ? <Check className="h-4 w-4 text-emerald-500 inline" aria-label="Yes" />
                      : <X className="h-4 w-4 text-muted-foreground inline" aria-label="No" />}
                  </td>
                  <td className="px-5 py-3 text-center">
                    {r.us
                      ? <Check className="h-4 w-4 text-primary inline" aria-label="Yes" />
                      : <X className="h-4 w-4 text-muted-foreground inline" aria-label="No" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      </Reveal>

      {/* Pricing */}
      <Reveal>
      <section className="mx-auto max-w-3xl px-6 py-14">
        <p className="fg-eyebrow text-primary text-center">Pricing</p>
        <h2 className="mt-2 text-2xl font-semibold text-center">Free while we build with you.</h2>
        <div className="mt-8 grid sm:grid-cols-2 gap-4">
          <div className="rounded-xl border border-border p-6">
            <p className="fg-eyebrow text-muted-foreground">Free / Self-host</p>
            <p className="mt-2 text-3xl font-bold font-mono">$0</p>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              <li className="flex gap-2"><Check className="h-4 w-4 text-emerald-500 shrink-0" /> 1 key, budget enforcement, hard kill</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-emerald-500 shrink-0" /> Self-host the full engine (MIT)</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-emerald-500 shrink-0" /> Community support</li>
            </ul>
          </div>
          <div className="rounded-xl border-2 border-primary/40 p-6 relative">
            <span className="absolute top-4 right-4 text-xs bg-primary/15 text-primary px-2 py-0.5 rounded-full font-medium">Beta</span>
            <p className="fg-eyebrow text-primary">Pro · managed beta</p>
            <p className="mt-2 text-3xl font-bold font-mono">Free<span className="text-base font-normal text-muted-foreground"> for now</span></p>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0" /> Unlimited keys + sessions</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0" /> Loop detection, team, alerts</li>
              <li className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0" /> Managed dashboard, no infra</li>
            </ul>
            <Button asChild className="w-full mt-5"><Link href="/login">Join the beta</Link></Button>
          </div>
        </div>
        <p className="mt-5 text-center text-xs text-muted-foreground">
          Pricing finalized with our first users — that&apos;s what the beta&apos;s for.
        </p>
      </section>
      </Reveal>

      {/* Footer */}
      <footer className="border-t border-border mt-10">
        <div className="mx-auto max-w-5xl px-6 py-8 flex flex-wrap items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2 text-primary">
            <Logo size={18} decorative /> <span className="text-muted-foreground">FuseGuard — enforcement, not observability.</span>
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
