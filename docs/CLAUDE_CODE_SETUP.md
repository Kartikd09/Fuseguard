# Claude Code Setup — FuseGuard

How this repo is wired for AI-led, architect-style development. Configured per the official
Claude Code docs (subagents, skills, commands, memory, hooks, MCP).

## Subagents — `.claude/agents/*.md`
Six specialized agents, auto-discovered at session start (restart Claude Code after adding/editing):

| Agent | Model | Memory | Role |
|-------|-------|--------|------|
| planner | opus | project | PRD, architecture, task breakdown |
| dev | sonnet | project | implementation (TDD) |
| qa | sonnet | project | tests-first, coverage, edge cases |
| security-reviewer | opus | project | keys, SSRF, webhook, fail-closed |
| code-reviewer | sonnet | project | quality gate on every PR |
| cloud-admin | sonnet | project | CF/Supabase/CI/CD/secrets |

`memory: project` → each agent accumulates learnings in `.claude/agent-memory/<name>/` (version-controlled).
Invoke via the Task tool (`subagent_type: dev`) or describe the work and Claude delegates by description.

> If the Task tool says "agent type not found", **restart the session** — subagents load at startup.

## Memory — avoid repo re-scans
- `CLAUDE.md` — golden rules + standards; imports the codemap via `@.claude/CODEMAP.md`.
- `.claude/CODEMAP.md` — architecture digest. Read this instead of scanning the repo. Keep it updated.
- Full detail lives in `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`.

## Skills — `.claude/skills/*/SKILL.md`
- `tdd-task` — run one Phase 1 proxy-core task in strict red→green TDD.
- `merge-ready` — verify a PR is safe to merge (CI, reviews, scope). Does NOT merge.

## Slash commands — `.claude/commands/*.md`
- `/new-feature <name>` — start a `feat/<name>` branch off develop the right way.
- `/merge-pr <n>` — founder-only (`disable-model-invocation`): runs merge-ready then squash-merges.

## Settings & hooks — `.claude/settings.json`
- **Permissions allowlist**: safe build/test/git/gh-read commands pre-approved.
- **Deny**: reading `.env`/secrets/keys, `rm -rf`, force-push, `wrangler secret`.
- **Stop hook**: prints `git status` after each turn so you always see the working-tree state.

## Notion MCP — `.mcp.json`
Official Notion hosted MCP server is configured. To activate:
1. In Claude Code, run `/mcp` → select **notion** → **Authenticate** (browser OAuth as your Notion account).
2. In Notion, open each page/database you want Claude to use → **•••** → **Connections** → add the
   Claude integration. (Without this step the API returns "object not found".)
3. Then Claude can read/write planning notes, architecture decisions, and sprint status in Notion —
   use it as the architect's living notebook alongside `docs/`.

> Suggested Notion structure: a "FuseGuard" page with sub-pages: Roadmap, Sprint, Decisions (ADRs),
> Ideas/Backlog, Launch checklist. Keep durable specs in `docs/` (versioned); use Notion for the
> fluid planning/notes layer.
