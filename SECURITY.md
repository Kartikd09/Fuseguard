# Security Policy

FuseGuard handles customers' LLM API keys and sits in their request path. We take security seriously.

## Reporting a Vulnerability

**Do not open a public issue for security bugs.**

Email: **kartikds009@gmail.com** with subject `SECURITY: FuseGuard`.
Include: description, reproduction steps, impact, and any PoC. We aim to acknowledge
within 72 hours and provide a remediation timeline.

Please give us reasonable time to fix before public disclosure. We credit reporters
(unless you prefer anonymity).

## Scope

In scope: the proxy, dashboard, billing webhooks, auth, and data handling.
Out of scope: third-party services (Cloudflare, Supabase, Lemon Squeezy, Anthropic) themselves.

## Our Security Commitments

- **Customer API keys** are encrypted at rest, never logged, never returned in responses.
- **Prompt/response bodies are NOT logged** by default — only token counts + metadata.
- **TLS** for all traffic; **encryption at rest** for sensitive data.
- **SSRF protection**: the proxy only forwards to the intended LLM provider endpoint.
- **Webhook signatures** (Lemon Squeezy) are verified server-side.
- **Row-Level Security** isolates each customer's data in Supabase.
- **Least privilege** for all service accounts and tokens.
- **Automated scanning**: gitleaks (secrets), CodeQL (SAST), Dependabot (deps) on every PR.

## Supported Versions

Pre-1.0: only the latest `main` is supported.

## Disclosure

Confirmed vulnerabilities are documented in release notes after a fix ships.
