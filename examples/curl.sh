#!/usr/bin/env bash
# Lowest-level example: a raw Anthropic Messages call through FuseGuard via curl.
# A successful call returns the Anthropic response. A budget-blocked call returns HTTP 402.
#
#   export FUSEGUARD_BASE_URL="http://localhost:8787/v1"
#   export FUSEGUARD_KEY="fg_..."
#   ./curl.sh
# Your real Anthropic key lives in FuseGuard, not here — send the FuseGuard key as x-api-key.
set -euo pipefail

curl -sS -w '\nHTTP %{http_code}\n' \
  -X POST "${FUSEGUARD_BASE_URL}/messages" \
  -H "content-type: application/json" \
  -H "x-api-key: ${FUSEGUARD_KEY}" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "claude-haiku-4-5",
    "max_tokens": 128,
    "messages": [{"role": "user", "content": "Say hello in one word."}]
  }'

# HTTP 200 → forwarded + within budget.
# HTTP 402 → FuseGuard blocked it (budget_exceeded or loop_detected); body explains why.
