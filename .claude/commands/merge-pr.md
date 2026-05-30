---
name: merge-pr
description: Founder approves a merge — squash-merge a PR into its base after a final safety check
arguments: [pr-number]
disable-model-invocation: true
---

The founder has explicitly approved merging PR #$ARGUMENTS.

1. Run the `merge-ready` skill for PR #$ARGUMENTS. If it reports NOT READY, STOP and show why.
2. If READY, squash-merge and delete the branch:
   `gh pr merge $ARGUMENTS --repo Kartikd09/Fuseguard --squash --delete-branch`
3. Confirm: `gh pr view $ARGUMENTS --json state,mergedAt`.
4. Sync local: `git checkout develop && git pull origin develop`.

Only run this when the founder explicitly says to merge (this command is founder-invoked only —
`disable-model-invocation: true`). Never auto-merge.
