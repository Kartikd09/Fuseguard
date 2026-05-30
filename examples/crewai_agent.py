"""A CrewAI agent protected by FuseGuard.

CrewAI agents loop — they reason, act, observe, reason again. A bad loop can rack up a
huge bill. FuseGuard caps it: set a budget, and the agent is hard-stopped before it
overspends, with runaway-loop detection on top.

The only change to make any CrewAI/LangChain agent safe is pointing the LLM's base_url
at FuseGuard.

Run:
    export FUSEGUARD_BASE_URL="http://localhost:8787/v1"
    export FUSEGUARD_KEY="fg_..."
    pip install crewai
    python crewai_agent.py
"""

import os

from crewai import Agent, Crew, Task
from crewai.llm import LLM

# Route CrewAI's LLM through FuseGuard. Budget enforcement + loop kill happen transparently.
llm = LLM(
    model="anthropic/claude-sonnet-4",
    base_url=os.environ["FUSEGUARD_BASE_URL"],
    # Send the FuseGuard key — your real Anthropic key lives inside FuseGuard.
    api_key=os.environ["FUSEGUARD_KEY"],
    extra_headers={
        # Optional: scope a budget to this agent run, not just the key.
        "x-fuseguard-session": "research-crew-run-1",
    },
)

researcher = Agent(
    role="Researcher",
    goal="Explain what an AI agent circuit breaker is and why it matters",
    backstory="A concise technical writer.",
    llm=llm,
    verbose=True,
)

task = Task(
    description="Write a 3-sentence explanation of why AI agents need runtime budget enforcement.",
    expected_output="A 3-sentence explanation.",
    agent=researcher,
)

crew = Crew(agents=[researcher], tasks=[task], verbose=True)

if __name__ == "__main__":
    # If this agent loops or exceeds its budget, FuseGuard returns 402 and the run stops
    # — instead of an 11-day, $47,000 runaway.
    result = crew.kickoff()
    print(result)
