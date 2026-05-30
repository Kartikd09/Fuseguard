# FuseGuard — Codemap (architecture digest)

> Read this instead of re-scanning the repo. Update when structure/decisions change.
> Full detail: `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`.

## What it is
The circuit breaker for AI agents. A drop-in proxy (Anthropic Claude first) that **hard-blocks**
the next LLM call before it breaches a token/$ budget, and kills runaway loops. Open-core:
MIT proxy + paid hosted dashboard ($19/mo). Solo founder, AI-built, mocks-first.

## Repo layout
```
fuseguard/
├── CLAUDE.md                 # golden rules + standards (imports this codemap)
├── CONTRIBUTING.md           # GitHub Flow: main ← develop ← feat/fix/chore/docs
├── SECURITY.md               # vuln reporting + security promises
├── docs/
│   ├── PRD.md                # product spec, FR-1..FR-7, pricing, metrics
│   ├── ARCHITECTURE.md       # system design, DO counter, token counting, data model
│   ├── ROADMAP.md            # phases 0-6 + Phase 1 TDD task list (13 red→green)
│   └── AGENT_WORKFLOW.md     # multi-agent feature lifecycle
├── .claude/
│   ├── agents/               # 6 subagent defs: planner, dev, qa, security-reviewer,
│   │                         #   code-reviewer, cloud-admin (memory: project)
│   ├── skills/               # project skills (TDD task runner, etc.)
│   ├── commands/             # slash commands (/merge-pr, /new-feature)
│   ├── CODEMAP.md            # this file
│   └── settings.json         # permissions + hooks
├── packages/
│   ├── core/                 # MIT/OSS — the proxy moat
│   │   ├── src/index.ts      # Worker fetch: /health stub, proxy path (FR-1, TODO)
│   │   ├── src/budget-do.ts  # BudgetDO Durable Object (counter, §4c) — stub
│   │   ├── src/pricing.ts    # PRICING table + usdPerToken() + cost() stub
│   │   ├── src/proxy|loop|crypto/  # Phase 1 stubs
│   │   └── wrangler.toml      # worker fuseguard-proxy, BudgetDO binding, staging/prod
│   └── hosted/               # PROPRIETARY — billing, team, alerts, dashboard (Next.js)
```

## Architecture in one paragraph
Client points Anthropic `base_url` at the FuseGuard Worker (Cloudflare edge). Worker authn's the
FuseGuard key, decrypts the customer's Anthropic key, asks a **Durable Object** (one per
key/session, the authoritative counter) to reserve worst-case cost (`input + max_tokens`). If it
breaches budget → 402 block, never forwarded. Else forward to `api.anthropic.com`, stream back,
reconcile actual cost into the DO, async-log usage to Supabase. Dashboard (Next.js/CF Pages) reads
Supabase (RLS-isolated). Lemon Squeezy webhook → plan state.

## Key decisions (don't re-litigate)
- **Worst-case reserve + reconcile-down** → never over-spend; may block slightly early (intended).
- **One Durable Object per budget scope** → atomic counter, no races, no locks. NOT Postgres/KV.
- **Fail-closed** on hosted/paid; **fail-open** (toggleable) on OSS self-host.
- **No prompt/response bodies logged** — metadata + token counts + content hash only.
- **SSRF**: upstream host is a constant (`api.anthropic.com`), never from request input.
- **Open-core line**: self-host-an-enforcing-proxy = MIT; billing/team/alerts/dashboard = proprietary.
- **Stack**: CF Workers + Durable Objects, Supabase free, Next.js, Lemon Squeezy (merchant-of-record).

## Workflow rules
- Branch-per-feature → PR into `develop` → release PR into `main`. Both protected, PR-only, CI-required.
- **Merge only when founder clicks Merge** (0 required approvals, no auto-merge).
- TDD for budget/enforcement core. ≥80% coverage on `packages/core`.
- No secrets ever; no "Co-Authored-By" attribution in commits.

## Commands
`npm install` · `npm run typecheck` · `npm run lint` · `npm test` · `npm run test:coverage`
Proxy dev: `npm run dev:proxy` (wrangler). Dashboard: `npm run dev:dashboard`.

## Current phase
Phase 0 done (scaffold). **Phase 1 next**: TDD proxy core — pricing → estimator → authn → forward →
budget DO → hard kill → concurrency → streaming → loop detection → fail-closed (ROADMAP §Phase 1).
