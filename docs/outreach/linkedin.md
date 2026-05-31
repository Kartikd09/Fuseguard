# LinkedIn post

> Note: Post only after Google OAuth is published if linking the dashboard; this version links
> GitHub so it's safe to post now.

---

```
A single AI agent looped for 11 days and burned ~$47,000.

The team had dashboards, Slack alerts, and a spend cap. None of it stopped the loop.

Here's the uncomfortable part: every one of those tools reacts *after* the money is spent. An
alert at 95% tells you 95% of the budget is already gone. A provider spend cap reconciles on
its own schedule, so a runaway loop can blow past it before it ever trips. Observability tells
you what happened. It can't say "no."

So I built the thing I wished they'd had.

FuseGuard is an open-source proxy that sits between your app and the Anthropic API. You set a
hard budget per key or session. Before each call, it checks whether that call would breach the
budget — and if it would, it blocks the request (HTTP 402) instead of forwarding it. It also
detects and kills runaway loops. Enforcement, not observability. A spend firewall for AI agents.

Integration is one line: point your client's base_url at the proxy.

Honest about where it is: it's Anthropic-only today and single-tenant, with an
OpenAI-compatible gateway and per-user/per-agent budgets next on the roadmap. The proxy is MIT
and you can self-host it right now. 🔧

I'd love a gut check from people shipping AI in production: would a hard kill-switch have saved
you from a bad bill — or is blocking calls too aggressive, and what am I missing?

Repo (self-host today): https://github.com/Kartikd09/Fuseguard
(Managed beta dashboard — comment or DM for early access.)
```

## Hashtags

#AIagents #LLMOps #OpenSource #AIengineering #FinOps #DevTools
