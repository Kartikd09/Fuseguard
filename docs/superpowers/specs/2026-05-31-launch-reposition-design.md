# Launch Reposition + Validation Kit — Design

**Date:** 2026-05-31
**Goal:** Make FuseGuard demoable and ready for first public validation, without building any new product features. Reposition the public surface (landing + README) to be beta-first and honest, and produce ready-to-send outreach copy (DMs, Show HN, LinkedIn) so the founder can start the 10-builder validation loop from the Phase-2 revamp doc (§15, §23).

**Explicit non-goal:** No OpenAI-compatible gateway, no multi-tenant budget scopes, no new code paths. Those are the real moat work — but they come *after* validation signal, not before. This spec is copy + docs only.

---

## Context

- Current product (shipped, live): Anthropic-only drop-in proxy, per-key + per-session hard budgets, pre-call 402 block, loop detection (Pro), reservation/reconcile, encrypted keys, dashboard.
- Phase-2 revamp doc is strategically right ("spend firewall, not observability") but tactically premature — it asks to rebuild what's largely built and lists validation last. We invert: validate first, build the OpenAI-compat moat only on signal.
- Blocker for hosted signups: Google OAuth is in Testing mode → strangers can't log in. **Therefore posts point at the GitHub repo (self-host works today, no login), not the dashboard.**

## Decisions (locked with founder)

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | CTA → beta-first, no card | Zero validation signal; paid CTA kills top-of-funnel before trust exists (revamp §7.2). |
| 2 | Positioning → honest-now firewall framing | Add "spend firewall" framing but claim ONLY what ships today. Multi-tenant + OpenAI-compat go to a roadmap section, never the hero. Avoids the #1 risk: a builder tries it, finds it doesn't match the promise, bounces (§0.8 Risk 1 Trust). |
| 3 | Pricing → hide the number, keep Free/Pro tiers | Willingness-to-pay is the thing we're validating (§0.10 Q10). Printing $15 answers our own research question and anchors. Also fixes the live $15-vs-README-$19 inconsistency for free. |
| 4 | Post links → GitHub repo | Self-host works today, no OAuth gate. Technical audience prefers cloning over handing a stranger their Anthropic key (trust). Hosted = "DM for beta access." |
| 5 | LinkedIn + Show HN written natively | Opposite voices — LinkedIn = founder story/hook; HN = dry/technical/humble. Not one recycled into both. |

## Honesty bugs to fix while in here (found during review)

1. Landing pricing card: `Pro — $15/mo` + big `$15` → replace with beta language (decision 3).
2. Hero CTA `Start hosted — $15/mo` → beta CTA (decision 1).
3. Landing code sample line 167: `base_url="https://fuseguard.app/v1"` — `fuseguard.app` is NOT live, and `/v1` implies OpenAI-compat which we don't ship. Replace with the real live proxy URL `https://fuseguard-proxy.kartikds009.workers.dev`. (README already uses `fuseguard-proxy.workers.dev` shape.)
4. README pricing table `Pro — $19/mo` → match decision 3 (no number, beta).

---

## Deliverables

### 1. Landing page reposition — `packages/hosted/dashboard/src/app/page.tsx`

Surgical edits, keep all existing structure/animations/components. Changes:

- **Hero `<h1>`:** keep "The circuit breaker for AI agents." (strong, honest, already good) — OR soften-sharpen to add firewall framing in the sub-line. Sub-line gains a "spend firewall" phrase but no false multi-tenant claim.
- **Hero CTA pair:** primary `Self-host free` (→ GitHub, unchanged) · secondary `Try the hosted beta` (→ /login) replacing `Start hosted — $15/mo`. Add small "Free during beta · no card" line.
- **Code sample:** fix `base_url` to the real live proxy URL; drop `/v1`.
- **Pricing section:** keep two cards. Free card unchanged. Pro card: remove `$15` number + "Pro — $15/mo" label; relabel "Pro — coming after beta", keep feature list, change button to "Join the beta" (→ /login) or remove button (founder choice in review). Add one line under the grid: "Pricing finalized with our first users — that's what the beta's for."
- **New tiny roadmap line** (optional, low cost): one sentence under How-it-works — "Today: Anthropic, per-key & per-session budgets. Next: OpenAI-compatible + per-tenant/user budgets." Sets honest expectations and signals trajectory.

Acceptance: no dollar figure on the page; no claim the product doesn't ship; CTA is no-card beta; code sample uses a URL that actually responds.

### 2. README sync — `README.md`

- Pricing table: drop `$19/mo`, replace with Free / Pro (beta) framing matching the landing.
- Add a one-line honest "Status: public beta — Anthropic today, OpenAI-compat + multi-tenant on the roadmap" near the top or in Status section.
- Keep the $47k hook, the one-line integration, the comparison — all strong.

### 3. Outreach DM templates — `docs/outreach/validation-dms.md` (new)

- 3–4 channel-tailored short messages: r/LocalLLaMA, indie AI-SaaS founder DM, Twitter/X reply-or-DM, cold email.
- The 10 validation questions verbatim from revamp §0.10.
- A note: goal is conversation, not a pitch; link = GitHub.

### 4. Show HN post — `docs/outreach/show-hn.md` (new)

- Title: `Show HN: FuseGuard – hard budget kill-switch for AI agents (open source)`
- Body: dry, technical, humble, first-person, no marketing words. The $47k motivation, what it does, what it does NOT do yet (Anthropic-only, single-tenant), self-host link, ask for feedback.
- A prepared first-comment with technical detail (architecture: CF Worker + Durable Object reserve/reconcile, why pre-call beats alerts).

### 5. LinkedIn post — `docs/outreach/linkedin.md` (new)

- Founder-story voice, strong first 2 lines (before "see more" fold), the $47k hook, "I built an open-source kill-switch", link to GitHub, soft ask ("would this have saved you? what am I missing?"). Light formatting, ≤1 emoji.

---

## What gets committed where

| Artifact | Path | Type |
|----------|------|------|
| Landing edits | `packages/hosted/dashboard/src/app/page.tsx` | code (copy) |
| README sync | `README.md` | docs |
| DM kit | `docs/outreach/validation-dms.md` | new docs |
| Show HN | `docs/outreach/show-hn.md` | new docs |
| LinkedIn | `docs/outreach/linkedin.md` | new docs |
| This design | `docs/superpowers/specs/2026-05-31-launch-reposition-design.md` | spec |

## Test / verification plan

- Landing: `cd packages/hosted/dashboard && npx tsc --noEmit` clean; visually grep that no `$15`/`$19`/`fuseguard.app` strings remain in page.tsx; `npm run dev` and eyeball hero + pricing.
- README: grep no stray price; links resolve.
- Posts: founder reads for voice; nothing auto-sent. Posts held until founder publishes Google OAuth + (for hosted link, if ever used) verifies non-test login. GitHub link works today regardless.

## Visual redesign — developer-terminal direction (added after founder review)

Decision: **full glow-up**, dev-terminal aesthetic, + a new SVG logo. Reuse existing tokens
(`--primary` #E84C30, Inter/JetBrains-mono, shadcn vars, grid+glow+fluid trail, fg-reveal/hero
animations). Keep the page server component + all current sections; restyle in place. All new
visual elements must respect `prefers-reduced-motion` and keep the `<noscript>` content-visible
override working.

### V1. New SVG logo — `src/components/landing/Logo.tsx` (new)
Replace the lucide `Zap`-in-a-square (page.tsx nav + footer). Monoline "blown fuse / circuit
break" mark: a horizontal circuit trace entering from the left, a deliberate gap (the blown
fuse) mid-stroke, framed by a subtle shield/bracket. Single color via `currentColor` so it
themes with `--primary`. Props: `className`/size. Used in nav (with wordmark) + footer.
Acceptance: crisp at 20–40px, no external asset, inherits brand color.

### V2. Hero — stat tiles + sharper type
- Keep `<h1>` "The circuit breaker for AI agents." Sub-line adds "spend firewall" framing.
- Add a 3-tile stat row under the hook (or in hero): `11 days` · `$47K` · `0 calls stopped`
  — mono numerals, thin borders, faint inner glow. Makes the stakes scannable.
- Eyebrow badge stays ("Enforcement, not observability").

### V3. Terminal-chrome code block + live 402 card
- Wrap the code sample in faux terminal chrome: top bar with 3 traffic-light dots + a
  mono filename tab (`quickstart.py`), monospace body, subtle inner shadow, sharp 1px border.
- Beside/under it, a **402 block response card**: red status dot + `402 budget_exceeded`,
  rows `scope` / `limit $10.00` / `spent $9.94` / `decision: blocked`, mono, danger-tinted
  border. This is the product's whole pitch in one glance.
- Fix the `base_url` to the real live proxy URL; drop `/v1` (honesty bug #3).

### V4. Comparison → spec grid
Restyle the They-watch/We-stop table as a sharp spec grid: mono row labels, primary check vs
muted X, hover row tint, tighter borders. Same data (WEDGE_ROWS), better texture.

### V5. Pricing cards redesign
Two cards, dev-tool styling (mono tier labels, sharp borders, primary accent on the Pro card).
Free card: unchanged content. Pro card: **no `$15`, no number** — label "Pro · managed beta",
keep feature list, button → "Join the beta" (→ /login). One line under grid: "Pricing finalized
with our first users — that's what the beta's for." (honesty bug #1).

### V6. Section rhythm
Consistent vertical rhythm, section eyebrow labels (mono, uppercase, tracked) above each `<h2>`,
slightly varied section bg tints so sections read as distinct bands instead of one flat column.

### Verification (visual)
`tsc --noEmit` clean · grep page.tsx for `$15`/`$19`/`fuseguard.app` → none · `npm run dev` →
load in Claude-in-Chrome, verify hero/terminal/402-card/pricing render, fluid trail still works,
reduced-motion still guards, mobile (narrow) not broken. Iterate in-browser.

## Out of scope (deliberately deferred)

- OpenAI-compatible gateway, multi-tenant/agent/workflow budget scopes, `x-fuseguard-*` headers, fail-open/closed toggle, request-logs-by-tenant view, demo GIF recording, validation tracking sheet. Build the moat after ≥3 "I'd try it."
