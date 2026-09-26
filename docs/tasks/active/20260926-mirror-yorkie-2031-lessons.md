# Lessons: mirror yorkie#2031

**Created**: 2026-09-26

## Notes

- The five items are independent; item 1 touches convergence-critical
  segmentation, and items 2–5 each carry a unit test as well (see
  `test/unit/document/crdt/tree_boundary_anchor_test.ts` and
  `test/unit/document/partial_change_test.ts`).
- Item 5 needed a JS shape for Go's `return result, err`: `Change.execute`
  takes an optional `ExecutionResult` accumulator that it fills as each
  operation runs, so a throwing caller can still see the prefix that mutated
  the root — down to the `opInfos` it must publish and the reverse operations
  that undo it.
- Item 4 is implemented as a thin wrapper around the existing body
  (`applyChangeInternal`, `executeUndoRedoInternal`) rather than reindenting
  the whole method — this is the JS equivalent of Go's deferred reset and
  covers every error path, including the per-operation loop in undo/redo.

## Self review

- `/self-review` was not run: this was an autonomous run with no reviewer
  subagent available. The PR's CI, `@claude review` and a human are the
  reviewers.

### Review round 1 (panel)

- Forward alignment changes the contract of `splitNode`/`splitText`: they no
  longer cut at the offset asked for. The two callers that assumed an exact
  cut, `RGATreeSplit.isolateRange` and `CRDTTree.isolateTextRange`, now return
  `undefined` when the aligned boundary reaches the end of the piece (the
  requested range was the trailing half of a pair), and their callers skip
  that piece instead of dereferencing the next one.
- Recording the executed prefix is not enough on its own: the prefix is a
  local change like any other, so it also goes on the undo stack and is
  published as a `LocalChange`. Otherwise every consumer that mirrors the
  document from events — the ProseMirror binding, devtools — describes a root
  that moved without them for the rest of the session.
- The operation that threw belongs in the prefix too. `Tree.edit` applies the
  `from` split before it resolves `to`, so the root has taken part of it; a
  change that omitted it would leave peers without a mutation this replica
  made.
