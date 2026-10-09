# Scripts

Repository automation: the task-doc tooling, the verify gates, and the clone
setup with its hooks. None of it is published.

## Task docs

| Script | Invoked as | Role |
|---|---|---|
| `tasks-archive.sh` | `bash scripts/tasks-archive.sh` | Moves finished todos from `docs/tasks/active/` into `docs/tasks/archive/YYYY/MM/`, bucketed by each todo's `**Created**` line. A todo has to clear two bars: no unchecked boxes, and a parseable `**Created**` date — one missing the date is warned about and left alone. A matching `-lessons.md` rides along if it exists; a todo without one still moves. Neither bar reads the prose, so check a todo's Review section before trusting the result. |
| `tasks-index.sh` | `bash scripts/tasks-index.sh` | Regenerates `docs/tasks/README.md` and `docs/tasks/archive/README.md`. Never hand-edit those two. `docs/tasks/active/README.md` is hand-written prose and is left alone. |
| `tasks-check.mjs` | `node scripts/tasks-check.mjs --base origin/main [--remote] [--strict]` | Reports finished task records still in `docs/tasks/active/`: a todo the branch added or edited whose boxes are all ticked (from the diff against `--base`), and, with `--remote`, any active todo that *declares* a tracking number (`Tracked as #N`, `Fixes #N`) whose issue is closed or PR is merged (via `gh api`). A number the todo only mentions is not a tracking number. A finished todo with no `**Created**: YYYY-MM-DD` line is reported as such, since the archiver would skip it; a repository `gh` cannot see is an error, not an empty result. An active todo that declares no number of ours is one `--remote` could not check: it is named as such and counted in the clean line. When that leaves no todo resolved at all, a bare `--remote` run examined nothing and reports an error, because that is not a pass; with `--base` given as well the run did check something, so it is a note instead — otherwise the pre-merge gate would be red on every merge until todos no PR is touching grow a tracking line. Warnings by default -- a todo sits in active/ for the whole review on purpose -- as `::warning` annotations under Actions; a check that could not run at all is an `::error` line, never a silent pass. `--strict` exits 1 on either and is the maintainer's pre-merge gate. Runs in CI on every PR, diff half only. |

### Why the CI step is diff-only

The "Check task records" step in `.github/workflows/ci.yml` runs the pull
request's **own copy** of `tasks-check.mjs`, on a workflow any fork PR can
trigger, so it gets no token and no `--remote`: a credential in that step's
environment would be handed to branch-authored code. The remote half belongs
on the maintainer's machine, where the `gh` credential is already theirs. The
checkout uses `fetch-depth: 0`, because on a `pull_request` event a depth-1
HEAD is a merge commit git treats as parentless and `origin/<base>...HEAD`
has no merge base.

`tasks-archive.sh` and `tasks-index.sh` take an optional tasks directory
argument, defaulting to `docs/tasks`; `tasks-check.mjs` spells it `--tasks`.
`tasks-archive.sh` and `tasks-check.mjs` apply the same "is this todo
finished" rule — an unticked box at the start of a line — so a todo the check
flags is always one the archiver will move.

## Verification

| Script | Invoked as | Role |
|---|---|---|
| `verify-doc-links.mjs` | `pnpm verify:doc-links` | Walks the documentation graph from `CLAUDE.md`, `AGENTS.md`, and `README.md`, and fails on a link that resolves to nothing. Archived task records are reached but not walked — a finished task's citations are a record of what was true then. Runs in CI right after `pnpm lint`. |
| `verify-license.mjs` | `pnpm verify:license` | Fails on any source file under `packages/*/src`, `packages/*/test` or `scripts/` without the Apache 2.0 grant clause in its first 40 lines. Scanning nothing is a failure, not a pass. Runs in CI and in `verify:fast`. |
| `direct-run.mjs` | imported | `isDirectRun(import.meta.url)`: whether a verify script was run or imported, compared by realpath so a symlinked invocation still runs the CLI. |

`pnpm verify:fast` is the local gate that strings these together with lint,
the SDK build and every unit suite that needs no server (~30s). `pre-push` runs
it.

## Directories

| Directory | Contents |
|---|---|
| [`agent/`](agent/README.md) | The `@claude` pipeline's Node package, vendored from yorkie-team/yorkie with its own npm lockfile; outside the pnpm workspace and the root lint and licence gates. Its README lists what was adapted here and how to sync. Tested by `agent-scripts.yml`, not `pnpm test:scripts`. |
| [`test/`](test/) | `node --test` suites for the scripts and hooks above, run by `pnpm test:scripts` and in CI. Cases plant their trees under the OS temp directory. `harness-hooks.test.mjs` is the exception: its facts are about this tree, so it reads the checkout read-only, and every git write it makes goes to a scratch repository addressed with `git -C` and a stripped `GIT_*` environment. |

## Setup

| Script | Invoked as | Role |
|---|---|---|
| `setup.sh` | `bash scripts/setup.sh` | Sets `core.hooksPath=.githooks` (relative, so every worktree runs its own checkout's hooks), removes the `$GIT_DIR/githooks` copy older versions installed (only when `core.hooksPath` still named it, and only after the source check below passes), then runs `hooks/install.mjs`. Refuses that last step when the Claude Code hook sources (`scripts/hooks`, `scripts/setup.sh`, `scripts/*.mjs`) differ from the default branch — `upstream/main` if present, else `origin/main` (override: `YORKIE_ALLOW_LOCAL_HOOKS=1`), because a re-run inside a reviewed branch would snapshot that branch's Claude Code hooks — a guard against accident only, since a hostile branch's `setup.sh` can omit it. `--check` only reports — missing hooks, or a clone still on that old copy (which runs the trusted-tree guard) — and never fails; `pnpm install` runs it through `prepare`. |

## Hooks

| File | Kind | Role |
|---|---|---|
| `../.githooks/commit-msg` | git | Subject ≤70, blank line 2, body ≤80. |
| `../.githooks/pre-commit` | git | `pnpm exec lint-staged` when source is staged. |
| `../.githooks/pre-push` | git | `pnpm verify:fast`. |
| `hooks/install.mjs` | installer | Snapshots the Claude Code hooks into `$GIT_DIR/agent-hooks/` and wires them in the gitignored `.claude/settings.local.json`. A tracked settings file would run a checked-out branch's hooks the moment a session opens. |
| `hooks/session-prime.sh` | Claude Code, SessionStart | Prints the workflow checklist. Silent under `GITHUB_ACTIONS`. |
| `hooks/guard-generated-files.sh` | Claude Code, PreToolUse(Edit\|Write) | Refuses edits to generated `*_pb.ts`, the `.proto` copies and the ANTLR output. Fails open. |
