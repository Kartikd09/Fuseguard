# FuseGuard — Architecture

**Status:** v0.1 · **Last updated:** 2026-05-30 · Companion to `docs/PRD.md`, `docs/ROADMAP.md`

---

## 1. System Overview

FuseGuard is a transparent, enforcing proxy at the edge. The hot path is a Cloudflare Worker that
authenticates the request, consults a **Durable Object (DO)** holding the authoritative per-key /
per-session counter, makes a synchronous block/allow decision, forwards allowed calls to Anthropic,
then reconciles actual cost back into the DO. Postgres (Supabase) is the system of record for config
and a durable event log, but is **never** on the blocking decision's critical path.

```
                                  ┌───────────────────────────────────────────────┐
                                  │           Cloudflare (edge)                     │
                                  │                                                 │
  ┌──────────┐  base_url=         │   ┌──────────────┐      ┌────────────────────┐  │
  │  Client  │  fuseguard.app     │   │  Worker       │ RPC  │ Durable Object      │  │
  │ (agent / ├────────────────────┼──▶│  (proxy)      │◀────▶│  per key|session    │  │
  │  SDK)    │  x-api-key:        │   │               │      │  counter+loop ring  │  │
  └──────────┘  FuseGuard key     │   │ 1 authn       │      │  (authoritative)    │  │
       ▲        X-FuseGuard-      │   │ 2 estimate    │      └────────────────────┘  │
       │        Session           │   │ 3 ALLOW/BLOCK │                              │
       │                          │   │ 4 forward     │      ┌────────────────────┐  │
       │  402 budget_exceeded     │   │ 5 reconcile   │ async│ Pages (Next.js)     │  │
       │  / loop_detected         │   └──────┬────────┘ logs │  dashboard          │  │
       │                          │          │               └─────────▲──────────┘  │
       └──────────────────────────┼──────────┼─────────────────────────┼─────────────┘
                                  │           │ (allowed)               │ read (RLS)
                                  └───────────┼─────────────────────────┼───────────
                                              ▼                         │
                                   ┌────────────────────┐    ┌──────────┴──────────┐
                                   │ api.anthropic.com   │    │ Supabase (Postgres) │
                                   │ (Messages API)      │    │ users, api_keys,    │
                                   └────────────────────┘    │ budgets, usage_     │
                                                             │ events, blocks,     │
                                   ┌────────────────────┐ web │ plans/subscriptions │
                                   │ Lemon Squeezy       │hook │                     │
                                   │ (merchant of record)├────▶│  (plan state)       │
                                   └────────────────────┘    └─────────────────────┘
```

**Critical-path latency contributors:** authn lookup (cached) → DO RPC (estimate + decision +
reserve) → upstream fetch. Everything else (event logging to Supabase) is async/off-path.

---

## 2. Component Breakdown

| Component | Tech | Responsibility |
|---|---|---|
| **Proxy Worker** | CF Worker (TS) | Authn FuseGuard key, parse request, decrypt customer key, call DO for decision, forward to Anthropic, stream response, fire async usage event. Owns SSRF allowlist + fail-closed/open policy. |
| **Budget DO** | Durable Object (one per `key` and one per `session`) | Authoritative spend counter. Pre-flight reserve, post-flight reconcile, loop-detection ring buffer, window resets. Serializes concurrent access (no races). |
| **Pricing config** | Static module + KV cache | Per-model input/output $/M-token table; estimation logic. Versioned in OSS core. |
| **Supabase Postgres** | Supabase (free) | System of record: users, api_keys (encrypted), budgets, usage_events, blocks, plans. RLS-isolated per org. Durable event log + dashboard source. |
| **Dashboard** | Next.js + Tailwind on CF Pages | Auth (Supabase), setup/onboarding, live spend, blocks, top spenders, per-key drill-down, budget CRUD, billing portal link. |
| **Billing webhook** | CF Worker route | Verifies Lemon Squeezy HMAC, updates `subscriptions`/plan, enforces tier limits. |
| **Usage ingest** | CF Worker (queue/async) | Best-effort write of usage_events + blocks to Supabase off the hot path. |

---

## 3. Anthropic Token Counting & Pricing

Two measurements per call:

- **Pre-flight (worst-case estimate)** — computed *before* forwarding, used for the block decision:
  `estimated_cost = (input_tokens × input_price) + (max_tokens × output_price)`
  - `input_tokens`: counted from the request `{system, messages, tools}`. v0.1 uses Anthropic's
    `/v1/messages/count_tokens` endpoint (cached per content-hash) with a local heuristic fallback
    (`chars/3.5` + tool overhead) if the count endpoint is unavailable.
  - `max_tokens`: taken directly from the request (Anthropic requires it). This is the **worst case**
    for output — the model can produce *at most* `max_tokens`. We charge the worst case for the
    reservation so we **never** over-spend, then reconcile down to actual after the call.
- **Post-flight (actual)** — read from the response `usage` block
  (`input_tokens`, `output_tokens`, plus `cache_creation_input_tokens` / `cache_read_input_tokens`
  when present). This is the authoritative cost written to `usage_events` and used to release the
  unused portion of the reservation back into the DO counter.

**Pricing table as config** (`packages/core/src/pricing.ts`, USD per 1M tokens — kept current
with Anthropic's published rates; re-verify on each model launch):

```ts
// USD per 1M tokens — verified against Anthropic pricing 2026-05-31. Aliases + dated IDs both listed.
export const PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-4-5":   { input: 5.0,  output: 25.0 },  // Opus 4.5+
  "claude-sonnet-4-5": { input: 3.0,  output: 15.0 },
  "claude-haiku-4-5":  { input: 1.0,  output:  5.0 },
  // legacy: opus-4/4.1 ($15/$75), haiku-3.5 ($0.8/$4) kept for back-compat
  // cache read/write multipliers (write 1.25×, read 0.1×) handled in cost fn
};
```

Cache tokens are priced via Anthropic's multipliers (cache write ≈ 1.25×, cache read ≈ 0.1× of input)
in the cost function. Unknown model ⇒ **fail-closed**: treat as most-expensive known model for the
estimate (conservative), log a warning to update the table.

---

## 4. Hard Technical Risks & Chosen Approaches

### (a) Pre-flight estimate accuracy before the call completes
**Decision:** Reserve the **worst case** (`input + max_tokens`) against the budget pre-flight, then
**reconcile down** to actual on response. Consequence: we may block *slightly early* (when the
remaining budget is below the worst case but the real call would have fit). This is the correct
trade-off — FuseGuard's promise is "never over-spend," and a rare early block is acceptable;
a single over-spend is a product failure. The 402 message states it's a worst-case projection so
users understand and can raise `max_tokens`-aware budgets.

**Measured over-estimation (from `estimator.accuracy.test.ts` — deterministic, 108 scenarios
across 3 models × 3 input sizes × 3 max_tokens × 4 output-ratio buckets):**

| Actual output as % of max_tokens | Median over-estimate | p95 over-estimate | Median early-block window |
|---|---|---|---|
| 5% (very short answers) | **6.9×** | 19.0× | 85% |
| 20% (typical LLM call) | **3.6×** | 5.0× | 72% |
| 50% (moderate output) | **1.8×** | 2.0× | 45% |
| 100% (fills max_tokens) | **1.0×** | 1.0× | 0% |

**What this means for budget design:**

- The over-estimate ratio shrinks when input tokens dominate the cost (large prompts,
  small `max_tokens`) because the input component is identical in both worst-case and actual cost.
  It approaches `1 / outputRatio` when output dominates (small prompt, large `max_tokens`).
- A call that produces 20% of its `max_tokens` (the typical case) causes FuseGuard to reserve
  ~3.6× what was actually spent. The remaining ~72% of the reservation is released on reconcile,
  but during the call that headroom is held against the budget.

**Budget guidance for users:** Set your budget ceiling at least **4–5× above your expected
actual spend** when using high `max_tokens` values (≥1024) and expecting short outputs. For
example: if you expect to spend $10 and your average call uses ~20% of `max_tokens`, set a
budget of $35–50 to avoid false-positive 402 blocks. Alternatively, lower your `max_tokens` to
match the longest realistic output — the tighter `max_tokens`, the less reservation pressure.
The reconcile step returns unused reservation after each call, so the ceiling does not accumulate
over time; only the in-flight worst-case reservation is inflated.

### (b) Streaming responses — token reconciliation
**Decision:** For `stream: true`, reserve worst case pre-flight (same as non-stream). Pipe the SSE
stream straight to the client (no buffering — protects first-byte latency). Tee a lightweight reader
that parses the terminal `message_delta` / `message_stop` event, which carries final `usage`.
On stream end, reconcile actual into the DO and write the usage event. If the client disconnects
mid-stream, we keep the worst-case reservation charged (conservative) and reconcile from whatever
final usage we captured, else leave the worst case — never refund what we can't verify.

### (c) Concurrency / race conditions on the same budget
**Decision:** **One Durable Object per budget scope** (`budget:key:<id>` and `budget:session:<id>`).
The DO is single-threaded and serializes all input gates, so the read-decide-reserve sequence is
atomic by construction — no CAS, no distributed lock. N concurrent calls against a budget with room
for 1 are processed one at a time inside the DO; exactly one reserves successfully, the rest get
blocked. This is the core reason we chose Durable Objects over a Postgres counter (which would race)
or KV (eventually consistent). When both a key budget and a session budget apply, the Worker reserves
against the **key DO first, then the session DO**; if the second reservation fails, it releases the
first (compensating release) and blocks. Fixed lock order prevents deadlock.

### (d) Durable Object consistency + DO failure
**Decision:** The DO is the single authoritative counter and uses DO **transactional storage** so the
counter survives eviction/restart (state is persisted, not just in-memory). On reconcile we persist
the new total before responding to the Worker. If the DO is **unreachable** (rare CF incident /
transient error), the Worker applies the configured failure policy (4e). Postgres `usage_events` is a
secondary durable log used to *rebuild* a DO counter if storage is ever lost: on cold start a DO can
lazily hydrate its window total from a Supabase aggregate query (`SUM(cost_usd) WHERE key_id=… AND
ts >= window_start`). This makes Postgres the recovery backstop without putting it on the hot path.

### (e) Fail-closed (paid) vs fail-open (OSS opt-in)
**Decision:**
- **Hosted/paid:** `FAILURE_MODE=closed` by default. If the DO can't be reached or a decision can't be
  made, **block** (402 with `type: "enforcement_unavailable"`). Safety-first is the brand promise.
- **OSS self-host:** `FAILURE_MODE=open` by default (don't break the user's app if their self-hosted
  metering hiccups), but a single env/config flag flips it to `closed`. Documented prominently.
- The policy is a single config value read at the Worker boundary; both modes are covered by tests.

---

## 5. Data Model (Supabase / Postgres)

All tables carry `org_id`; **RLS** restricts every row to `auth.uid()`'s org. Service-role (the
Worker) bypasses RLS for ingest writes only.

```sql
-- users / orgs (Supabase auth backs auth.users; we keep an orgs + membership layer)
orgs            (id pk, name, plan_id fk→plans, created_at)
memberships     (id pk, org_id fk, user_id fk→auth.users, role[owner|member], created_at)
                -- RLS: user can read orgs where a membership row exists for auth.uid()

-- customer Anthropic keys (the secret we proxy with)
api_keys        (id pk, org_id fk, label, fuseguard_key_hash UNIQUE, -- hash of the FG key clients send
                 anthropic_key_ciphertext bytea,  -- AES-GCM encrypted customer key, NEVER returned
                 anthropic_key_iv bytea, key_version int, is_active bool,
                 created_at, last_used_at)
                -- RLS: org-scoped. ciphertext column never exposed to anon/authenticated role (column grant).

budgets         (id pk, org_id fk, scope[key|session], scope_ref,  -- key_id or session string (null=all)
                 limit_type[usd|tokens], limit_value numeric, window[rolling|daily|total],
                 window_seconds int, is_active bool, created_at)
                -- RLS: org-scoped.

usage_events    (id pk, org_id fk, api_key_id fk, session text null, model text,
                 input_tokens int, output_tokens int, cache_read_tokens int, cache_write_tokens int,
                 cost_usd numeric, status[ok|upstream_error], request_hash text, ts timestamptz)
                -- index (org_id, ts), (api_key_id, ts). RLS: org-scoped read. No prompt/response body.

blocks          (id pk, org_id fk, api_key_id fk, session text null,
                 reason[budget_exceeded|loop_detected|enforcement_unavailable], scope[key|session],
                 budget_id fk null, projected_usd numeric, current_usd numeric, ts timestamptz)
                -- RLS: org-scoped read.

plans           (id pk, name[free|pro], price_usd, max_keys int, features jsonb)
subscriptions   (id pk, org_id fk UNIQUE, lemon_squeezy_subscription_id, plan_id fk,
                 status[active|past_due|cancelled], renews_at, created_at, updated_at)
                -- written ONLY by the verified Lemon Squeezy webhook (service role).
```

**RLS notes:** every read path goes through `org_id = current org of auth.uid()`. The
`anthropic_key_ciphertext`/`iv` columns are granted to the service role only (Worker), never to the
`authenticated` role, so a compromised dashboard session cannot exfiltrate customer keys.

---

## 6. Security Architecture

- **Customer key encryption:** AES-256-GCM. Master key held as a **wrangler secret**
  (`FG_MASTER_KEY`), never in repo/bundle. Per-key random IV stored alongside ciphertext.
  `key_version` enables rotation. Plaintext customer key exists only transiently in Worker memory
  during a forward; never logged, never persisted, never returned after creation.
- **FuseGuard API keys (what clients send):** random, shown once at creation, stored only as a hash
  (`fuseguard_key_hash`). Lookups by hash.
- **SSRF allowlist:** the Worker forwards exclusively to `https://api.anthropic.com`. The upstream host
  is a compile-time constant, never derived from request input. Any header/param attempting to
  redirect upstream is ignored. (v0.2 multi-provider expands the allowlist to a fixed enum, still no
  user-supplied URLs.)
- **Webhook verification:** Lemon Squeezy `X-Signature` HMAC-SHA256 verified against
  `LEMON_SQUEEZY_WEBHOOK_SECRET` (wrangler secret) before any plan mutation; constant-time compare;
  reject + log on mismatch.
- **Input validation:** zod schemas at the Worker boundary for budget config, session header format
  (`^[A-Za-z0-9_\-:.]{1,128}$`), and request body shape. Reject malformed early with 400.
- **Secrets:** all secrets via wrangler secrets (Worker) / Supabase env. Nothing in the client bundle.
  Supabase anon key is public by design; service-role key is Worker-only.
- **Error hygiene:** 402/4xx messages are user-safe; no stack traces, internal paths, or upstream
  keys ever leak to the client. Detailed errors go to Worker logs only.

---

## 7. Open-Core Code Split

```
fuseguard/
├── packages/
│   ├── core/            # MIT / OSS  ── the proxy that holds the key MUST be inspectable
│   │   ├── proxy/       #   request handling, forward, SSRF allowlist, fail-open/closed switch
│   │   ├── pricing/     #   model pricing table + estimation + cost reconciliation
│   │   ├── budget-do/   #   Durable Object counter + reserve/reconcile + concurrency logic
│   │   ├── loop/        #   loop-detection ring buffer + hash (engine is OSS; gated by plan at edge)
│   │   └── crypto/      #   AES-GCM key encryption helpers
│   └── hosted/          # PROPRIETARY ── the business
│       ├── billing/     #   Lemon Squeezy webhook, plan/tier enforcement
│       ├── team/        #   memberships, invites, roles
│       ├── alerts/      #   email/webhook alerting on blocks
│       └── dashboard/   #   Next.js app (full hosted UI, top-spenders, drill-down)
└── ...
```

**Rule of thumb:** anything required to *self-host a working enforcing proxy* is MIT (proxy, pricing,
DO counter, loop engine, crypto). Anything that is the *managed business* — billing, team, alerts,
the hosted dashboard, plan gating — is proprietary. The loop *engine* is OSS (transparency/trust);
loop detection as a *productized feature* is gated to paid at the edge in `hosted/`.

---

## 8. Deployment Topology

| Env | Branch | Worker | Pages | Supabase | Billing |
|---|---|---|---|---|---|
| **Staging** | `develop` | `fuseguard-proxy-staging` | preview deploy | staging project | LS test mode |
| **Prod** | `main` | `fuseguard-proxy` | prod deploy | prod project | LS live mode |

- **Promotion:** feature branch → PR into `develop` (auto-deploy staging) → soak → PR `develop`→`main`
  (auto-deploy prod). Matches the existing `main` / `develop` branch setup.
- **Secrets (wrangler, per env):** `FG_MASTER_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_URL`,
  `LEMON_SQUEEZY_WEBHOOK_SECRET`, `FAILURE_MODE`, `ANTHROPIC_UPSTREAM` (constant).
- **Durable Objects:** declared in `wrangler.toml` with migrations; one namespace, instances keyed by
  budget scope. DO bindings differ per env.
- **CI:** GitHub Actions — lint + typecheck + vitest (incl. DO + concurrency tests via Miniflare/
  workerd) must pass before deploy. `cloud-admin` owns env/secret provisioning; `dev` owns app code.
