# Pre-Launch Checklist

Status as of 2026-05-31. Phases 0–5 complete + live on Cloudflare Workers with CD.
This is the runway from "built" to "public launch (Phase 6 — Distribute)".

**Live now:**
- Dashboard — https://fuseguard.kartikds009.workers.dev
- Proxy — https://fuseguard-proxy.kartikds009.workers.dev
- CD: merge to `main` → `deploy.yml` auto-deploys both Workers

Legend: ⬜ todo · ✅ done · 🔶 optional / nice-to-have

---

## 1. Auth — BLOCKER (public can't log in until done)

### ⬜ Google OAuth — publish (Testing → Production)
Currently in **Testing mode** → only allowlisted test-user emails can sign in. Public users are blocked.

1. Google Cloud Console → https://console.cloud.google.com/apis/credentials
2. **OAuth consent screen** → **Publishing status** → **Publish app**
3. If it requires verification (logo, scopes, domain), submit — can take a few days for sensitive scopes. FuseGuard only needs `email` + `profile` (non-sensitive) → usually instant or no verification.
4. **Verify:** sign in with a non-test-user Google account on the live dashboard.

### ⬜ Supabase auth redirect URLs — confirm Workers domain
https://supabase.com/dashboard/project/omywdgbasfisgftktxij/auth/url-configuration
- **Site URL** = `https://fuseguard.kartikds009.workers.dev` (or custom domain once set)
- **Redirect URLs** include `https://fuseguard.kartikds009.workers.dev/**`
- Keep `http://localhost:3000/**` for dev.
- (Already set this session — just re-verify after any domain change.)

### ✅ Login lands on dashboard / sign-out → landing
Verified working. Sign-out routes to `/` (landing), not `/login`.

---

## 2. Billing — BLOCKER for real revenue

### ⬜ Lemon Squeezy — live mode
Currently **test mode** (no real payments). Needs:
- GST / KYC completed on the LS account (your external task)
- Switch store to live mode
- Update the live `$15/mo Pro` product + variant IDs if they differ from test
- Update `LEMON_SQUEEZY_WEBHOOK_SECRET` (live secret) as a Worker secret
- **Verify:** real card → checkout → webhook → org upgrades to Pro → `apply_subscription_event` RPC runs (now live in prod DB).

### ✅ Webhook RPC live
`apply_subscription_event` applied to prod DB (migration 0008). The deployed Worker's webhook calls it.

### ✅ Grace-period downgrade job
`downgrade_expired_grace()` daily pg_cron live (migration 0009). past_due > 7 days → free.

---

## 3. Domain & polish — recommended before HN

### 🔶 Custom domain
`fuseguard.kartikds009.workers.dev` is fine but unbranded for launch. If you own `fuseguard.app` (or similar):
1. Cloudflare dashboard → Workers → `fuseguard` Worker → **Settings → Domains & Routes** → add custom domain
2. Same for the proxy Worker if you want a branded proxy URL
3. **Update after:** Supabase redirect URLs (§1), landing page copy if it hardcodes the URL, the `base_url` example in the landing code block (currently shows `https://fuseguard.app/v1`)

### ⬜ Delete orphaned CF Pages project
The old `fuseguard.pages.dev` Pages project is orphaned (we migrated to Workers via OpenNext). Delete it in the CF dashboard to avoid confusion.

### 🔶 README quickstart polish
Make sure the repo README has a clean 60-second quickstart (point `base_url`, set budget, done) — first thing HN/Reddit visitors read.

---

## 4. Security — effectively clean (free-tier limits noted)

### ✅ Supabase advisors: 10 → 2, both accept-risk
- SECURITY DEFINER fns locked down (migration 0010).
- ⬜ **leaked-password protection** — Supabase **Pro-only** (we're free tier). Only affects email+password; we're OAuth/magic-link primary → accept-risk. Revisit if/when on Supabase Pro.
- `rate_limits` RLS-no-policy — INFO, intentional (table locked to service_role).

### ✅ Proxy hardening
Audit findings fixed: fail-closed no-budget default, reservation TTL, webhook TOCTOU (atomic RPC), rate limiting, replay guard. 168 tests green.

### 🔶 Re-run advisors after any DDL
`mcp supabase get_advisors` (security + performance) after future migrations.

---

## 5. Known deferred tech debt (not launch blockers)

- ⬜ **vitest 2 → 4** bump — npm platform-dep lockfile issue (vite 7 esbuild/lightningcss). Deferred; CI runs fine on vitest 2.
- ⬜ **Dependabot 2 MEDIUM** — both accept-risk (vite false-positive on 5.4.21; postcss build-time via next's vendored copy). Clears when next bumps postcss.
- 🔶 **Lapsed-Pro key pruning** — downgrading an org to free doesn't delete its existing >1 keys (the limit trigger only fires on INSERT). Product decision whether to prune on downgrade.

---

## 6. Phase 6 — Distribute (the launch itself)

Once §1 + §2 are green:
- ⬜ Show HN post (lead with the $47k hook — "enforcement, not observability")
- ⬜ r/LocalLLaMA
- ⬜ Build-in-public funnel (signup → first proxied call → first block → paid)
- ⬜ Monitor: signups, first-block events, conversion

---

## Launch-gate summary

**Must be green before public launch:** §1 (Google OAuth publish + redirect URLs).
**Must be green before charging real money:** §2 (LS live mode).
**Strongly recommended:** §3 custom domain + delete orphaned Pages project.

Everything else (code, DB, infra, CD, security hardening) is **done and live**.
