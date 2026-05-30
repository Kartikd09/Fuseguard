# Self-Hosting FuseGuard

> Run the FuseGuard proxy on **your own** Cloudflare account. Your Anthropic API key
> never leaves your infrastructure. This is the core trust promise: the code that holds
> your key is open source (MIT) and runs where you control it.

FuseGuard's proxy core is MIT-licensed. Self-hosting gives you the full enforcement engine
— per-key/session budgets, hard kill, loop detection — for free. The hosted version
([fuseguard.app](https://github.com/Kartikd09/Fuseguard)) just adds a managed dashboard,
team features, and alerts on top.

## What you get self-hosting (free)
- Drop-in Anthropic proxy with **runtime budget enforcement** (hard-block before overspend)
- Per-key and per-session budgets
- Runaway-loop detection + kill
- Your key, your Cloudflare, your data — nothing sent to us

## Prerequisites
- A [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier is enough to start)
- Node.js 20+
- An Anthropic API key

## Quick start (≈5 minutes)

```bash
# 1. Clone
git clone https://github.com/Kartikd09/Fuseguard.git
cd Fuseguard
npm install

# 2. Configure (copy the example, fill in your values)
cp .env.example .dev.vars        # local dev secrets (gitignored)

# 3. Set the master key used to encrypt stored API keys (32 bytes, base64)
openssl rand -base64 32          # copy the output into FG_MASTER_KEY in .dev.vars

# 4. Run locally
npm run dev:proxy                # wrangler dev — proxy at http://localhost:8787
```

Point your Anthropic client's `base_url` at the local proxy:

```python
from anthropic import Anthropic

client = Anthropic(
    api_key="fg_your-chosen-key",          # your FuseGuard key (matches SELFHOST_FUSEGUARD_KEY_HASH)
    base_url="http://localhost:8787/v1",   # FuseGuard proxy
)
# FuseGuard authenticates the FG key, enforces your budget, then forwards with your
# real Anthropic key (SELFHOST_ANTHROPIC_KEY). Your real key never leaves the proxy.
```

## Deploy to Cloudflare (production)

```bash
# Authenticate wrangler with your Cloudflare account
npx wrangler login

# Set production secrets (NEVER commit these)
npx wrangler secret put FG_MASTER_KEY
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY   # only if using the dashboard/DB layer

# Deploy
npm run build
npx wrangler deploy
```

Your proxy is now live at `https://fuseguard-proxy.<your-subdomain>.workers.dev`.
Point your client's `base_url` there.

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Kartikd09/Fuseguard)

## Configuration

All config is via environment variables / wrangler secrets. See [`.env.example`](../.env.example)
for the full list. Key ones:

| Variable | Purpose | Secret? |
| --- | --- | --- |
| `SELFHOST_FUSEGUARD_KEY_HASH` | SHA-256 hex of the FuseGuard key clients must present | **Yes** |
| `SELFHOST_ANTHROPIC_KEY` | Your Anthropic key the proxy forwards with | **Yes** |
| `SELFHOST_BUDGET_USD` | Budget ceiling in USD (e.g. `25`). Must be a positive number | **Yes** |
| `FG_MASTER_KEY` | 32-byte base64 key — encrypts stored keys at rest (Phase 2 DB mode) | Phase 2 |
| `ANTHROPIC_UPSTREAM` | Upstream host (default `https://api.anthropic.com`) | No |
| `FAILURE_MODE` | `closed` (block on uncertainty) or `open`. Default `closed` | No |

> **Fail-closed by design:** if the `SELFHOST_*` config is missing, or the presented key
> doesn't match, the proxy **blocks** the request rather than forwarding unprotected.
>
> Set up the single-tenant self-host config:
> ```bash
> # 1. Pick a FuseGuard key your clients will send, then hash it:
> echo -n "fg_your-chosen-key" | sha256sum   # → put the hex in SELFHOST_FUSEGUARD_KEY_HASH
> # 2. Set the secrets:
> npx wrangler secret put SELFHOST_FUSEGUARD_KEY_HASH
> npx wrangler secret put SELFHOST_ANTHROPIC_KEY
> npx wrangler secret put SELFHOST_BUDGET_USD
> ```

### Fail-open vs fail-closed
Self-hosters who'd rather never break their own app can set `FAILURE_MODE=open` — if the
budget counter is briefly unreachable, calls pass through instead of being blocked. The
hosted service defaults to `closed` (safety first). Your infra, your choice.

## Security notes
- Your Anthropic key is encrypted at rest (AES-256-GCM) with `FG_MASTER_KEY`. Keep that key safe.
- The proxy only ever forwards to `api.anthropic.com` (SSRF-locked, compile-time constant).
- FuseGuard never logs prompt or response bodies — only token counts and metadata.

## Upgrading to hosted
Don't want to run infra? The hosted tier ($19/mo) gives you the same enforcement plus a
managed dashboard, team members, and alerts — with zero deployment. Self-host and hosted
run the identical MIT proxy core.
