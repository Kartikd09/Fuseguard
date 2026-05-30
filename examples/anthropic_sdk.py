"""Raw Anthropic SDK through FuseGuard.

The only change from a normal Anthropic call is `base_url`. Every request now flows
through FuseGuard's budget enforcement; if a budget is breached, you get a 402 instead
of an unbounded bill.

Run:
    export ANTHROPIC_API_KEY="sk-ant-..."
    export FUSEGUARD_BASE_URL="http://localhost:8787/v1"
    export FUSEGUARD_KEY="fg_..."
    python anthropic_sdk.py
"""

import os

from anthropic import Anthropic, APIStatusError

client = Anthropic(
    api_key=os.environ["ANTHROPIC_API_KEY"],
    base_url=os.environ["FUSEGUARD_BASE_URL"],
    # FuseGuard identifies your account + applies your budgets via this header.
    default_headers={"x-fuseguard-key": os.environ["FUSEGUARD_KEY"]},
)

try:
    message = client.messages.create(
        model="claude-sonnet-4",
        max_tokens=256,
        messages=[{"role": "user", "content": "In one sentence, what is a circuit breaker?"}],
    )
    print(message.content[0].text)
except APIStatusError as e:
    if e.status_code == 402:
        # FuseGuard blocked the call before it hit Anthropic.
        print("BLOCKED by FuseGuard:", e.response.json()["error"])
    else:
        raise
