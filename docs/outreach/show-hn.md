# Show HN

**Title** (keep under ~80 chars):

```
Show HN: FuseGuard – hard budget kill-switch for AI agents (open source)
```

---

## Body

```
I built FuseGuard after reading about a LangChain agent that looped for ~11 days and cost
about $47,000. The team had a dashboard, Slack alerts at 50/80/95%, and a provider-side spend
cap. None of it stopped the loop, because alerts and provider caps both react after the money
is already spent.

FuseGuard is a drop-in proxy between your app and the Anthropic API. You set a hard $ or token
budget per key or per session (daily, rolling, or total). Before each call, it estimates the
worst-case cost and reserves it; if that would breach the budget it returns a 402 and never
forwards the request. It also kills loops — N near-identical calls within T seconds. It stores
no prompt or response bodies, encrypts provider keys at rest (AES-256-GCM), and hashes
FuseGuard keys.

Integration is one line: point your Anthropic client's base_url at the proxy and use an
fg_live_ key.

What it doesn't do yet: it's Anthropic-only, single-tenant (no per-user/per-agent scopes), and
an OpenAI-compatible gateway is the next thing on the list. The proxy is MIT and self-hostable.

Repo: https://github.com/Kartikd09/Fuseguard

I'd genuinely like feedback on the core bet: is pre-call blocking the right model, or do you
think hard 402s in production are too aggressive and alerting is the saner default?
```

---

## Prepared first comment

```
A bit on how the enforcement actually works, since that's the part that has to be correct.

The proxy runs as a Cloudflare Worker, and each budget is backed by a Durable Object. On every
request the flow is: estimate worst-case cost (input tokens + max_tokens × output price),
reserve that amount against the budget, forward to Anthropic, then reconcile with the actual
usage from the response and release whatever was over-reserved.

The reason it's a Durable Object and not just a row in a database: a DO gives you a
single-threaded, serialized execution point per budget. Concurrent requests to the same key
can't interleave their read-modify-write on the counter, so two calls can't both see "budget
ok" and both go through and overshoot. The reservation is what makes pre-flight blocking safe —
you commit the worst case up front and refund the difference, instead of checking a stale total.

That's also why I think pre-call enforcement beats observability for this specific problem. A
dashboard or an alert is a read of state that already happened; by the time a 95% alert fires,
the 95% is gone, and a runaway loop can cross the rest in seconds. Provider spend caps reconcile
on their own (slower) schedule, so they overshoot too. If the goal is "this can never cost more
than $X," the check has to sit in the request path and be able to say no. Observability tells
you what it cost; enforcement decides whether it's allowed to.
```
