# FuseGuard — Roadmap & Execution Plan

**Status:** v0.1 · **Last updated:** 2026-05-30 · Companion to `docs/PRD.md`, `docs/ARCHITECTURE.md`

> Constraint reality: solo founder, ~3–5 hrs/week, AI builds/tests/ships, founder orchestrates +
> distributes. Phases are **independently mergeable**. Agent owners follow the team roles below.

## Agent Roles (per docs/AGENT_WORKFLOW.md)
| Agent | Owns |
|---|---|
| **planner** | Specs, task decomposition, phase gates, scope-creep policing |
| **dev** | Implementation (TDD: red→green→improve) |
| **qa** | Test design, coverage ≥80% on critical paths, integration/E2E |
| **security-reviewer** | Key encryption, SSRF, webhook sig, secrets, fail-closed |
| **code-reviewer** | Quality, conventions, file/function size, DRY before merge |
| **cloud-admin** | Cloudflare/Supabase/Lemon Squeezy provisioning, secrets, env, deploy |

---

## Phase 0 — Spec & Scaffold
**Goal:** Frozen v0.1 spec + repo skeleton + green CI before any feature code.
**Tasks (ordered):**
1. (planner) Finalize PRD + ARCHITECTURE (this set). Freeze MVP scope.
2. (cloud-admin) Provision: CF account + Workers/Pages, Supabase staging+prod projects, Lemon Squeezy
   store (test mode), GitHub repo settings, branch protection on `main`/`develop`.
3. (dev) Monorepo skeleton: `packages/core` (MIT) + `packages/hosted` (proprietary), TS, vitest,
   Miniflare/workerd, ESLint/Prettier, `wrangler.toml` with DO + KV bindings.
4. (cloud-admin) Set wrangler secrets per env (placeholder values for staging).
5. (dev) CI: GitHub Actions lint+typecheck+test on PR; staging deploy on `develop`.
**Definition of Done:** empty proxy returns 200 health check from staging; CI green; secrets set;
both packages build.

---

## Phase 1 — Proxy Core (TDD) — *built first, OSS, the moat*
**Goal:** A working, enforcing, transparent Anthropic proxy with per-key/session budgets, hard kill,
loop detection, correct under concurrency and streaming. (Detailed TDD task list below.)
**Owner:** dev (TDD) → qa → security-reviewer → code-reviewer.
**Definition of Done:** All FR-1..FR-4 acceptance criteria pass; concurrency test proves no
over-spend; streaming reconciliation test passes; ≥80% coverage on `packages/core`; security-reviewer
signs off on SSRF + key encryption + fail-closed.

---

## Phase 2 — Dashboard
**Goal:** Next.js dashboard: auth, onboarding (proxy URL + base_url snippet), budget CRUD, live spend,
blocks, top spenders, per-key drill-down. (FR-5, FR-6 surfacing.)
**Tasks:** (dev) Supabase auth + RLS wiring → onboarding/setup screen → budget CRUD forms →
realtime spend view (Supabase realtime or 2s poll) → blocks & top-spenders views → key management.
**Owner:** dev → qa (E2E happy path) → code-reviewer.
**DoD:** A new user can sign up, create a key, copy base_url, make a real proxied call, and see spend
+ a forced block on the dashboard within 2s. RLS verified (cross-org read blocked).

---

## Phase 3 — Billing
**Goal:** Lemon Squeezy checkout + webhook → plan state → tier gating (FR-7).
**Tasks:** (cloud-admin) LS products/variants ($19/mo) → (dev) checkout link + customer portal →
webhook Worker route (HMAC verify) → `subscriptions` sync → tier enforcement (free=1 key, paid feature
gates: loop detection, team, alerts) → graceful downgrade (extra keys read-only).
**Owner:** dev → security-reviewer (webhook sig, replay) → qa (upgrade/downgrade flows in LS test mode).
**DoD:** Free→Pro upgrade unlocks keys+loop detection; webhook syncs status; downgrade enforces limits;
signature verification rejects forged webhooks.

---

## Phase 4 — Harden / Security
**Goal:** Production-safe. Close all security checklist items + reliability behaviors.
**Tasks:** (security-reviewer) full pass: key encryption at rest, SSRF allowlist test, secret hygiene,
webhook replay/idempotency, error-leak audit. (dev) fail-closed/open switch + tests, DO storage
persistence + cold-start hydration from Supabase, rate limiting on auth/webhook endpoints, structured
logging w/o PII. (qa) load/concurrency soak; latency-overhead measurement vs the ≤60 ms p95 NFR.
**Owner:** security-reviewer (lead) + dev + qa.
**DoD:** Security checklist 100% green; latency NFR met in staging; fail-closed verified;
DO recovery from cold start verified.

---

## Phase 5 — Launch
**Goal:** Public v0.1. OSS repo polished + hosted free/paid live on prod.
**Tasks:** (planner) launch checklist; (dev) README quickstart (one-line base_url), self-host guide,
LICENSE/MIT confirm, examples (CrewAI + raw SDK); (cloud-admin) prod deploy from `main`, custom domain,
LS live mode; (qa) prod smoke test; landing page with the $47k hook + live "dollars prevented" counter.
**DoD:** Anyone can change base_url and be protected in <5 min; hosted signup +
paid upgrade work in prod; docs complete.

---

## Phase 6 — Distribute (ongoing, founder-led)
**Goal:** Signups → activation → first block → conversion. Founder owns this; AI drafts assets.
See §Launch & Distribution below.
**DoD:** Hit 30/90/180-day PRD targets; instrument funnel (signup→activation→first-block→paid).

---

## Phase 1 — DETAILED TDD TASK LIST (red → green, ordered)

> Each task: **write failing test (RED)** → **implement minimum to pass (GREEN)** → refactor. Use
> Miniflare/workerd for Worker + DO tests. Mock `api.anthropic.com` with a local fetch handler.

**1. Pricing & cost calculation**
- RED: `cost(model, inTok, outTok, cacheRead, cacheWrite)` returns correct USD for each model; unknown
  model → most-expensive fallback.
- GREEN: implement `packages/core/pricing` table + `cost()`.

**2. Pre-flight estimator**
- RED: `estimate(request)` returns `(input + max_tokens)` worst-case cost; uses count_tokens result,
  falls back to `chars/3.5` heuristic when count unavailable; includes tool overhead.
- GREEN: implement estimator + cached count_tokens client.

**3. FuseGuard key authn**
- RED: request with unknown/inactive FG key → 401; valid key resolves org + decrypted customer key.
- GREEN: hash lookup + AES-GCM decrypt (crypto module). Plaintext never logged (assert no log).

**4. Transparent forward (non-stream, no budget)**
- RED: valid call forwards to mock Anthropic, returns identical body+status; only `api.anthropic.com`
  ever called (SSRF: attempt to override upstream is ignored).
- GREEN: implement forward + SSRF constant upstream.

**5. Budget DO — reserve/reconcile (single call)**
- RED: DO `reserve(estCost)` decrements remaining; `reconcile(actualCost)` releases the difference;
  `over budget` reserve returns `blocked`.
- GREEN: implement Budget DO with transactional storage.

**6. Hard kill — per-key budget (FR-3)**
- RED: with a key budget that has room < estimate → 402 `budget_exceeded` body shape exact; no upstream
  call made; `blocks` event emitted.
- GREEN: wire Worker → key DO decision → 402 path.

**7. Per-session budget (FR-2/FR-3)**
- RED: `X-FuseGuard-Session` present → session DO enforced; absent → session budget skipped, key budget
  still applies; both apply → key reserved first then session, failure releases key reservation.
- GREEN: implement dual-scope reservation w/ fixed lock order + compensating release.

**8. Concurrency — no over-spend (FR-3 critical)**
- RED: fire N=50 concurrent calls against a budget with room for exactly 1 → exactly 1 (or 0) succeed,
  rest 402; final counter never negative / never exceeds limit.
- GREEN: rely on DO single-threaded serialization; assert via Miniflare concurrency harness.

**9. Post-flight reconciliation (non-stream)**
- RED: actual usage from response < worst case → DO counter reflects actual, not worst case;
  `usage_events` row written async with actual tokens/cost.
- GREEN: parse response `usage`, reconcile, async ingest.

**10. Streaming forward + reconciliation (FR-1/R5)**
- RED: `stream:true` pipes SSE unbuffered (first byte fast); terminal `message_delta` usage captured;
  reconcile on stream end; client disconnect → worst case retained.
- GREEN: tee stream reader, parse final usage, reconcile.

**11. Loop detection (FR-4)**
- RED: ≥10 near-identical requests (stable hash over `{model,system,messages,tools}`) within 60s →
  subsequent blocked with 402 `loop_detected`; below threshold → allowed; thresholds configurable.
- GREEN: ring buffer in DO keyed by request hash + timestamp window.

**12. Fail-closed / fail-open (R4e)**
- RED: DO unreachable + `FAILURE_MODE=closed` → 402 `enforcement_unavailable`; `=open` → forwarded.
- GREEN: failure-policy switch at Worker boundary.

**13. Error hygiene & validation**
- RED: malformed body/session header → 400; no upstream key / stack trace / internal path in any
  client-visible error.
- GREEN: zod boundary validation + safe error mapper.

**Phase 1 exit:** all 13 green, ≥80% coverage on `packages/core`, concurrency + streaming proven,
security-reviewer + code-reviewer sign-off.

---

## Launch & Distribution

**The hook (use everywhere):** *"An AI agent looped for 11 days and ran up a $47,000 bill. The team
had dashboards, alerts, and a spend cap. None of them stopped it. FuseGuard would have — it blocks the
next call before the money's gone."*

**GitHub OSS (foundation):**
- MIT `packages/core`, killer README quickstart (one-line base_url change), `examples/` for CrewAI +
  raw Anthropic SDK, self-host guide, architecture doc link. Pin the $47k story at the top.
- "Good first issue" labels + CONTRIBUTING to invite stars/PRs.

**Show HN:** Title angle — *"Show HN: FuseGuard – a circuit breaker that hard-blocks AI agent
overspend (open source)."* Lead with the $47k story, the one-line integration, and the enforcement-vs-
observability wedge. Founder live in comments.

**Reddit (sequenced, value-first, not spammy):**
- r/LocalLLaMA + r/LangChain: "I built an open-source kill-switch for runaway agent loops" — demo gif
  of a 402 block firing mid-loop.
- r/devops + r/selfhosted: angle on self-hosting the proxy + fail-closed safety + cost governance.

**Build-in-public (X + LinkedIn):** weekly thread — the $47k hook, the concurrency/DO problem and how
it was solved, a live "dollars prevented" counter from the landing page, screenshots of real blocks.
Document the solo+AI build process (own narrative).

**Funnel instrumentation:** track signup → activation (first proxied call) → first-block → free→paid.
First-block is the conversion trigger — trigger an in-app + email nudge to upgrade right after a user's
first block ("FuseGuard just saved you $X — unlock loop detection + team on Pro").

**Distribution cadence (founder, ~3–5 hrs/wk):** 1 build-in-public post/week, 1 community post/week,
respond to all GitHub issues, reach out to 5 indie agent builders/week for design-partner feedback.
