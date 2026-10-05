# Archive the finished task records and warn when one is left behind

**Created**: 2026-10-02

## Problem

CLAUDE.md step 5 archives a task record before its PR merges. On 2026-10-02
twelve finished tasks sat in `docs/tasks/active/` (issue closed or PR
merged, every box ticked), one of them #1375's, whose Review section carried
an "Open:" defect that never became an issue. A finished todo is not read
again, so what is written there is lost.

## Plan

- [x] Run `tasks-archive.sh` over active/. Twelve move to
      `archive/2026/09/`. Three stay with real open items: incremental
      persistence engine (benchmark), agent pipeline port (follow-ups to
      port back to yorkie, app setup), harness convergence (D3, E3).
- [x] `scripts/tasks-check.mjs`: from the diff, a finished todo the branch
      left in active/; with `--remote`, any active todo whose tracked issue
      is closed or PR merged. Warnings by default, `--strict` for the merge.
- [x] CI step on every PR (`::warning` annotations); pre-merge gate in the
      `maintainer-merge` skill; CLAUDE.md step 5 and `docs/tasks/active/README.md`
      say so.
- [x] File the defect #1375 left as "not covered" as its own issue.

## Needs a human with `workflow` scope

- `.github/workflows/agent-implement.yml`, the PLAN step (around line
      557): the todo it asks the agent to write declares only
      `**Created**: YYYY-MM-DD`, so every agent-authored record reaches
      `active/` with nothing `tasks-check.mjs --remote` can ask GitHub
      about. Have it carry `Tracked as #__ISSUE_NUMBER__` on a line of its
      own — the placeholder the branch name and the PR body already use,
      substituted at line 644. The agent App token cannot push it
      ("refusing to allow a GitHub App to create or update workflow ...
      without `workflows` permission"), so it is not in this branch.

## Verification

- [x] `pnpm test:scripts`, `pnpm lint`, `pnpm verify:license`,
      `pnpm verify:doc-links`.
- [x] `node scripts/tasks-check.mjs --base origin/main --remote` on this
      branch is clean: no todo left in active/ declares a tracking number
      (only a declaration counts, so the `#1384`/`#1426` the port and
      case-study todos *mention* are not looked up), so all four are
      reported as not checked and counted in the closing line. A bare
      `--remote --strict`, which would then have checked nothing at all,
      still exits 1.
