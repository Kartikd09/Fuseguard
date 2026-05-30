---
name: tdd-task
description: Run one FuseGuard Phase 1 proxy-core task in strict TDD. Use when implementing any budget/enforcement/proxy logic — writes the failing test first, then minimal code to green.
---

## Overview
Implements ONE task from `docs/ROADMAP.md` §Phase 1 using red→green→refactor. The budget
kill-switch is the product — it must be provably correct. NEVER write implementation before a
failing test.

## Steps
1. Confirm the current branch is a `feat/*` branch off `develop` (NOT main/develop). If not, stop.
2. Read the target task in `docs/ROADMAP.md` §"Phase 1 — DETAILED TDD TASK LIST" and its acceptance
   criteria in `docs/PRD.md` (FR-1..FR-4) and approach in `docs/ARCHITECTURE.md` §4.
3. **RED** — write the failing test(s) in `packages/core/src/<area>.test.ts`. Run `npm test` and
   confirm it FAILS for the right reason. Use fake clocks; mock Anthropic + Supabase at boundaries.
4. **GREEN** — write the minimal code in `packages/core/src/` to pass. Run `npm test` until green.
5. **REFACTOR** — clean up; keep functions <50 lines, files <800, no >4 nesting; immutable patterns.
6. Run `npm run typecheck` + `npm run lint` — must be clean.
7. Run `npm run test:coverage` — core must stay ≥80%.

## Important rules
- One concern per task/PR. Don't bundle multiple ROADMAP tasks.
- Conservative enforcement: never let a call through that could breach the budget (worst-case reserve).
- Concurrency safety comes from the single Durable Object per scope — assert it with a concurrency test.
- Never log full prompt/response bodies. Never hardcode secrets.
- No "Co-Authored-By" attribution in commits.
- When done, hand off to the `code-reviewer` (always) and `security-reviewer` (if auth/keys/proxy/billing).
