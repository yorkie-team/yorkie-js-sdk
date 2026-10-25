# Dependabot Security Bump (2026-10) — Lessons

**Created**: 2026-10-25

## `pnpm up --depth Infinity` does not move overridden transitives

Running `pnpm up -r --depth Infinity <pkgs>` exited 0 and left every
transitive advisory in place. The transitive versions were held by the
lockfile and the existing overrides. Bounded overrides remain the tool for
transitive fixes.

## Bump a ProseMirror view together with its model

`prosemirror-view@1.42.3` declares `prosemirror-model ^1.25.8`. With the model
still locked at 1.25.4, pnpm installed both copies, and `tsc` failed with
`Node is not assignable to Node` across the two copies. Bumping the view alone
is never enough when the view's floor on the model rises. Check
`npm view prosemirror-view@<ver> dependencies` first.

## Relink after `pnpm up` before trusting a type error

After `pnpm up -r prosemirror-model` the lockfile held only 1.25.12, yet the
next build still reported types from 1.25.4. A `pnpm i --frozen-lockfile`
relinked `node_modules`, and the build passed. If the lockfile has no trace of
a version that `tsc` mentions, reinstall before debugging further.

## Regenerate npm lockfiles with the npm that wrote them

`scripts/fixtures/package-exports/package-lock.json` was written by npm 11.
Running the local npm 10 stripped every `libc` field, which npm 11 uses to pick
glibc/musl native binaries. `npx -y npm@11 install` produced a diff that
contains only the version changes.

## Local lint fails on untracked worktrees

`pnpm lint:check` fails on `.claude/worktrees/*/...` (5 prettier errors), on
main too. Those directories are local agent worktrees, untracked and unseen
by CI. Use `--ignore-pattern '.claude/**'` locally.

## See Also

- [20261025-dependabot-security-bump-todo.md](20261025-dependabot-security-bump-todo.md) — plan and results
- [20260914-dependabot-security-bump-lessons.md](../archive/2026/09/20260914-dependabot-security-bump-lessons.md) — the previous bump's override rules
