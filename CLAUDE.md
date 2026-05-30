# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: FuseGuard

The circuit breaker for AI agents. A drop-in proxy between an app and the LLM provider
(Anthropic Claude first) that enforces token/$ budgets at runtime — blocking calls
*before* a budget is breached, and killing runaway loops. Open-core: MIT proxy + paid hosted dashboard.

See `docs/PRD.md` for the full product spec and `docs/ARCHITECTURE.md` for system design.

For a fast architecture digest (read this instead of re-scanning the repo):
@.claude/CODEMAP.md

## Golden Rules (NON-NEGOTIABLE)

1. **NEVER commit directly to `main` or `develop`.** All work happens on `feat/*`, `fix/*`,
   `chore/*`, or `docs/*` branches and merges via Pull Request. See `CONTRIBUTING.md`.
2. **NEVER commit secrets.** No API keys, tokens, `.env` files. Use `.env.example` for shape.
   gitleaks + secret-scanning will block you.
3. **TDD for the budget-enforcement core.** Write the failing test first. The kill-switch
   logic is the product — it must be provably correct.
4. **Security review before any merge that touches** auth, API keys, the proxy request path,
   or billing. Use the `security-reviewer` agent.
5. **Every PR is reviewed** by the `code-reviewer` agent before merge.

## Multi-Agent Team

This project is built by an orchestrated agent team. Roles are defined in `.claude/agents/`.
The orchestration workflow and handoffs are in `docs/AGENT_WORKFLOW.md`.

| Agent | Responsibility |
|-------|----------------|
| `planner` | PRD, architecture, task breakdown, phase planning |
| `dev` | Feature implementation on branches |
| `qa` | Test authoring, coverage, edge cases (TDD) |
| `security-reviewer` | Vuln scan, secrets, OWASP, threat model |
| `cloud-admin` | Cloudflare/Supabase deploy, infra-as-code, CI/CD |
| `code-reviewer` | Quality gate on every PR |

## Commands

> Tooling is added as the stack is built. Update this section when scripts land.

```bash
# Install (once package.json exists)
npm install

# Proxy (Cloudflare Worker) — local dev
npm run dev:proxy        # wrangler dev

# Dashboard (Next.js)
npm run dev:dashboard

# Tests (TDD — run constantly)
npm test                 # all
npm test -- <pattern>    # single file/pattern
npm run test:watch
npm run test:coverage    # must stay >= 80% on core

# Lint / typecheck (must pass before PR)
npm run lint
npm run typecheck

# Security
npm run secrets:scan     # gitleaks
```

## Architecture (big picture)

```
[Client app] → [FuseGuard Proxy: CF Worker + Durable Objects] → [api.anthropic.com]
                        │  token counting + budget check (Durable Object counters)
                        │  block if over budget / loop detected
                        └─→ usage events → Supabase (Postgres)
[Dashboard: Next.js on CF Pages] ← reads Supabase
[Lemon Squeezy] → webhook → Supabase (plan/limits)
```

- **Proxy core (MIT, OSS):** request interception, token accounting, budget enforcement,
  loop detection. The valuable, trust-critical code is open.
- **Hosted (proprietary):** managed dashboard, team features, alerts, billing.

## Coding Standards

- Files < 400 lines ideal, 800 max. Functions < 50 lines. Max 4 nesting levels.
- `camelCase` vars/fns, `PascalCase` types, `UPPER_SNAKE_CASE` consts, `is/has/should/can` bools.
- Immutability: new objects, don't mutate in place.
- Errors explicit at boundaries (proxy input, Anthropic responses, webhooks). Never swallow.
- Comments: one-line, WHY only. No WHAT.
- Validate everything external (incoming requests, Anthropic responses, LS webhooks).

## Critical Technical Invariants

- **Pre-flight budget check must be conservative:** estimate worst-case output tokens before
  allowing a call; reconcile with actual usage after. Never let a call through that *could*
  breach the ceiling.
- **Concurrency:** budget counters live in a single Durable Object per key/session to avoid
  race conditions on concurrent calls.
- **Never log full prompt/response bodies** by default (privacy + compliance). Log token
  counts + metadata only.
- **Fail closed on the paid tier** (block on uncertainty), **fail open is opt-in** for OSS self-host.
