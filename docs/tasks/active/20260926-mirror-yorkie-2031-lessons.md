# Lessons: mirror yorkie#2031

**Created**: 2026-09-26

## Notes

- The five items are independent; only item 1 touches convergence-critical
  segmentation, so it carries the unit test.
- Item 5 needed a JS shape for Go's `return result, err`: `Change.execute`
  takes an optional accumulator array that it fills as each operation runs, so
  a throwing caller can still see the prefix that mutated the root.
- Item 4 is implemented as a thin wrapper around the existing body
  (`applyChangeInternal`, `executeUndoRedoInternal`) rather than reindenting
  the whole method — this is the JS equivalent of Go's deferred reset and
  covers every error path, including the per-operation loop in undo/redo.

## Self review

- `/self-review` was not run: this was an autonomous run with no reviewer
  subagent available. The PR's CI, `@claude review` and a human are the
  reviewers.
