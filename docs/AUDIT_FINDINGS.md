# Pre-Launch QA Audit — Findings & Status

Two independent Opus audits (pr-test-analyzer) run 2026-05-31. Findings tracked here.

## Fixed

- **C3 (CRITICAL) — unlimited spend when no budget configured.** `lookupKey` returned
  `limitUsd: Infinity` when a key had no budget → zero enforcement (the default for new
  accounts). Fixed: `hasBudget` flag threaded to the proxy; no budget ⇒ fail-closed (block
  with `no_budget` 402) or fail-open (forward unmetered, OSS opt-in). Migration 0005 adds
  the `no_budget` block reason. Tests added.
- **Pro-tier key-limit UI bug.** `CreateKeyButton` hardcoded `keyCount >= 1`; Pro users with
  1 key wrongly saw the upgrade nudge. Fixed: reads plan `max_keys` (−1 = unlimited).

## Fixed — second pass (2026-05-31, deferred findings + review nits)

Implemented via 3 parallel dev agents + Opus code-review + security-review. 168 tests green, tsc + lint clean.

- **C1 (CRITICAL) — session budgets wired.** `lookupKey`/`lookupKeyFromSupabase` thread a
  validated `sessionId` (`x-fuseguard-session`, shared `SESSION_ID_PATTERN`); a `scope:"session"`
  budget resolves `budget:session:<org>:<sid>` DO. Session + key budgets both enforced (lower blocks).
- **C2/H3 (HIGH) — reservation orphan + durable stream reconcile.** `Reservation.createdAt` +
  `RESERVATION_TTL_MS`; `totalReserved` excludes stale holds (self-heal), `pruneReservations`
  drops them from storage on reserve (bounded). `ExecutionContext` threaded; stream reconcile
  wrapped in `ctx.waitUntil`.
- **M3 — emitEvent durability.** `makeEmitter` wrapped in `ctx.waitUntil`; keyId captured at
  call-site (not lazily in the microtask) so events keep the correct key association.
- **H4/M1 — webhook TOCTOU + grace period.** Replaced read-then-write with atomic RPC
  `apply_subscription_event` (migration 0008) — `WHERE excluded.updated_at > subscriptions.updated_at`
  closes the TOCTOU window; `orgs.plan_id` sync gated on `row_count > 0` so a stale replay can't
  move the plan. `isGracePeriodStatus` keeps Pro on `past_due`/`paused` (no immediate downgrade).
- **H1 — self-host telemetry FK.** Self-host `keyId = null`; `makeEmitter` omits `api_key_id`
  when null. Migration 0006 makes `usage_events.api_key_id` + `blocks.api_key_id` nullable.
- **H2/H4 — member fallback + org switcher.** `resolveActiveOrgId` drops the owner-only filter
  (owner-preferred, any-membership fallback); reads + validates `fg_active_org` cookie. New
  `OrgSwitcher` + `/api/active-org` route (membership validated server-side w/ explicit
  `user_id` filter — IDOR defense-in-depth).
- **M-series — rate_limits cleanup.** Migration 0007 adds `cleanup_rate_limits()` + pg_cron job.

## Deferred (tracked — fix before scaling / team launch)

- **Grace-period unbounded (MEDIUM).** `past_due`/`paused` keeps Pro forever if Lemon Squeezy
  never delivers a terminal event. **Fix:** scheduled job to downgrade orgs stuck in
  `past_due`/`paused` beyond N days (reuse pg_cron from migration 0007), or reconcile vs LS API.
- **Migration QA before `db push`** — migration 0007 pg_cron may be unavailable on free tier
  (wrap `cron.schedule` in exception block); make `cron.schedule` idempotent (`unschedule` first).
- **M-series / L-series** — `max_tokens` upper bound, `last_used_at` never written, loop-buffer
  O(n) growth, poll backoff on hidden tabs.

## Confirmed correct (verified by both audits)
SSRF lockdown, AES-GCM fail-closed, mid-pipeline DO failure fails closed, stream-disconnect
reconciles to worst-case (not 0), webhook HMAC constant-time + org_id DB check, DB-backed rate
limiter (edge-safe), API key-limit DB trigger (TOCTOU-safe), reconcile idempotency.
