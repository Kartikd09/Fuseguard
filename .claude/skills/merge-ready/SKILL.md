---
name: merge-ready
description: Verify a FuseGuard PR is safe to merge. Use before asking the founder to merge — checks CI, reviews, scope, and the project's merge rules.
allowed-tools: Bash(gh *), Bash(git *), Read, Grep
---

## Overview
Pre-merge gate. The founder is the only one who clicks Merge — this skill produces the evidence
they need to decide, it does NOT merge.

## Steps
1. Identify the PR (arg or current branch): `gh pr view --json number,title,baseRefName,headRefName,mergeable,state`.
2. Confirm base is `develop` (feature work) or `main` (release only). Flag if wrong.
3. Check CI: `gh pr checks <n>` — ALL must pass (build-test, gitleaks, detect; CodeQL when code exists).
4. Pull Copilot + any reviews: `gh pr view <n> --json reviews` and inline `gh api repos/.../pulls/<n>/comments`.
   Summarize unresolved findings by severity. CRITICAL/HIGH unaddressed → NOT ready.
5. Scope check: `git diff develop...HEAD --stat` — does the diff match the PR title? Flag mixed scopes.
6. Secrets check: confirm gitleaks passed; grep the diff for obvious keys/tokens.
7. Report a clear verdict: **READY** (with a one-line summary) or **NOT READY** (with the blocking list).

## Important rules
- Never run `gh pr merge`. Merging is the founder's manual action.
- Treat unresolved CRITICAL/HIGH review findings as blockers.
- If CI is red, surface the failing job's log tail.
