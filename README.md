# FuseGuard ⚡🛡️

**The circuit breaker for AI agents.** Set a budget. When an agent tries to blow past it, FuseGuard kills the call — *before* the $47,000 bill, not after.

> Observability tools (LangSmith, Helicone, Langfuse) **show** you what you spent.
> FuseGuard **stops** you from spending it. Enforcement, not alerts.

---

## The Problem

AI agents loop. A documented LangChain agent loop ran for 11 days and cost **$47,000**.
The team had a dashboard. They had Slack alerts at 50/80/95%. They had a provider-level
spend cap. **None of them stopped the loop** — because alerts fire *after* spend, and
provider caps trigger too late.

- AI agents market: **$10.9B in 2026, growing 44–46% CAGR**
- **80–85% of orgs miss AI cost forecasts by >25%**
- Gartner: **40%+ of agentic AI projects will be cancelled by 2027** — #1 reason: runaway cost

## What FuseGuard Does

A drop-in proxy between your app and the LLM provider (Anthropic Claude first):

1. **Per-key & per-session budgets** — set a `$` or token ceiling
2. **Hard kill** — block the next call *before* it breaches the budget (clean 402-style error)
3. **Loop detection** — N near-identical calls within T seconds → killed and flagged
4. **Live dashboard** — spend, blocked calls, top spenders, per-key view

Change one line — your Anthropic `base_url` — and you're protected.

```python
from anthropic import Anthropic

client = Anthropic(
    api_key="fg_...",                     # ← your FuseGuard key (real Anthropic key lives in FuseGuard)
    base_url="http://localhost:8787/v1",  # ← point at FuseGuard
)
# Over budget? You get a 402 instead of a $47k bill.
```

More: [`examples/`](./examples) (raw SDK · CrewAI · curl).

## Run it yourself (your key never leaves your infra)

FuseGuard's proxy is MIT-licensed. **Self-host it on your own Cloudflare** — the code that
holds your API key is open and runs where you control it. See
**[Self-Hosting guide](./docs/SELF_HOSTING.md)**.

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Kartikd09/Fuseguard)

## Open-Core

- **Free & open source (MIT):** the proxy core + self-host (full enforcement engine)
- **Paid hosted ($19/mo):** managed dashboard, unlimited keys, team, alerts, loop detection

## Status

🚧 **Pre-MVP — in active development.** Building in public.

## Tech

Cloudflare Workers + Durable Objects · Supabase · Next.js · Lemon Squeezy

---

*Built solo, with AI. Follow the build.*
