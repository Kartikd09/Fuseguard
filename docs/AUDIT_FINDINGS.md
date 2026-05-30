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

## Deferred (tracked — fix before scaling / team launch)

- **C1 (CRITICAL for the feature) — session budgets never enforced.** `sessionDO` is hardcoded
  `null` in `lookupKeyFromSupabase`. A `scope:"session"` budget is a silent no-op. Either wire
  session DOs (thread validated sessionId into lookup, resolve `budget:session:<org>:<sid>` DO)
  or hide session-scope in the dashboard until wired. **Action:** hide session scope in UI now;
  wire DO before advertising per-session budgets.
- **C2 / H3 (HIGH) — reservation orphan on worker crash mid-flight.** No reservation TTL; a
  crash between reserve and reconcile leaks the hold forever, slowly bricking the key. Streaming
  reconcile runs in a detached async IIFE without `ctx.waitUntil`. **Fix:** add `createdAt` + TTL
  prune in `totalReserved`; thread `ExecutionContext` and wrap stream reconcile in `ctx.waitUntil`.
- **H1 (HIGH) — self-host usage telemetry lost.** Self-host `keyId = keyHash.slice(0,36)` is not
  a valid `api_keys` uuid → `usage_events` FK insert fails silently. **Fix:** make `api_key_id`
  nullable for self-host, or insert a synthetic key row.
- **H2/H4 (HIGH) — member-only users locked out; multi-org no switcher.** `resolveActiveOrgId`
  filters `role='owner'` only. Team members (Pro feature) get 403 everywhere. **Fix before team
  launch:** fall back to any membership (owner-preferred); add org switcher.
- **H4/M1 — webhook replay TOCTOU + paused→free downgrade.** Move replay guard into a DB
  conditional upsert (`WHERE updated_at < excluded.updated_at`). Treat `past_due`/`paused` as a
  grace period, not immediate free downgrade.
- **M3 — usage `emitEvent` fire-and-forget can drop on isolate teardown.** Wrap in `ctx.waitUntil`.
- **M-series / L-series** — `max_tokens` upper bound, `last_used_at` never written, loop-buffer
  O(n) growth, rate_limits table cleanup (pg_cron), poll backoff on hidden tabs.

## Confirmed correct (verified by both audits)
SSRF lockdown, AES-GCM fail-closed, mid-pipeline DO failure fails closed, stream-disconnect
reconciles to worst-case (not 0), webhook HMAC constant-time + org_id DB check, DB-backed rate
limiter (edge-safe), API key-limit DB trigger (TOCTOU-safe), reconcile idempotency.
