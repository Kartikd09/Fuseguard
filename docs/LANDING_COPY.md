# Landing Page Copy (draft)

Copy + structure for the FuseGuard landing page (Phase 5). Lead with the $47k hook;
sell enforcement-not-observability; push self-host as the trust wedge.

---

## Hero
**Headline:** The circuit breaker for AI agents.
**Sub:** Set a budget. FuseGuard kills the call *before* it breaks it — not a $47,000 bill later.
**CTA primary:** Self-host free → (GitHub)
**CTA secondary:** Start hosted — $19/mo →
**Micro-trust line:** Open-source · your API key never leaves your infrastructure.

## The hook (section 1)
> An AI agent looped for **11 days** and ran up a **$47,000** bill.
> The team had a dashboard. Slack alerts at 50/80/95%. A provider spend cap.
> **None of them stopped it.**
>
> Alerts fire *after* the money's gone. Provider caps reconcile too late.
> FuseGuard refuses the *next* call, synchronously, before it's sent.

## Enforcement vs observability (section 2 — the wedge)
| | LangSmith / Helicone / Langfuse | **FuseGuard** |
| --- | --- | --- |
| Shows you spend | ✅ | ✅ |
| **Stops** the spend | ❌ | ✅ |
| Blocks before the call | ❌ | ✅ |
| Kills runaway loops | ❌ | ✅ |
| One-line integration | — | ✅ `base_url` |

**Tagline:** They watch. We stop.

## How it works (section 3)
1. **Point your `base_url` at FuseGuard.** One line. No SDK rewrite.
2. **Set a budget** — per key or per agent session, in $ or tokens.
3. **FuseGuard enforces it** — projects each call's worst-case cost and hard-blocks before a breach. Runaway loops are detected and killed.

```python
client = Anthropic(api_key="sk-...", base_url="https://fuseguard.app/v1",
                   default_headers={"x-fuseguard-key": "fg_..."})
```

## Trust (section 4)
- **Open-source core (MIT).** The code that handles your key is inspectable.
- **Self-host it.** Run the proxy on your own Cloudflare — your key never touches our servers.
- **We never log your prompts or responses.** Token counts and metadata only.

## Pricing (section 5)
| Free / Self-host | Pro — $19/mo |
| --- | --- |
| 1 key, budget enforcement, hard kill | Unlimited keys + sessions |
| Self-host the full engine | Loop detection, team, alerts |
| Community support | Managed dashboard, no infra |

## Social proof (section 6 — fill post-launch)
- ⭐ GitHub stars counter
- 💰 **Live "dollars prevented"** counter (aggregate blocked overspend)
- Quotes from early users

## Footer CTA
**Stop watching your AI bill. Start stopping it.**
[Self-host free] · [Start hosted]

---

### SEO / meta
- Title: `FuseGuard — the circuit breaker for AI agents`
- Description: `Drop-in proxy that hard-blocks AI agent overspend before it happens. Open-source. Enforcement, not just observability.`
- Keywords: AI agent cost control, LLM budget enforcement, token budget, runaway agent loop, LangChain cost, CrewAI cost, Anthropic proxy
