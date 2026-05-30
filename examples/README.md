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
   export ANTHROPIC_API_KEY="sk-ant-..."        # your real Anthropic key
   export FUSEGUARD_BASE_URL="http://localhost:8787/v1"   # or your deployed worker URL
   export FUSEGUARD_KEY="fg_..."                # your FuseGuard key (from dashboard / self-host)
   ```
3. Run an example. Set a low budget first to watch FuseGuard block an overspend.
