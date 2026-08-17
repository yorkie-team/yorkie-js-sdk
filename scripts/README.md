# Scripts

Repository automation: the task-doc tooling and the clone setup. None of it is
published — these run by hand, not from the build or the package scripts.

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

## Directories

| Directory | Contents |
|---|---|
| [`test/`](test/) | `node --test` suites for the scripts above, run by `pnpm test:scripts` and in CI. Every case plants its tree under the OS temp directory and shells out to nothing, so the suite can never touch the checkout it runs from. |

## Setup

| Script | Invoked as | Role |
|---|---|---|
| `setup.sh` | `bash scripts/setup.sh` | A no-op that prints what to do instead: Husky owns the git hooks here, and `pnpm install` wires them through the `prepare` script. It exists so the instruction is discoverable at the same path as in the server repo. |
