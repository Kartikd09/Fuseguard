# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.
**Read this first on every new session before touching any code.**

## Project: FuseGuard

Circuit breaker for AI agents. Drop-in proxy between app and Anthropic API that enforces
token/$ budgets at runtime — blocks calls *before* a breach, kills runaway loops.
Open-core: MIT proxy + paid hosted dashboard ($15/mo).

- PRD: `docs/PRD.md` | Architecture: `docs/ARCHITECTURE.md` | Roadmap: `docs/ROADMAP.md`
- Architect Notebook (Notion): https://www.notion.so/370ccc9d6d8081edb0fbc41c7d8a5a83

## Current State (last updated: 2026-05-31)

| Phase | Status | Notes |
|-------|--------|-------|
| 0 — Scaffold | ✅ Done | Monorepo, CI, branch protection |
| 1 — Proxy core | ✅ Done | 136 tests, budget DO, loop detection, streaming |
| 2 — Dashboard | ✅ Done | Auth, keys, budgets, spend chart, RLS, Worker wired |
| 3 — Billing | ✅ Done | LS webhook, checkout, free tier trigger |
| 4 — Harden | ⬜ Next | Security pass, latency NFR, DO cold-start |
| 5 — Launch | ⬜ | CF Pages deploy, landing page, README quickstart |

**Active branch:** `feat/phase3-billing` → PR #14 open
**Working dir:** `/home/kartik/Kartik/Claude-projects/fuseguard-dashboard`

## Infrastructure

| Service | Details |
|---------|---------|
| Supabase | Project `omywdgbasfisgftktxij` (Mumbai) |
| CF Worker staging | `fuseguard-proxy-staging.kartikds009.workers.dev` |
| Dashboard (local) | `http://localhost:3000` — run `npm run dev` in `packages/hosted/dashboard` |
| Lemon Squeezy | Test mode, store `fuseguard`, $15/mo Pro plan |
| GitHub | `github.com/Kartikd09/Fuseguard` |

## Repo Structure

```
packages/
  core/               # MIT — CF Worker proxy (budget DO, loop detection, crypto, pricing)
    src/index.ts      # Worker entry — Supabase key lookup, webhook handler, event emit
    src/proxy/        # Proxy handler, forward, SSRF allowlist
    src/budget-do.ts  # Durable Object — reserve/reconcile, atomic counters
    wrangler.toml     # CF Worker config (staging + production envs)
  hosted/
    dashboard/        # PROPRIETARY — Next.js 15 dashboard (CF Pages)
      src/app/        # Pages: dashboard, keys, budgets, billing, setup, login
      src/app/api/    # API routes: /keys, /keys/[id], /budgets, /budgets/[id]
      src/lib/        # Supabase helpers, crypto, spend aggregation
supabase/
  migrations/         # All schema migrations (apply with `supabase db push`)
```

## Key Facts

- **Budget enforcement:** Worker reserves worst-case cost (input + max_tokens × price) pre-flight,
  reconciles actual cost after response. Durable Object serializes concurrent access — no races.
- **Key encryption:** AES-256-GCM. `FG_MASTER_KEY` (wrangler secret) encrypts customer Anthropic keys.
  Plaintext never stored, never logged. `hexToBase64()` handles Supabase bytea `\xHEX` format.
- **Webhook:** `POST /webhook/lemon-squeezy` — HMAC-SHA256 verify, org_id DB-validated,
  event allowlist (4 events only), idempotent upsert on `org_id`.
- **Free tier:** 1 key max enforced by DB trigger `check_api_key_limit()` (TOCTOU-safe).
- **RLS:** All tables org-scoped. `anthropic_key_ciphertext/iv` column-revoked from `authenticated`.

## Golden Rules (NON-NEGOTIABLE)

1. **Never commit to `main` or `develop` directly.** Feature branches + PR only.
2. **Never commit secrets.** Use `.env.example`. gitleaks blocks you.
3. **TDD for proxy core.** Write failing test first. 136 tests must stay green.
4. **Run Opus 4.8 code-reviewer + security-reviewer after every feature.** Not optional.
5. **Every PR reviewed** before merge. Fix CRITICAL/HIGH before merging.

## Workflow

```bash
# Start dev server (dashboard)
cd packages/hosted/dashboard && npm run dev

# Run all tests
npm test   # from repo root

# Typecheck
cd packages/core && npx tsc --noEmit
cd packages/hosted/dashboard && npx tsc --noEmit

# Deploy Worker to staging
cd packages/core && CLOUDFLARE_API_TOKEN=... npx wrangler deploy --env staging

# Push DB migrations
supabase db push --yes

# Create PR
gh pr create --base develop --head feat/your-branch
```

## Secrets (never commit — for reference only)

- `FG_MASTER_KEY` — 32-byte base64, encrypts Anthropic keys at rest
- `SUPABASE_URL` — `https://omywdgbasfisgftktxij.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY` — Worker only, never in dashboard bundle
- `LEMON_SQUEEZY_WEBHOOK_SECRET` — 40-char hex, HMAC signing
- `CLOUDFLARE_API_TOKEN` — CF deploy token

## Architecture Diagram

```
[Client] → x-api-key: fg_live_...
              ↓
[CF Worker: fuseguard-proxy-staging.workers.dev]
  1. Hash FG key → Supabase lookup → AES-GCM decrypt Anthropic key
  2. Estimate worst-case cost
  3. Reserve in Budget Durable Object (atomic)
  4. Block (402) or Forward to api.anthropic.com
  5. Reconcile actual cost → release unused reservation
  6. Emit usage_events / blocks → Supabase (async)
              ↓
[api.anthropic.com]

[Next.js Dashboard: localhost:3000]
  ← reads Supabase (RLS-scoped per org)
  → /api/keys, /api/budgets (authenticated)

[Lemon Squeezy webhook]
  → POST /webhook/lemon-squeezy on Worker
  → updates subscriptions + orgs.plan_id
```

## Code Standards

- Files < 400 lines ideal, 800 max. Functions < 50 lines. Max 4 nesting levels.
- `camelCase` vars/fns, `PascalCase` types, `UPPER_SNAKE_CASE` consts.
- Immutability: new objects, never mutate in place.
- Errors explicit at system boundaries. Never swallow.
- Comments: one-line, WHY only. No WHAT, no task references.
- Never log prompt/response bodies. Token counts + metadata only.
