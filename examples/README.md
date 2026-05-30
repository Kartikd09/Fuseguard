# FuseGuard Examples

Working examples of routing LLM traffic through FuseGuard. In every case the **only change**
is pointing `base_url` at your FuseGuard proxy — the rest of your code is untouched.

| Example | What it shows |
| --- | --- |
| [`anthropic_sdk.py`](./anthropic_sdk.py) | Raw Anthropic Python SDK through FuseGuard |
| [`crewai_agent.py`](./crewai_agent.py) | A CrewAI agent protected by a budget + loop kill |
| [`curl.sh`](./curl.sh) | Lowest-level: a raw `curl` call through the proxy |

## Setup
1. Self-host FuseGuard (see [`../docs/SELF_HOSTING.md`](../docs/SELF_HOSTING.md)) or use the hosted URL.
2. Set env vars:
   ```bash
   export FUSEGUARD_BASE_URL="http://localhost:8787/v1"   # or your deployed worker URL
   export FUSEGUARD_KEY="fg_..."                # your FuseGuard key
   ```
   > Your real Anthropic key never goes in client code — it lives inside FuseGuard
   > (self-host config or the hosted dashboard). You send the FuseGuard key as `x-api-key`;
   > FuseGuard swaps in the real key upstream. True one-line drop-in.
3. Run an example. Set a low budget first to watch FuseGuard block an overspend.
