# Contributing to FuseGuard

We work like a real dev team. **No direct commits to `main` or `develop`.** Everything
flows through branches and Pull Requests.

## Branching Model (GitHub Flow + integration branch)

```
main      ← production. Protected. PR-only. Tagged releases.
  ↑ PR (release)
develop   ← integration. Protected. PR-only. Always deployable to staging.
  ↑ PR (feature)
feat/*  fix/*  chore/*  docs/*  ← your work happens here
```

### Branch naming

| Prefix | Use for | Example |
|--------|---------|---------|
| `feat/` | new feature | `feat/budget-enforcement-core` |
| `fix/` | bug fix | `fix/token-count-streaming` |
| `chore/` | tooling, deps, config | `chore/add-ci-pipeline` |
| `docs/` | docs only | `docs/architecture-update` |
| `refactor/` | non-behavior refactor | `refactor/proxy-handler` |
| `test/` | tests only | `test/loop-detection-cases` |

## Workflow

1. **Branch from `develop`:**
   ```bash
   git checkout develop && git pull
   git checkout -b feat/<name>
   ```
2. **TDD** — write the failing test first (mandatory for budget/enforcement logic).
3. **Commit** using Conventional Commits (below). Small, focused commits.
4. **Push** and **open a PR into `develop`** using the PR template.
5. **CI must pass** — lint, typecheck, tests (≥80% core coverage), gitleaks, CodeQL.
6. **Review** — `code-reviewer` agent (always) + `security-reviewer` (auth/keys/proxy/billing).
7. **Squash-merge** into `develop` after approval.
8. **Release** — PR `develop` → `main`, tag a version.

## Conventional Commits

```
<type>: <short description>

[optional body — the WHY]
```

Types: `feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `perf`, `ci`, `build`, `security`.

Example:
```
feat: enforce per-session token ceiling before Anthropic call

Pre-flight worst-case estimate blocks calls that could breach the budget,
preventing the runaway-loop overspend FuseGuard exists to stop.
```

## Definition of Done

- [ ] Tests written first, passing, core coverage ≥ 80%
- [ ] `npm run lint` + `npm run typecheck` clean
- [ ] No secrets (gitleaks clean)
- [ ] `code-reviewer` approved
- [ ] `security-reviewer` approved (if security-sensitive)
- [ ] Docs updated if behavior/API changed
- [ ] PR description explains WHAT + WHY + test plan

## Local Setup

```bash
cp .env.example .env   # fill in your own keys — NEVER commit .env
npm install
npm run dev:proxy
```
