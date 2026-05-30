# Pull Request

## What
<!-- What does this PR do? -->

## Why
<!-- Why is this needed? Link issue: Closes #__ -->

## How
<!-- Key implementation decisions -->

## Test Plan
<!-- How was this verified? -->
- [ ] Tests written first (TDD) for core/enforcement logic
- [ ] `npm test` passes; core coverage ≥ 80%
- [ ] `npm run lint` + `npm run typecheck` clean

## Checklist
- [ ] Branch is `feat/* | fix/* | chore/* | docs/*` (NOT main/develop)
- [ ] Conventional Commit messages
- [ ] No secrets committed (gitleaks clean)
- [ ] Docs updated if behavior/API changed
- [ ] `code-reviewer` reviewed
- [ ] `security-reviewer` reviewed (if touches auth / API keys / proxy path / billing)

## Security impact
<!-- Does this touch auth, customer API keys, the proxy request path, or billing? Describe. -->
