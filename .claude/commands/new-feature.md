---
name: new-feature
description: Start a new FuseGuard feature branch off develop following the team workflow
arguments: [feature-name]
---

Start a new feature for FuseGuard called "$ARGUMENTS".

1. Ensure working tree is clean, then sync develop:
   `git checkout develop && git pull origin develop`
2. Create the branch: `git checkout -b feat/$ARGUMENTS`
3. Read `docs/ROADMAP.md` + `docs/PRD.md` to locate the relevant task and acceptance criteria.
4. If this touches budget/enforcement/proxy logic, use the `tdd-task` skill (tests first).
5. Plan the smallest PR-sized change. Confirm scope with me before writing code.

Follow CLAUDE.md golden rules: branch-per-feature, TDD core, no secrets, no attribution in commits.
