# Run the git hooks from .githooks/ and drop the trusted-tree guard

**Created**: 2026-10-09

## Problem

`pre-commit` and `pre-push` sourced `.githooks/trusted-tree.sh`, which refused
to run `lint-staged` or `verify:fast` on a checkout carrying commits this clone
did not create. On an agent-loop branch every bot commit is such a commit, so a
maintainer finishing one could neither commit nor push without an override.
The override, `YORKIE_ALLOW_FOREIGN_TREE=1`, is inherited by `verify:fast`, and
the harness-hooks suite that pre-push runs asserts that the guard refuses —
so with the override set those tests fail, and a pushed foreign branch needed
`--no-verify` anyway.

The guard existed because the hooks were snapshotted into `$GIT_DIR/githooks`:
the snapshot pinned which hook runs, not what it invokes. The snapshot's own
cost was staleness — every hook change needed a `setup.sh` re-run per clone.

The maintainer chose wafflebase's simpler model: hooks run from the tracked
`.githooks/` through `core.hooksPath=.githooks`.

## Plan

- [x] Delete `.githooks/trusted-tree.sh`; drop its sourcing from `pre-commit`
      and `pre-push`, keeping the lint-staged / `verify:fast` gates and their
      pnpm-missing refusals.
- [x] `scripts/setup.sh`: set `core.hooksPath=.githooks` (relative, so every
      worktree runs its own checkout), remove the old `$GIT_DIR/githooks`
      copy; `--check` compares against `.githooks`. Keep the
      `YORKIE_ALLOW_LOCAL_HOOKS` source check, narrowed to the Claude Code
      hook sources (matching yorkie).
- [x] Decide on a wafflebase-style `postinstall`: no — `prepare` keeps
      `setup.sh --check` (see the design doc's decisions).
- [x] Decide on `scripts/hooks/install.mjs`: keep the Claude Code snapshot;
      record why in its header and in the design doc.
- [x] `scripts/test/harness-hooks.test.mjs`: drop the trust-guard and
      snapshot tests; add a foreign-branch regression, a worktree test and a
      no-reinstall test for the new install.
- [x] Docs: `CONTRIBUTING.md`, `CLAUDE.md`, `scripts/README.md`,
      `docs/design/agent-harness.md` (+ its README line), the
      maintainer-merge skill.
- [x] `pnpm verify:fast`; a throwaway-clone run of `setup.sh` showing
      pre-commit runs lint-staged and a foreign-authored commit goes through.

## Review

- Existing clones keep running the stale `$GIT_DIR/githooks` snapshot until
  someone re-runs `bash scripts/setup.sh`; `pnpm install` reports it through
  `setup.sh --check` because `core.hooksPath` is no longer `.githooks`.
