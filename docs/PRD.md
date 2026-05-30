# FuseGuard — Product Requirements Document (PRD)

**Status:** v0.1 MVP spec · **Owner:** Founder (solo) · **Last updated:** 2026-05-30
**Audience:** Founder + AI build agents (planner, dev, qa, security-reviewer, code-reviewer, cloud-admin)

> Source of truth for *what* we build for v0.1 and *why*. Architecture (the *how*) lives in
> `docs/ARCHITECTURE.md`; execution order lives in `docs/ROADMAP.md`.

---

## 1. Vision & Positioning

**One-liner:** *FuseGuard is the circuit breaker for AI agents — a drop-in proxy that hard-blocks
the next LLM call before it breaches your budget.*

**Positioning statement:** For indie developers and small teams shipping AI agents to production,
who get burned by runaway loops and unpredictable spend, FuseGuard is a drop-in proxy that
**enforces** token/$ budgets in real time and kills runaway loops — unlike observability tools
(LangSmith, Helicone, Langfuse) that only *show* spend after it happens. FuseGuard is cheap,
open-core, and works by changing a single line: the Anthropic `base_url`.

**The category gap we own:** *Runtime enforcement.* Everyone else is read-only telemetry.
We are a write-path control plane that can say **no**.

**North star:** Dollars *prevented* / blocked calls across all users. Every block is the one job
nobody else does.

---

## 2. Market & Why Now

The agent boom created a spend-control vacuum. The tooling that exists watches; nothing stops.

- **AI agents market: $10.9B in 2026, growing 44–46% CAGR.** Agent frameworks (CrewAI, LangGraph,
  AutoGen) make multi-step, self-looping agents trivial to deploy — and trivial to run away.
- **Enterprise AI spend is climbing $11.5B → $37B.** The fastest-growing, least-controlled line item.
- **80–85% of organizations miss their AI cost forecasts by more than 25%.** Spend is emergent:
  token count depends on model behavior, not a fixed plan.
- **Gartner: 40%+ of agentic AI projects will be cancelled by 2027 — #1 cited reason is cost.**
  Board-level fear, not a nice-to-have.
- **The $47,000 loop (the hook):** A documented LangChain agent loop ran for **11 days** and cost
  **$47,000**. The team had a dashboard, Slack alerts at 50/80/95%, *and* a provider-level spend cap.
  **None of them stopped the loop.** Alerts fire *after* spend lands. Provider caps reconcile on a
  delay and trigger too late. The only thing that would have worked is a control that refuses the
  *next* call synchronously, in the request path. That control is FuseGuard.

**Why now, specifically:**
1. Agent frameworks made loops a default failure mode, not an edge case.
2. Anthropic Claude is the reasoning model of choice for agents — concentrated, single-provider
   demand we can serve first.
3. Observability incumbents are structurally read-only (they tap traces; they don't sit on the write
   path). Enforcement is an architecture choice they didn't make; retrofitting it is hard.
4. Merchant-of-record billing (Lemon Squeezy) + edge compute (Cloudflare Workers) means a solo
   founder can ship a global, tax-compliant, low-latency proxy for ~$0 fixed cost.

---

## 3. Competitive Landscape & Wedge

| Product | What it does | Enforcement? | Pricing pain | Why it didn't stop the $47k loop |
|---|---|---|---|---|
| **LangSmith** | Tracing, eval, observability | No (read-only) | Per-seat + per-trace, **$195+/mo** tiers; expensive for indies | Shows the trace after the fact |
| **Helicone** | Proxy-based observability, dashboards, alerts, provider cost caps | **No real-time block** | Freemium then usage tiers | *Had* dashboard + alerts + a cost cap — none stopped the loop; caps reconcile late, alerts fire post-spend |
| **Langfuse** | Open-source tracing/observability | No | OSS + cloud tiers | Telemetry only; no write-path control |
| **Portal26 / Elvex** | Enterprise AI governance/security | Partial, enterprise | Enterprise-priced, sales-led | Built for compliance teams, not indie devs; not drop-in |

**Key insight:** Helicone is the closest — it's *also* a proxy and it *had* a cost cap — yet the loop
still ran. Provider/aggregate caps reconcile asynchronously and act too late; they don't refuse the
individual *next* call before it's sent. FuseGuard's enforcement is **synchronous, per-key/per-session,
pre-flight**.

**FuseGuard's wedge:**
- **Enforcement, not observability.** We block. We are on the write path by design.
- **Drop-in.** One line: change the Anthropic `base_url`. No SDK rewrite, no decorators.
- **Cheap.** Free OSS core + **$19/mo** hosted. An order of magnitude under LangSmith.
- **Open-core / self-hostable.** Trust through transparency; the proxy that holds your API key is
  inspectable MIT code.
- **Indie/small-team first.** Not sales-led, not enterprise-priced, not seat-metered.

We are not trying to beat LangSmith at tracing. We own a job they don't do.

---

## 4. Personas & Jobs-to-Be-Done

### Persona A — "Indie Ravi," the solo agent builder
- Ships a CrewAI/LangChain side project or micro-SaaS; uses Claude as the agent brain.
- Pays for the API personally; a runaway loop is rent money.
- **JTBD:** *"When I deploy an agent that might loop, I want a hard dollar ceiling that physically
  cannot be exceeded, so I never wake up to a $47k bill."*
- Success = sets a $20/day cap in 5 minutes, sleeps fine.

### Persona B — "Team Lead Meera," shipping agents to prod for a small startup
- 3–8 engineers; multiple agents and API keys across staging/prod.
- Answers to a founder about cloud + AI spend; needs per-key attribution and team visibility.
- **JTBD:** *"When my team ships agents, I want per-key budgets, loop kill-switches, and one
  dashboard, so a junior's bad prompt loop can't torch our monthly budget."*
- Success = per-key budgets enforced, alerts on blocks, team sees spend without sharing the master
  API key.

**Anti-persona (explicitly not v0.1):** Large enterprise governance/compliance buyers needing SSO,
SOC2, audit exports, procurement. We will not chase them in v0.1; they slow the loop and need
features that are pure scope creep now.

---

## 5. Functional Requirements (MVP / v0.1 only)

Each requirement is numbered (`FR-n`) with explicit acceptance criteria. **MVP only** — anything not
listed is out of scope (§5.x). Scope-creep flags are inline.

### FR-1 — Drop-in transparent proxy (Anthropic Messages API)
User changes their Anthropic client `base_url` to the FuseGuard URL. Requests forward to
`https://api.anthropic.com`; responses returned unchanged.
**Acceptance:**
- A standard `anthropic` SDK call with `base_url` pointed at FuseGuard returns a byte-identical
  successful response body and status vs a direct call (excluding FuseGuard-injected headers).
- Streaming (`stream: true`) works end-to-end.
- Non-Messages Anthropic endpoints pass through unmodified (no metering, no block) in v0.1.
- Latency overhead within the NFR budget (§6).

### FR-2 — Per-key and per-session budgets
A budget is a ceiling in **USD** or **tokens** scoped to either an API key or a session (identified by
a client-supplied `X-FuseGuard-Session` header).
**Acceptance:**
- User can create `{ scope: key|session, limit_type: usd|tokens, limit_value, window: rolling|daily|total }`.
- Spend attributed to the correct scope, visible within ≤2s on dashboard.
- Per-session budget keys off `X-FuseGuard-Session`; absent header ⇒ session budget not enforced (key
  budget still applies).
- Free tier: exactly 1 API key with basic budget tracking. Paid: unlimited keys + sessions.

### FR-3 — Hard kill (pre-flight enforcement)
Before forwarding, FuseGuard computes a **worst-case projected** cost (current spend + pre-flight
estimate, see ARCHITECTURE §3). If projection breaches any applicable budget, the call is **blocked**
and never sent upstream.
**Acceptance:**
- Blocked call returns HTTP **402** with JSON:
  `{ "error": { "type": "budget_exceeded", "message": "...", "scope": "key|session", "budget_limit": <n>, "current_spend": <n>, "projected": <n> } }`.
- No request is sent to `api.anthropic.com` for a blocked call (verified by mock upstream).
- Correct under concurrency: N simultaneous calls against a budget with room for 1 ⇒ exactly 1 (or 0)
  pass, never an over-spend (ARCHITECTURE §4c).
- Block event recorded (FR-6) and surfaced on dashboard within ≤2s.

### FR-4 — Loop detection & kill (paid)
Detect N near-identical requests within T seconds on the same key/session; block + flag.
**Acceptance:**
- Default rule: **≥10 near-identical requests within 60s** ⇒ block subsequent matches, flag
  `loop_detected`. Thresholds configurable per key.
- "Near-identical" = stable hash over `{model, system, messages, tools}` with normalized whitespace.
- Loop-blocked calls return HTTP 402 with `type: "loop_detected"`.
- Loop detection is **paid-tier**; free tier returns a hint it's available on paid.

### FR-5 — Live dashboard
Web dashboard (Next.js) showing real-time spend posture.
**Acceptance:**
- Displays: total spend (window-scoped), blocked-call count, top spenders (by key/session), per-key
  drill-down (spend, budget, % used, recent blocks).
- Data freshness ≤2s p95 from event to visible.
- Auth via Supabase; a user sees only their own org's data (RLS-enforced).
- Setup screen shows the user's proxy URL + a copy-paste `base_url` snippet.

### FR-6 — Usage & block event logging
Every metered call and every block produces a structured event in Supabase.
**Acceptance:**
- `usage_events` row per completed call: key_id, session, model, input_tokens, output_tokens,
  cost_usd, ts, status.
- `blocks` row per block: reason (`budget_exceeded` | `loop_detected`), scope, projected, ts.
- **By default we do NOT store prompt/response bodies** (§6 security). Only metadata + token counts +
  content hashes for loop detection.

### FR-7 — Tiers & paywall
**Acceptance:**
- **Free:** 1 API key, basic per-key budget tracking + hard kill, single-user dashboard.
- **Paid ($19/mo):** unlimited keys + sessions, team members, alerts, loop detection.
- Plan state driven by Lemon Squeezy webhooks (ARCHITECTURE §1, §6); downgrade enforces free-tier key
  limit gracefully (extra keys become read-only, not deleted).

### 5.x Out of Scope for v0.1 (explicit — do NOT build)
- **Eval / quality / output-grading metrics** — different product surface. *Scope creep.*
- **Multi-provider (OpenAI, Google, etc.)** — OpenAI is **v0.2**. Anthropic only for MVP.
- **SSO / SAML / SCIM** — enterprise; *scope creep* for the indie wedge.
- **Advanced analytics, cohorting, forecasting** — post-PMF.
- **Mobile app** — dashboard is responsive web only.
- **Prompt/response content storage & replay** — privacy posture is *not* to store bodies.

---

## 6. Non-Functional Requirements

### Performance
- **Proxy latency overhead budget: p50 ≤ 30 ms, p95 ≤ 60 ms** added over a direct Anthropic call,
  measured at the edge (excludes upstream model time and client geography). The metering + block
  decision happens in a single Durable Object round-trip.
- Streaming first-byte overhead target: **≤ 50 ms** added before upstream first token.

### Reliability
- Proxy availability target **99.9%** (rides Cloudflare's edge SLA; logic stateless except DOs).
- **Fail-closed vs fail-open** (ARCHITECTURE §4e): hosted/paid defaults **fail-closed** (if the budget
  counter is unreachable, block — safety first). OSS self-host defaults **fail-open**, config-toggleable.
  Deliberate product promise: *we will never let a loop through because our own metering hiccuped.*
- Supabase write failures must not block the request path: usage events written async/best-effort off
  the hot path; the *authoritative* counter lives in the Durable Object, not Postgres.

### Security
- **Customer Anthropic API keys encrypted at rest** (AES-GCM via a Worker secret-held master key;
  never logged, never returned to the client after creation). ARCHITECTURE §6.
- **No full prompt/response logging by default.** Store token counts + a content hash only. Body
  capture is never on in v0.1.
- **SSRF protection:** the proxy forwards **only** to an allowlisted Anthropic host
  (`api.anthropic.com`). No user-controlled upstream URL.
- Wrangler secrets for all keys; no secrets in repo or client bundle.
- Lemon Squeezy webhook signatures verified (HMAC) before mutating plan state.
- Input validation at the boundary: header/body shape, budget config schema, session id format.

### Privacy / Compliance posture
- **Data minimization by design** — metadata + counts + hashes, not content. A trust differentiator
  vs body-logging observability tools.
- Lemon Squeezy is **merchant of record** — owns VAT/GST/sales-tax compliance globally (incl. India).
  FuseGuard stores no card data.
- Public privacy statement: "We never store your prompts or completions by default."
- Not pursuing SOC2/GDPR DPA tooling in v0.1 (enterprise scope); document the minimal-data posture
  honestly instead.

---

## 7. Pricing & Monetization

### Tiers
| | **Free (OSS + hosted free)** | **Pro — $19/mo** |
|---|---|---|
| API keys | 1 | Unlimited |
| Sessions | Tracked | Tracked + per-session budgets |
| Hard-kill budgets | ✅ (per key) | ✅ (key + session) |
| Loop detection | ❌ | ✅ |
| Alerts (email/webhook) | ❌ | ✅ |
| Team members | ❌ (single user) | ✅ |
| Dashboard | ✅ basic | ✅ full (top spenders, drill-down) |
| Self-host (MIT core) | ✅ | ✅ |

### What gates the paywall (upgrade triggers)
1. **A second API key** — indies grow into a team; the 2nd key is the upgrade moment.
2. **Loop detection** — the highest-fear feature ("the $47k thing"); deliberately Pro-only.
3. **Team visibility / alerts** — shared dashboard for a team already feeling the pain.

Free must be genuinely useful (real enforcement on 1 key) so it spreads; Pro sells *scale + the loop
kill-switch + sleeping through the night as a team*.

### Path to first $1,000 MRR
- $19/mo ⇒ **~53 paying customers** = $1,007 MRR.
- Funnel: ~2,000 signups → 25% activate (first proxied call) → 3–5% free→paid. 2,000 × 4% = 80
  conversions ≈ $1.5k MRR. Target **~1,300–2,000 signups** to clear $1k MRR.
- Distribution: GitHub OSS + Show HN + r/LocalLLaMA / r/LangChain / r/selfhosted + build-in-public
  (the $47k hook). See `docs/ROADMAP.md` §Launch & Distribution.

---

## 8. Success Metrics & Targets

| Metric | Definition | 30 days | 90 days | 180 days |
|---|---|---|---|---|
| **Signups** | Account created | 150 | 700 | 2,000 |
| **Activation** | First proxied call | 40 | 250 | 800 |
| **First block** | Account with ≥1 block event (the "aha") | 15 | 120 | 450 |
| **Free→Paid conversion** | Paid / activated | 2% | 3% | 5% |
| **Paying customers** | Active Pro subs | 3 | 15 | 55 |
| **MRR** | Pro × $19 | ~$57 | ~$285 | **~$1,045** |
| **GitHub stars** | OSS proxy core | 200 | 800 | 2,500 |
| **Activation→Block rate** | % activated users who hit a block | — | 40% | 50% |

**Leading indicator that matters most:** *first block event* — a user who has seen FuseGuard refuse a
call has experienced the value prop and is the prime conversion candidate.

---

## 9. Risks & Open Questions

### Product / market risks
- **R1 — "Set a budget" is a yawn until it isn't.** Mitigation: lead all messaging with the $47k loop;
  ship loop detection as the emotional hook even though budgets are the core.
- **R2 — Helicone/LangSmith ship real enforcement.** Mitigation: move fast on OSS trust + indie
  pricing; enforcement is an architecture pivot for them, not a flag.
- **R3 — Free tier too generous / too stingy.** 1 key may be too tight (kills virality) or fine
  (drives 2nd-key upgrade). A/B after launch.

### Technical risks (detailed mitigations in ARCHITECTURE §4)
- **R4 — Pre-flight cost estimation accuracy** (we don't know output length pre-call).
- **R5 — Streaming token reconciliation** (final usage arrives at stream end).
- **R6 — Concurrency races** on the same budget across simultaneous calls.
- **R7 — Durable Object failure / consistency** and the fail-closed promise.

### Open questions for the founder to confirm
1. **Latency budget** — is p95 ≤ 60 ms overhead acceptable as the public NFR, given one DO round-trip
   plus encryption? (Lower requires DO co-location + regional pinning.)
2. **Free tier = 1 key** — confirm this is the upgrade trigger vs a usage/volume cap.
3. **Pre-flight estimate model** — confirm we charge worst case (input + `max_tokens`) for the block
   decision and reconcile down after (conservative = never over-spend, may block slightly early).
4. **Fail-closed default for hosted** — confirm you accept that a FuseGuard outage blocks customer
   traffic (safety-first), with a documented opt-out.
5. **Session identity** — confirm `X-FuseGuard-Session` header as the session key (vs a metadata field).
