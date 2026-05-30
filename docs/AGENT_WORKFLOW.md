# Agent Orchestration Workflow

How the FuseGuard multi-agent team builds features. The human founder orchestrates;
agents execute specialized roles. Modeled on a real dev team.

## Team

| Agent | Role | Model |
|-------|------|-------|
| `planner` | Spec, architecture, task breakdown | Opus |
| `dev` | Implementation on feature branches | Sonnet |
| `qa` | Tests-first, coverage, edge cases | Sonnet |
| `security-reviewer` | Vuln/secrets/threat review | Opus |
| `cloud-admin` | Infra, deploy, CI/CD | Sonnet |
| `code-reviewer` | Quality gate on every PR | Sonnet |

## Feature Lifecycle (one PR)

```
┌──────────┐   ┌──────┐   ┌──────┐   ┌───────────────────┐   ┌────────┐
│ planner  │ → │  qa  │ → │ dev  │ → │ code-reviewer +   │ → │ merge  │
│ task+DoD │   │ tests│   │ impl │   │ security-reviewer │   │ to dev │
└──────────┘   └──────┘   └──────┘   └───────────────────┘   └────────┘
                  ↑__________________________│ (REQUEST CHANGES loops back)
```

1. **plan** — `planner` produces the task with scope + Definition of Done.
2. **branch** — create `feat/<name>` from `develop`.
3. **red** — `qa` (or `dev`) writes failing tests for the behavior.
4. **green** — `dev` implements until tests pass; lint + typecheck clean.
5. **review** — `code-reviewer` (always) + `security-reviewer` (if auth/keys/proxy/billing).
6. **fix** — address findings; loop until APPROVE.
7. **PR** — open into `develop` with the PR template; CI must be green.
8. **merge** — squash-merge after approvals.
9. **deploy** — `cloud-admin` deploys `develop` → staging; `main` → prod on release.

## Handoff Rules

- Each agent reads `CLAUDE.md`, `docs/PRD.md`, `docs/ARCHITECTURE.md` before acting.
- Agents NEVER commit to `main`/`develop`. PR-only.
- A REQUEST CHANGES verdict returns the task to `dev` with a checklist.
- CRITICAL security findings STOP the pipeline until resolved.

## Parallelization

Independent tasks (e.g., dashboard UI vs proxy core) can run on separate branches
with separate `dev` agents concurrently, then integrate via PRs into `develop`.

## Phase Map (see PRD for detail)

| Phase | Lead agents |
|-------|-------------|
| 0 Spec | planner |
| 1 Proxy core (TDD) | qa + dev, security-reviewer, code-reviewer |
| 2 Dashboard | dev, code-reviewer |
| 3 Billing | dev, security-reviewer, code-reviewer |
| 4 Harden | security-reviewer, cloud-admin |
| 5 Launch | cloud-admin, doc updates |
| 6 Distribute | founder (human) |
