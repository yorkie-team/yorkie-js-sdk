---
created: 2026-09-25
updated: 2026-09-25
tags: [ai-agent, ci, hooks]
---

# Agent Harness

## Problem

The server repository (yorkie-team/yorkie) runs a `@claude` command surface:
PR and issue comments that ask an agent to review, summarize, fix or
implement, a six-lens review panel that gates agent-managed PRs, and a local
enforcement layer that makes the rules in `CLAUDE.md` checkable. This SDK has
none of it. Before this work, nothing here could run unattended as a gate:
the only documented check (`pnpm lint && pnpm sdk build && pnpm sdk test`)
needs a running server, the licence header convention had drifted in 58
files with nothing to notice, and Husky ran hook bodies straight from the
working tree.

### Goals

- A local gate an agent or a hook can run with no server: `pnpm verify:fast`
- Check what `CLAUDE.md` asks for, rather than state it: licence headers,
  generated files, commit format
- Hooks that a checked-out branch cannot rewrite or reach
- The same phase order as the server repository for the CI half, so each
  phase is enabled only after the previous one is observed working

### Non-Goals

- `hunt` / `report-intake` / `spec-to-pr` / `eval` arms — not on the server
  either
- A local runner for the six-lens panel. `/self-review` uses the harness's
  own reviewer and says so

## Design

### Cost-ordered gates

| Gate | When | Runs | Cost |
|---|---|---|---|
| Claude Code hooks | every Edit/Write, session start | generated-file guard, workflow checklist | ~0 |
| `pre-commit` | every commit staging source | `pnpm exec lint-staged` (outside `examples/`) | seconds |
| `pre-push` | every push | `pnpm verify:fast` | ~30s |
| CI | every push | everything, including integration against docker | minutes |

`verify:fast` is lint (no `--fix`), `verify:license`, `verify:doc-links`,
the script suite, the SDK build, and the unit suites of sdk, prosemirror,
react and schema. Integration suites stay in CI because they need a Yorkie
server and MongoDB; `test/unit` was made server-free for this by moving the
one test that synced two clients into `test/integration`.

### Hooks install from a snapshot, not from the tree

A hook body that is a tracked file is branch-controlled code: a pull request
rewrites it, and a reviewer who checks the branch out and commits runs it.
So both hook systems install into `$GIT_DIR`, where `git checkout` never
writes:

- git hooks: `scripts/setup.sh` copies `.githooks/` to the common git
  directory's `githooks/` (shared by every worktree) and points
  `core.hooksPath` there
- Claude Code hooks: `scripts/hooks/install.mjs` copies the scripts to
  the common git directory's `agent-hooks/` and wires them in the gitignored
  `.claude/settings.local.json`

The snapshot pins which hook runs, not what it invokes — `lint-staged` and
`verify:fast` resolve through the branch's own configs and tests. That half
is closed at run time by `.githooks/trusted-tree.sh`, which refuses when the
checkout carries commits on top of `origin/main` or `upstream/main` that this
clone did not create — read from HEAD's and the current branch's reflogs,
which only the local git writes — or whose raw author address is not the
local `user.email`. `upstream` is trusted by remote name; a clone that points
`upstream` at somebody's fork trusts that fork's `main`. And once you rewrite
a branch yourself (rebase, amend) its commits count as yours, so read before
rewriting.

The cost is staleness: an improved hook reaches a clone when someone re-runs
`setup.sh`. CI is the backstop, so hooks are an accelerator, not the gate of
record.

### Phases for the CI half

| Phase | Verbs | Needs |
|---|---|---|
| 0 | local layer above, `/self-review` | nothing on GitHub |
| 1 | `review`, `summarize` (advisory) | `CLAUDE_CODE_OAUTH_TOKEN`, `agent` environment, `AGENT_PIPELINE_ENABLED` |
| 2 | `loop`, `rerun`, gating panel, CI-fix loop | the `yorkie-team-agent` App on this repo, `agent:*` labels |
| 3 | `fix` on a PR, bare-mention reply | as Phase 2 |
| I | `fix` on an issue (issue → draft PR) | App `Administration: read`; `main` requiring last-push approval |

The workflows and `scripts/agent/` are vendored from the server repository,
whose own copy came from wafflebase (a pnpm monorepo). The parts that carry a
repository's shape — file classification, what CI already proves, CI-defining
paths, lens scopes, fixer prompts — are rewritten here; the rest is copied
with its source commit recorded.

### The review loop converges on what it already judged

The panel is a sample, not an oracle. On #1426 it approved a head, then
re-reviewed a merge of main that left the PR's own diff unchanged and turned
blocking, and with the fix budget spent the PR went from `agent:ready` to
`agent:blocked` on code nobody had touched. So the loop refuses to pay twice
for the same question, and it keeps what it learns about failures.

- **Carry.** Every review stamps a PR-diff fingerprint (`git patch-id
  --verbatim` of the unfiltered diff) into each lens's check-run state. A new
  head that fingerprints the same as a head every lens approved has that
  approval re-stamped on it, and no lens runs. Carries are capped at 2 in a
  row, and promote still needs green CI on the new head. A merge that touched
  the PR's hunks or their context changes the fingerprint and is reviewed.
- **Reuse.** A rerun on a commit that already has verdicts re-stamps them, so a
  blocking verdict goes straight to the fixer. `@claude rerun review` asks for a
  fresh sample.
- **Probe before dispatch.** The fixer's credential is proven with a one-word
  query before the round is recorded. Only a closed usage window or a rejected
  credential counts as a refusal; a transient overload proceeds. The probe holds
  the pool secrets, so it runs before the branch checkout.
- **Honest infra pages.** A fixer that fails on an API error with nothing
  pushed is paged with its cause and the next step, not as "the fixer failed".
- **Evidence beside claims.** When a fix round's commits delete or disable
  tests, the trusted report job records it. The next round's adjudicator sees
  that record, ahead of the author's text, beside every "fixed" claim. It only
  sees COMMITTED tests. #1426's fixer wrote its test, watched it fail and
  deleted it without ever committing it, and no compare can see that. The
  fixer prompt's rule (keep it as `it.fails` and report the finding skipped)
  is the guard for that case.
- **No spec, no scope verdict.** Without a human-filed `agent:candidate` issue,
  design-fit is told it has no spec, and scope findings are `minor` at most.
- **Both directions are observed.** The metrics count clean→blocking flips
  (escalations) as well as blocking→clean ones.

### Risks and Mitigation

| Risk | Mitigation |
|------|------------|
| Existing clones keep the Husky `core.hooksPath` and silently lose hooks | `prepare` runs `setup.sh --check`, which says so on every `pnpm install` |
| `verify:fast` gets slow and people bypass it | Measured at ~30s; `pre-commit` stays lint-only |
| A generated file is edited through Bash, past the Edit/Write guard | The next regeneration reverts it; review catches the rest |
| Three vendored copies of `scripts/agent/` drift | Record the source commit per sync and diff before the next one |
| Fork contributors rebase onto `upstream/main` while their fork's `main` lags | The trust guard treats both `origin/main` and `upstream/main` as the default branch |
| The commit gate refuses files CI never lints | lint-staged filters out `examples/`, which the root `eslint .` ignores |
| Main changes what an unchanged diff MEANS, and a carry hides it | CI must pass on the carried head before promote, and the third carry in a row is a full review |
| A fixer forges an execution log to look like an infra failure | The worst it can choose is which page a human reads; the PR is latched either way |

### Design Decisions

| Decision | Reason |
|----------|--------|
| Replace Husky with `.githooks/` + `setup.sh` | Husky runs hooks from the working tree, the hole the snapshot closes |
| `pnpm install` does not install hooks | Installing from `prepare` would snapshot whatever branch is checked out |
| Licence scan covers `packages/*/{src,test}` and `scripts/` | `examples/` are sample apps copied out; build configs carry no shipped code |
| Generated `*_pb.ts` stay in the licence scan | `buf generate` carries the header; a plugin change that dropped it is worth seeing |
| The `.proto` copies are guarded like generated files | The source of truth is the server's `api/`; an edit made only here diverges |
| Reuse the server's App rather than create one | Same bot login, so the vendored trust list needs no change |
| The carry key is `patch-id --verbatim`, not `--stable` | `--stable` discards whitespace, so an indentation-only change that alters behaviour would carry an approval |
| Only an approval carries | Carrying a blocking verdict to a new head would dispatch a fixer on findings read against another commit |
| Credentials are probed before the round, not retried after | Nothing may run after the agent in its own job, and a probe spends no round at all |
| Test removals are evidence for the adjudicator, not a gate | Removing a test can be legitimate; the adjudicator already re-reads the code |

## Alternatives Considered

| Alternative | Why not |
|-------------|---------|
| Keep Husky, add the hooks there | Hook bodies stay branch-controlled |
| A tracked `.claude/settings.json` | Claude Code runs what it names straight out of a checkout |
| `verify:fast` with integration against docker | Makes every push depend on docker running; CI already covers it |
| Share `scripts/agent/` as a package now | Two copies exist; extract once the third shows what actually varies |
| Refuse to carry when main changed a file the PR touches | #1426's own merge (#1424) touched two of the PR's files, so the rule blocked the carry it was built for; CI covers the same risk |
| Refund fix rounds lost to infra failures | The infra page latches the PR and only a rerun lifts it, which restarts the budget anyway; the refund could never change a decision |
| Keep earlier demotions across rounds (by finding identity) | On #1426 the finding that flipped blocking was raised against different files (`client.ts`, `change.ts`) from the one demoted (`converter.ts`); identity matching would not have held it, and wider matching drops real findings off the gate. Carry removes the re-review that caused the flip |
| Retry the fixer on another credential after it fails | Nothing may run after the agent in its own job |

## Tasks

- `docs/tasks/active/20260925-agent-pipeline-port-todo.md`
- `docs/tasks/active/20261001-harness-convergence-todo.md`
