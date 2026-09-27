# Lessons: read-only viewers should not publish selection presence

**Created**: 2026-09-26

Paired with `20260926-publish-selection-option-todo.md` (issue #1371).

## Notes

- The two publish sites are not symmetric. `syncPresence()` is the one a
  read-only view actually reaches (selection-only transactions and the tail of
  `initialize()`); the `presence.set` inside `setupDispatchTransaction()`'s
  content-edit branch is unreachable for a non-editable view, but it *is*
  reachable for an editable view that passed `publishSelection: false`
  explicitly. Both need the guard or the option leaks.
- The gate is evaluated at publish time rather than cached in the constructor.
  ProseMirror's `editable` is a prop that can flip (a viewer promoted to
  editor), and `EditorView.editable` reflects the current value.
- `packages/prosemirror`'s vitest config declares no `environment`, so unit
  tests run in node with no DOM. The new suite drives the binding through a
  minimal fake view — a real `EditorState` (prosemirror-state is DOM-free)
  plus a hand-rolled `dom` / `props` / `setProps` / `updateState` / `dispatch`
  shell. That is enough to exercise `initialize()` and the overridden
  `dispatchTransaction`.

## Self review

Not run: this branch was produced by the autonomous agent workflow, which is
granted no tool that can dispatch the reviewer subagent. Review falls to CI,
`@claude review` and a human on the PR.
