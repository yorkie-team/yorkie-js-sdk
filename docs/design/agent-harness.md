---
created: 2026-09-25
updated: 2026-11-14
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
- Hooks every clone installs once and never has to refresh
- Claude Code hooks that a checked-out branch cannot rewrite or reach
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

### Git hooks run from the tree; Claude Code hooks from a snapshot

- git hooks: `scripts/setup.sh` sets `core.hooksPath=.githooks`. The value is
  relative, and git resolves it against the top of whichever worktree runs
  the hook, so one setting in the shared config serves every worktree, each
  running its own checkout's hooks. A hook change applies on the next commit.
- Claude Code hooks: `scripts/hooks/install.mjs` copies the scripts to the
  common git directory's `agent-hooks/` and wires them in the gitignored
  `.claude/settings.local.json`.

The two halves make opposite trades on purpose. A git hook runs when you
commit or push, an act you chose after reading what you checked out, and
`--no-verify` skips it.

With `core.hooksPath` in the tree, the hook scripts themselves are
branch-controlled: a fork's pull request can rewrite `.githooks/pre-commit`,
and committing in a checkout of it runs that rewrite. This is accepted
because it adds little. The hooks already ran the branch's lint configs
(JavaScript modules that execute on load) and `verify:fast` its tests, so a
checkout you commit in was always one whose code runs. The defence is the
same as for building or testing a branch: read a fork's diff before you
commit in its checkout, or use `--no-verify`. And a checkout with no
`.githooks/` at all — an old branch, or one that deleted it — runs no hooks;
git does not fall back to `.git/hooks`. Claude Code runs its
hooks the moment a session opens in a checkout, before anything has been read,
so those stay in `$GIT_DIR`, where `git checkout` never writes. Their cost is
staleness: an improved Claude Code hook reaches a clone when someone re-runs
`setup.sh`. And because a re-run inside a reviewed branch would snapshot that
branch's copies, `setup.sh` refuses to install them when `scripts/hooks`,
`setup.sh` or `scripts/*.mjs` differ from `upstream/main` or `origin/main`
(override: `YORKIE_ALLOW_LOCAL_HOOKS=1`). It guards against accident only: a
hostile branch's `setup.sh` can leave the check out.

Until 2026-10 the git hooks were snapshotted too, into `$GIT_DIR/githooks`,
and `.githooks/trusted-tree.sh` refused to run `lint-staged` or `verify:fast`
on a checkout carrying commits this clone did not create. Both were dropped
(the decisions below say why). `setup.sh` removes the old copy only when
`core.hooksPath` still names it and only once its source check has passed, and
`setup.sh --check` says when a clone is still running that copy.

CI is the backstop either way, so hooks are an accelerator, not the gate of
record.

### Phases for the CI half

| Phase | Verbs | Needs |
|---|---|---|
| 0 | local layer above, `/self-review` | nothing on GitHub |
| 1 | `review`, `summarize` (advisory) | `CLAUDE_CODE_OAUTH_TOKEN`, `agent` environment, `AGENT_PIPELINE_ENABLED` |
| 2 | `loop`, `rerun`, gating panel, CI-fix loop | the `yorkie-team-agent` App on this repo, `agent:*` labels |
| 3 | `fix` on a PR, bare-mention reply | as Phase 2 |
| I | `fix` on an issue (issue → draft PR) | App `Administration: read`; `main` requiring last-push approval |

The workflows and `scripts/agent/` are the server repository's, whose own
copy came from wafflebase (a pnpm monorepo). Until 2026-11 they were vendored
and the parts that carry a repository's shape — file classification, what CI
already proves, CI-defining paths, lens scopes, fixer prompts, the toolchain
setup — were rewritten here by hand, which every sync then had to redo.

Since then the two are the same bytes as the server repository's, and what
this repository owns sits beside them:

- `.github/agent-harness/config.json` and `coverage-note.md` hold every
  value that differs here, read only through `scripts/agent/config.mjs`. A
  missing or unknown key fails on load.
- `.github/actions/agent-toolchain` is the one per-repository step the agent
  jobs run: pnpm, and a lockfile-exact install with lifecycle scripts and
  pnpmfiles off and the branch's `.npmrc` set aside. A fix job loads it from
  `main`, not from the branch it is about to hand to an agent, and checks
  out nothing else from `main` for it. So main's `.npmrc` is a copy beside
  the action rather than the root file.
- `.github/agent-harness/repo.test.mjs` grades both against this repository:
  the configured paths against tracked files, the coverage note against
  `ci.yml`, the prompts' commands against `package.json`, the action's flags
  and pins, the `.npmrc` copy against the root file. `repo.snapshot.json`
  records every exported value and rendered prompt, so a change to a gate or
  a prompt shows its before and after in review.

A sync is an overwrite of the shared half; `.github/agent-harness/README.md`
has the procedure and the source commit. Something the shared half cannot
express for this repository is fixed upstream, not patched here.

The 2026-11 sync also brought what the server repository had added since: a
scope guard on fix rounds (a fixer may change the PR's original files, tests
and docs, and nothing else), a causation check that moves a finding on code
the PR never touched into a follow-up issue, an out-of-run sweep that retries
usage-window pages and nudges a PR stuck in `agent:reviewing`, and a carry
across a force-push.

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
- **Evidence beside claims.** When a fix round's own commits delete or
  disable tests, the trusted report job records it. "Own commits" means the
  round's commits that are in the PR's commit list and are not merges, so
  main's changes are not blamed on the fixer. The next round's adjudicator
  sees the record, ahead of the author's text, for every claim and dispute it
  adjudicates. It only
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
| The copies of `scripts/agent/` in three repositories drift | They are byte-identical to one upstream commit, recorded in `.github/agent-harness/README.md`; a sync overwrites them, and a local difference is a bug |
| The copy of `.npmrc` beside the toolchain action goes stale | `repo.test.mjs` compares the two; `agent-scripts.yml` runs it on a change to the action and weekly, since the root file is not among its path filters |
| A per-repository file the coverage note or a prompt describes changes, and `agent-scripts.yml` does not start | The weekly run. Those files are CI-defining, so the PR that changes one is never promoted automatically |
| A reviewer commits from a checkout of someone else's branch and runs its code | Documented in `CONTRIBUTING.md`: read the diff first or use `--no-verify`; the same exposure as running that branch's tests |
| Clones set up by the snapshot install keep running the stale copy, guard included | `prepare` runs `setup.sh --check`, which names the old copy and the guard on every `pnpm install`; re-running `setup.sh` repoints `core.hooksPath` and deletes the copy |
| A fork PR rewrites `.githooks/` and a reviewer commits in its checkout | Accepted: the hooks already ran the branch's lint configs and tests. Read a fork's diff before committing in it, or use `--no-verify` |
| The commit gate refuses files CI never lints | lint-staged filters out `examples/`, which the root `eslint .` ignores |
| Main changes what an unchanged diff MEANS, and a carry hides it | CI must pass on the carried head before promote, and the third carry in a row is a full review |
| A fixer forges an execution log to look like an infra failure | The worst it can choose is which page a human reads; the PR is latched either way |

### Design Decisions

| Decision | Reason |
|----------|--------|
| Replace Husky with `.githooks/` + `setup.sh` | One hook directory, no dependency, and `setup.sh` also installs the Claude Code hooks |
| Git hooks run from the tracked `.githooks/`, not a `$GIT_DIR` snapshot (2026-10) | The snapshot only pinned which hook runs, not what it invokes, so it needed the trust guard to mean anything, and it cost a `setup.sh` re-run after every hook change |
| Drop the trust guard (`trusted-tree.sh`) (2026-10) | On agent-loop branches every bot commit is "foreign", so it refused every maintainer commit and push there. Its override, `YORKIE_ALLOW_FOREIGN_TREE`, leaked into pre-push's own harness tests, so a pushed foreign branch needed `--no-verify` anyway. A gate that refuses the everyday case gets bypassed by reflex |
| `pnpm install` only checks, it does not install hooks | An install in CI or a scratch worktree must not rewrite the shared clone config, and `setup.sh` is needed anyway for the Claude Code hooks |
| Claude Code hooks keep their snapshot | They run on session open, with no act to consent to and no `--no-verify`; the trade the git hooks made does not carry over |
| Licence scan covers `packages/*/{src,test}` and `scripts/` | `examples/` are sample apps copied out; build configs carry no shipped code |
| Generated `*_pb.ts` stay in the licence scan | `buf generate` carries the header; a plugin change that dropped it is worth seeing |
| The `.proto` copies are guarded like generated files | The source of truth is the server's `api/`; an edit made only here diverges |
| Reuse the server's App rather than create one | Same bot login, so `repo.botLogins` and `repo.appLogins` are the same in both repositories' configuration |
| Main's `.npmrc` for the agent install is a copy beside the toolchain action (2026-11) | The fix jobs check out only the action's directory from `main`, so the root file is not there to read, and reading `origin/main` from the workspace's git objects would tie the action to each caller's fetch depth |
| The agent install refuses a tree that could lead it outside the workspace (2026-11) | Flags and settings do not alone decide where a package manager writes; the shape of the tree does too. The toolchain action checks it before installing and again after, and `repo.test.mjs` runs those refusals for real. Audited against pnpm 9: a later major reads settings from files the branch controls, so a bump repeats the audit, and a test fails on any other major to say so |
| `repo.test.mjs` follows this repository's lint rules, `scripts/agent/**` does not | The first is this repository's file and the root ESLint checks it; the second is overwritten on every sync, so it stays excluded from ESLint, lint-staged and the licence scan |
| `fixer.commitNote` states the commit convention and names no hook (2026-11) | In a fix job the harness points `core.hooksPath` at its own scope hook, so `.githooks/commit-msg` does not run there; the sentence says what is asked, not what enforces it |
| The carry key is `patch-id --verbatim`, not `--stable` | `--stable` discards whitespace, so an indentation-only change that alters behaviour would carry an approval |
| Only an approval carries | Carrying a blocking verdict to a new head would dispatch a fixer on findings read against another commit |
| Credentials are probed before the round, not retried after | Nothing may run after the agent in its own job, and a probe spends no round at all |
| Test removals are evidence for the adjudicator, not a gate | Removing a test can be legitimate; the adjudicator already re-reads the code |

## Alternatives Considered

| Alternative | Why not |
|-------------|---------|
| Keep Husky, add the hooks there | A dependency and a second directory for what `core.hooksPath` does alone |
| Trust commits reachable from any `origin/*` branch and guard only fork-PR commits | Fixes the agent-loop case (bot commits are pushed to `origin`), but keeps the snapshot, its staleness and a guard whose rules need their own tests. The maintainer chose wafflebase's simpler model, where the only rule is "read a fork's diff first" |
| Keep the snapshot and the trust guard, narrow the guard to non-bot authors | Still refuses a maintainer finishing a contributor's branch, and trusting the bot login by name is a forgeable author field |
| `postinstall: git config core.hooksPath .githooks` (wafflebase) | Rewrites shared config from any `pnpm install`, including scratch worktrees; the explicit `setup.sh` step is needed for the Claude Code hooks regardless |
| A tracked `.claude/settings.json` | Claude Code runs what it names straight out of a checkout |
| `verify:fast` with integration against docker | Makes every push depend on docker running; CI already covers it |
| Publish `scripts/agent/` as an npm package | The workflows are files GitHub reads from this repository and cannot be imported, so a copy stays either way. What varied was moved into `.github/agent-harness` instead (2026-11), which makes the copy an overwrite |
| Refuse to carry when main changed a file the PR touches | #1426's own merge (#1424) touched two of the PR's files, so the rule blocked the carry it was built for; CI covers the same risk |
| Refund fix rounds lost to infra failures | The infra page latches the PR and only a rerun lifts it, which restarts the budget anyway; the refund could never change a decision |
| Keep earlier demotions across rounds (by finding identity) | On #1426 the finding that flipped blocking was raised against different files (`client.ts`, `change.ts`) from the one demoted (`converter.ts`); identity matching would not have held it, and wider matching drops real findings off the gate. Carry removes the re-review that caused the flip |
| Retry the fixer on another credential after it fails | Nothing may run after the agent in its own job |

## Tasks

- `docs/tasks/active/20260925-agent-pipeline-port-todo.md`
- `docs/tasks/archive/2026/10/20261001-harness-convergence-todo.md`
- `docs/tasks/active/20261009-remove-trusted-tree-guard-todo.md`
- `docs/tasks/active/20261114-harness-config-todo.md`
