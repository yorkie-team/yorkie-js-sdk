# Scripts

Repository automation: the task-doc tooling and the clone setup. None of it is
published — these run by hand, not from the build or the package scripts.

## Task docs

| Script | Invoked as | Role |
|---|---|---|
| `tasks-archive.sh` | `bash scripts/tasks-archive.sh` | Moves completed task pairs from `docs/tasks/active/` into `docs/tasks/archive/YYYY/MM/`, bucketed by each todo's `**Created**` line. Eligibility is decided by unchecked boxes alone, so read a todo's Review section before trusting the result. |
| `tasks-index.sh` | `bash scripts/tasks-index.sh` | Regenerates `docs/tasks/README.md`, `docs/tasks/active/README.md`, and `docs/tasks/archive/README.md`. Never hand-edit those three. |

Both take an optional tasks directory argument, defaulting to `docs/tasks`.

## Setup

| Script | Invoked as | Role |
|---|---|---|
| `setup.sh` | `bash scripts/setup.sh` | A no-op that prints what to do instead: Husky owns the git hooks here, and `pnpm install` wires them through the `prepare` script. It exists so the instruction is discoverable at the same path as in the server repo. |
