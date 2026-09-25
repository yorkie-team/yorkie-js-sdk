# Scripts

Repository automation: the task-doc tooling, the verify gates, and the clone
setup with its hooks. None of it is published.

## Task docs

| Script | Invoked as | Role |
|---|---|---|
| `tasks-archive.sh` | `bash scripts/tasks-archive.sh` | Moves finished todos from `docs/tasks/active/` into `docs/tasks/archive/YYYY/MM/`, bucketed by each todo's `**Created**` line. A todo has to clear two bars: no unchecked boxes, and a parseable `**Created**` date — one missing the date is warned about and left alone. A matching `-lessons.md` rides along if it exists; a todo without one still moves. Neither bar reads the prose, so check a todo's Review section before trusting the result. |
| `tasks-index.sh` | `bash scripts/tasks-index.sh` | Regenerates `docs/tasks/README.md` and `docs/tasks/archive/README.md`. Never hand-edit those two. `docs/tasks/active/README.md` is hand-written prose and is left alone. |

Both take an optional tasks directory argument, defaulting to `docs/tasks`.

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
| [`test/`](test/) | `node --test` suites for the scripts and hooks above, run by `pnpm test:scripts` and in CI. Cases plant their trees under the OS temp directory. `harness-hooks.test.mjs` is the exception: its facts are about this tree, so it reads the checkout read-only, and every git write it makes goes to a scratch repository addressed with `git -C` and a stripped `GIT_*` environment. |

## Setup

| Script | Invoked as | Role |
|---|---|---|
| `setup.sh` | `bash scripts/setup.sh` | Copies `.githooks/` into `$GIT_DIR/githooks` and points `core.hooksPath` there, then runs `hooks/install.mjs`. Refuses when the hook sources differ from the default branch — `upstream/main` if present, else `origin/main` (override: `YORKIE_ALLOW_LOCAL_HOOKS=1`), because a re-run inside a reviewed branch would persist that branch's hooks — a guard against accident only, since a hostile branch's `setup.sh` can omit it. `--check` only reports missing hooks; `pnpm install` runs it through `prepare`. |

## Hooks

| File | Kind | Role |
|---|---|---|
| `../.githooks/commit-msg` | git | Subject ≤70, blank line 2, body ≤80. |
| `../.githooks/pre-commit` | git | `pnpm exec lint-staged` when source is staged. |
| `../.githooks/pre-push` | git | `pnpm verify:fast`. |
| `../.githooks/trusted-tree.sh` | sourced | Refuses to run the tree when the checkout carries commits on top of `origin/main` / `upstream/main` that this clone did not create (read from HEAD's and the branch's reflogs), or whose raw author address is not yours. Bypass: `--no-verify` or `YORKIE_ALLOW_FOREIGN_TREE=1`. |
| `hooks/install.mjs` | installer | Snapshots the Claude Code hooks into `$GIT_DIR/agent-hooks/` and wires them in the gitignored `.claude/settings.local.json`. A tracked settings file would run a checked-out branch's hooks. |
| `hooks/session-prime.sh` | Claude Code, SessionStart | Prints the workflow checklist. Silent under `GITHUB_ACTIONS`. |
| `hooks/guard-generated-files.sh` | Claude Code, PreToolUse(Edit\|Write) | Refuses edits to generated `*_pb.ts`, the `.proto` copies and the ANTLR output. Fails open. |
