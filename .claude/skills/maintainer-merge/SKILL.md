---
name: maintainer-merge
description: Use when merging a yorkie-js-sdk pull request as a maintainer — a PR sitting at mergeable=MERGEABLE with mergeStateStatus=BLOCKED, a branch behind main, a PR touching .github/workflows, or a merge you have been asked to push through with maintainer privileges.
---

# Maintainer Merge

## Overview

Most of this procedure is derivable: `gh pr view`, `gh pr checks`,
`gh api repos/yorkie-team/yorkie-js-sdk/branches/main/protection`, and
`.githooks/commit-msg` tell you the state, the gates and the message rules.
Derive those. **This file carries only what the repository cannot tell you**,
plus the settings worth knowing before you spend calls rediscovering them.

**Core principle: check the settings, and report what you actually did.**

## Settings that decide the path

Verified 2026-09-29. Re-check if a merge behaves unexpectedly —
`gh api repos/yorkie-team/yorkie-js-sdk --jq '{squash:.allow_squash_merge,merge:.allow_merge_commit,rebase:.allow_rebase_merge,msg:.squash_merge_commit_message}'`
and the `branches/main/protection` endpoint.

| Setting | Value | Consequence |
|---|---|---|
| `allow_squash_merge` | true, and it is the **only** one | `-m`/`-r` are rejected by the API |
| `squash_merge_commit_message` | `COMMIT_MESSAGES` | The default body is every commit message concatenated, agent fix rounds included. Pass `--body-file` |
| `required_status_checks.contexts` | `[]` | **Nothing is required.** A red PR will merge. Read the check runs yourself |
| `required_status_checks.strict` | true | Up-to-date is still required. `--admin` would bypass this and merge a combination nothing tested |
| `required_approving_review_count` | 1 | `MERGEABLE` + `BLOCKED` means the review is missing, not a check. Bot reviews (coderabbit, the agent panel) do not count |
| `enforce_admins` | false | `--admin` is available — see below before using it |

## A branch behind main

`mergeStateStatus` reports `BLOCKED` for the missing review and hides that
the branch is also behind, so ask directly:

```bash
gh api repos/yorkie-team/yorkie-js-sdk/compare/main...<headRef> \
  --jq '{behind:.behind_by,ahead:.ahead_by}'
```

If `behind` > 0, bring main in with `gh pr update-branch <N>` (same-repo PRs;
the merge commit disappears in the squash), then wait for CI on the new head
with `gh pr checks <N> --watch`. Confirm the check runs belong to the new
head — `gh api repos/yorkie-team/yorkie-js-sdk/commits/<sha>/check-runs` —
before merging. `agent-review-docs` and `agent-deferred-findings` finish
`neutral` normally; `build (22.x)` and `test` are the ones that must pass.

**On an `agent:managed` PR the new head re-runs the panel**, and the panel is
a sample. A merge of main that leaves the PR's own diff unchanged (same
`git patch-id --verbatim`) carries an approval instead: the lens checks on the
new head read "carried from <sha>" and `agent:ready` stays. A merge that
touched the PR's hunks or their context, such as a conflict resolution, is
a full review again. With the fix budget spent, that review can move a ready
PR to `agent:blocked` on code nobody changed. That happened on #1426 before
carry existed. So check the panel's verdict on the new head, not only CI,
before you merge.

`@claude rerun` on a head that already has verdicts reuses them. To ask for a
fresh review, use `@claude rerun review`.

## Task records before merge

CLAUDE.md step 5 archives the PR's task record before the merge. It kept
being skipped (twelve finished tasks were sitting in `docs/tasks/active/` on
2026-10-02), so check it here, on the PR's head.

**Run `main`'s copy of the scripts, never the branch's.** The PR's head
carries its own `scripts/` — `tasks-check.mjs`, `direct-run.mjs`,
`tasks-archive.sh` — and your shell has an authenticated `gh`. Executing a
branch's scripts with that credential in the environment hands the credential
to whoever wrote the branch: the same exposure the CI step withholds a token
for, moved to a higher-privilege machine. So check the PR out for its *data*
and take the *code* from `origin/main`:

```bash
gh pr checkout <N>
git fetch --no-tags origin main
git worktree add --detach /tmp/tasks-check origin/main   # trusted scripts
node /tmp/tasks-check/scripts/tasks-check.mjs --base origin/main --remote --strict
git worktree remove /tmp/tasks-check
```

The script reads task records from the current directory, so this reports on
the PR's `docs/tasks/` while running only code already on `main`. If the PR
itself changes `scripts/tasks-check.mjs`, read that diff before trusting
either copy.

A finding is a blocker, not a note: ask the author for a commit that runs
`bash scripts/tasks-archive.sh && bash scripts/tasks-index.sh`. Pushing that
yourself on a same-repo PR runs those two against the branch as well — use
`bash /tmp/tasks-check/scripts/tasks-archive.sh` for the same reason, and
only after reading the branch's diff to them. Also read the todo's "Out of
scope" / "Open" / "Known limitations" section before it goes to the archive
— anything there that is a defect needs an issue, because nobody reads an
archived todo again. CI runs the diff half of the same check (no `--remote`,
no `--strict`) and surfaces it as a warning annotation on the PR.

## PRs touching `.github/workflows/*`

`gh pr merge` fails with *refusing to allow an OAuth App to create or update
workflow … without `workflow` scope* when the account lacks it. Check with
`gh auth status | grep -i scopes`. `gh auth refresh -h github.com -s workflow`
is interactive — hand it to the human. Agent-managed branches are pushed by
an app token without `workflows` permission, so a workflow change the agent
asks for in its commit message must be applied by a human.

## Merging past the required review

`--admin` works because `enforce_admins` is false. It is legitimate when the
maintainer has decided to merge and says so. It is not a default.

Do not reach for `gh pr review --approve` to clear the gate instead: that
records a review that did not happen. `--admin` records what is true — a
maintainer bypassed the requirement.

In Claude Code auto mode the classifier denies an `--admin` merge
("Merge Without Review") even when the maintainer asked for it. Do not work
around the denial; give the human the exact command to run with `!`, or let
them add a permission rule. Note that the RTK hook rewrites `gh` to `rtk gh`,
so a rule must match the rewritten form.

## Squash message

The message rules (subject ≤70, blank line 2, body ≤80) are in
`CONTRIBUTING.md` and `.githooks/commit-msg`. Two things neither tells you:

- **The hook does not run on a GitHub-side squash.** Run it yourself against
  the subject **without** the `(#N)` suffix plus the body:
  `{ echo "<subject>"; echo; cat body.txt; } > /tmp/m && .githooks/commit-msg /tmp/m`
- **`--subject` is used verbatim — GitHub does not append `(#N)`.** Include it
  yourself. The ≤70 budget is for the part before the suffix.

Write the body as one prose account of what the PR changed and why, not a
replay of each commit. Drop `Assisted-by:` trailers from intermediate fix
rounds; keep a `Co-Authored-By:` only when the squashed work carries one.

## Pitfalls

| Symptom | Cause / Fix |
|---|---|
| `MERGEABLE` but `BLOCKED` | The required review, not a check. `contexts` is empty |
| Waiting for CI to unblock the PR | It never will — no check is required here |
| Behind main but `BLOCKED`, not `BEHIND` | The review gate masks it. Use the compare endpoint above |
| Merged something newer than what was reviewed | Pass `--match-head-commit <headRefOid>` |
| A commit on `main` without `(#N)` | The subject was passed without the suffix |

## Quick reference

```bash
gh pr view <N> --json mergeable,mergeStateStatus,reviewDecision,headRefOid,headRefName,isCrossRepository,files
gh api repos/yorkie-team/yorkie-js-sdk/compare/main...<headRef> --jq '.behind_by'
gh pr checks <N>
gh pr merge <N> --squash \
  --subject "<verb-first, ≤70> (#<N>)" --body-file <path> --match-head-commit <headRefOid>
```

Add `--admin` only when you are deliberately merging without the required
review, per *Merging past the required review* above.
