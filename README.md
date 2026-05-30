# FuseGuard

**The circuit breaker for AI agents.** Set a budget. When an agent tries to blow past it, FuseGuard kills the call — *before* the $47,000 bill, not after.

> Observability tools (LangSmith, Helicone, Langfuse) **show** you what you spent.
> FuseGuard **stops** you from spending it. Enforcement, not alerts.

---

## The Problem

AI agents loop. A documented LangChain agent loop ran for 11 days and cost **$47,000**.
The team had a dashboard, Slack alerts at 50/80/95%, and a provider-level spend cap.
**None of them stopped the loop** — alerts fire *after* spend, provider caps trigger too late.

- AI agents market: **$10.9B in 2026, growing 44–46% CAGR**
- **80–85% of orgs miss AI cost forecasts by >25%**
- Gartner: **40%+ of agentic AI projects cancelled by 2027** — #1 reason: runaway cost

## What FuseGuard Does

Drop-in proxy between your app and Anthropic. Change one line:

```python
from anthropic import Anthropic

client = Anthropic(
    api_key="fg_live_...",                              # FuseGuard key
    base_url="https://fuseguard-proxy.workers.dev",    # FuseGuard proxy
)
# Over budget? Clean 402 error instead of a $47k bill.
```

1. **Per-key & per-session budgets** — $ or token ceiling, daily/rolling/total windows
2. **Hard pre-flight kill** — blocks the call *before* sending to Anthropic (402 response)
3. **Loop detection** — N near-identical calls within T seconds → killed and flagged (Pro)
4. **Live dashboard** — spend, blocked calls, top spenders, per-key breakdown, 24h/7d/30d views

## Pricing

| | Free | Pro — $19/mo |
|---|---|---|
| API keys | 1 | Unlimited |
| Hard-kill budgets | Per key | Per key + per session |
| Loop detection | — | ✅ |
| Alerts | — | ✅ |
| Team members | — | ✅ |
| Dashboard | Basic | Full |
| Self-host (MIT) | ✅ | ✅ |

## Status

**Phase 2 complete.** Working proxy + dashboard + auth. Phase 3 (billing) in progress.

- ✅ Phase 0 — Scaffold (monorepo, CI, branch protection)
- ✅ Phase 1 — Proxy core (136 tests: budgets, loop detection, streaming, concurrency)
- ✅ Phase 2 — Dashboard (auth, API keys, budgets, spend chart, blocks)
- 🚧 Phase 3 — Billing (Lemon Squeezy)
- ⬜ Phase 4 — Harden / Security
- ⬜ Phase 5 — Launch

---

## Running Locally

### Prerequisites

- Node.js 20+
- A [Supabase](https://supabase.com) project (free tier works)
- A [Cloudflare](https://cloudflare.com) account (free tier works)
- An Anthropic API key (for proxied calls)

### 1. Clone and install

```bash
git clone https://github.com/Kartikd09/Fuseguard.git
cd Fuseguard
npm install
```

### 2. Set up Supabase

Create a new Supabase project, then push the schema:

```bash
npm install -g supabase
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
```

This creates all tables (orgs, api_keys, budgets, usage_events, blocks, subscriptions) with RLS policies.

### 3. Configure the dashboard

```bash
cd packages/hosted/dashboard
cp .env.example .env.local
```

Edit `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
FG_MASTER_KEY=    # generate: openssl rand -base64 32
```

Get your keys from Supabase dashboard → Settings → API.

### 4. Run the dashboard

```bash
# From packages/hosted/dashboard
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Sign up — your org is auto-provisioned.

### 5. Configure the proxy Worker

```bash
cd packages/core
cp wrangler.example.toml wrangler.toml   # if exists, else edit wrangler.toml directly
```

For local dev, create `.dev.vars` in `packages/core`:

```env
FG_MASTER_KEY=same_value_as_dashboard
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
FAILURE_MODE=closed
```

Run the proxy locally:

```bash
# From packages/core
npx wrangler dev
# Proxy runs at http://localhost:8787
```

### 6. Test the full flow

1. In the dashboard: **API Keys → Create Key** — paste your Anthropic API key
2. In the dashboard: **Budgets → Add Budget** — set a $10 daily limit
3. Copy your FuseGuard key (`fg_live_...`)
4. Make a proxied call:

```bash
curl -X POST http://localhost:8787/v1/messages \
  -H "x-api-key: fg_live_YOUR_KEY" \
  -H "content-type: application/json" \
  -H "anthropic-version: 2023-06-01" \
  -d '{"model":"claude-haiku-4-5-20251001","max_tokens":50,"messages":[{"role":"user","content":"Hello"}]}'
```

5. Check the dashboard — spend and any blocks appear within 2s.

### Running tests

```bash
# From repo root — runs all 136 core tests
npm test

# Dashboard typecheck
cd packages/hosted/dashboard && npx tsc --noEmit
```

### Deploying to Cloudflare (staging)

```bash
cd packages/core

# Deploy
CLOUDFLARE_API_TOKEN=your_token npx wrangler deploy --env staging

# Set secrets (run once per env)
echo "your_value" | CLOUDFLARE_API_TOKEN=your_token npx wrangler secret put FG_MASTER_KEY --env staging
echo "your_value" | CLOUDFLARE_API_TOKEN=your_token npx wrangler secret put SUPABASE_URL --env staging
echo "your_value" | CLOUDFLARE_API_TOKEN=your_token npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY --env staging
```

---

## Architecture

```
Client (agent/SDK)
  │  x-api-key: fg_live_...
  ▼
Cloudflare Worker (proxy)
  │  1. Auth: hash FG key → Supabase lookup → AES-256-GCM decrypt Anthropic key
  │  2. Estimate: worst-case cost (input + max_tokens × output price)
  │  3. Reserve: Durable Object (atomic per-key counter)
  │  4. Block (402) or Forward to api.anthropic.com
  │  5. Reconcile: actual cost → release unused reservation
  ▼
Supabase (usage_events, blocks)  ←→  Next.js Dashboard (localhost:3000 / CF Pages)
```

Full details: [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)

## Open-Core

- **`packages/core/`** — MIT. The full proxy engine (budget DO, loop detection, crypto, pricing). Self-host this on your own Cloudflare.
- **`packages/hosted/`** — Proprietary. The managed dashboard, billing, team features.

## Tech Stack

Cloudflare Workers + Durable Objects · Supabase (Postgres + Auth) · Next.js 15 · Tailwind · Lemon Squeezy · TypeScript

---

*Building in public. Follow along.*
