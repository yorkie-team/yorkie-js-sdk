**Created**: 2026-04-28

# Lessons: Tree reverseOp pre-tombstoned filtering

## Files touched

| File | Change |
|------|--------|
| `packages/sdk/src/document/operation/tree_edit_operation.ts` | Replaced `clearRemovedAt` (which `traverseAll`-cleared every descendant) with `cloneAndDropPreTombstoned` that drops descendants matching the `preTombstoned` set before clearing `removedAt` on survivors. Plumbed `preTombstoned: Set<string>` through `toReverseOperation`'s signature. |
| `packages/sdk/src/document/crdt/tree.ts` | Exposed the existing `preTombstoned` set in `editT`'s return tuple. The set was already populated inside `editT` (with a comment explaining the intent) but never returned — the infrastructure was half-implemented. |
| `packages/sdk/test/integration/history_tree_split_repro_test.ts` | Single-it regression test that asserts the redoStack-top `contents` size is constant across 4 type-undo-undo-redo cycles. |

No changes to `history.ts`, `document.ts`, `reconcileOperation`, or any
other file. The Go server has no reverseOp generation logic, so no
parallel fix was needed there.

## Pitfalls

1. **`clearRemovedAt`'s `traverseAll` was over-eager.** The original
   helper walked every descendant of the deep-copied subtree and
   cleared `removedAt`, resurrecting nodes the user had independently
   deleted in earlier ops. Repeating the cycle compounded the wire
   payload because each cycle revived the previous cycle's tombstones,
   then re-tombstoned them with the current edit's ticket, then the
   next reverseOp picked them up again as "newly tombstoned by this
   edit."

2. **Ticket equality is unreliable for filtering.** A first-pass fix
   tried to clear `removedAt` only on nodes whose tombstone ticket
   equaled the current edit's ticket. This failed because LWW
   overwrites of `removedAt` on already-tombstoned nodes change the
   ticket — when a parent delete re-tombstones a child whose
   `removedAt` was previously set by a char-undo, the new ticket wins
   the LWW comparison. Capturing the pre-edit tombstone state by ID
   (`preTombstoned`) is the correct invariant.

3. **`_children` direct mutation is fine because it feeds
   `traverseAll`.** The serializer (`toTreeNodes` in
   `api/converter.ts`) walks `_children` via `traverseAll`. Filtering
   the deep-copied clone's `_children` reliably propagates to the wire
   payload — no separate "skip removed nodes" pass needed during
   serialization.

4. **Production data analysis preceded the SDK repro by a wide
   margin.** Initial production analysis of decoded yorkie-meta
   changes pointed at the wrong measurement target (`undoStack` top
   instead of `redoStack` top). The wire op that grows is the one
   *popped from* `redoStack` and applied — measure that one before
   calling `history.redo()`, not the new reverseOp pushed onto
   `undoStack` after the redo.

5. **Single-client repro is enough.** Initially we suspected GC. With
   the fix targeting deepcopy filtering, GC turned out to be
   irrelevant: the bug reproduces with one offline `Document`. This
   simplified the repro test (no `withTwoClientsAndDocuments`, no
   docker server).

6. **Pre-existing `preTombstoned` set was a strong signal.** Comments
   in `tree.ts` (`"Track nodes already tombstoned before this edit so
   the reverse operation does not accidentally resurrect them"`) and
   the unused-but-populated `preTombstoned` Set indicated that someone
   had recognized the issue earlier. The fix essentially completed an
   intent that was left half-done.

## Implementation notes for the broader Tree split work

These notes belong here rather than in `docs/design/` because they're
JS-SDK-specific and tie to specific file/function names that drift
over time. The cross-SDK design lives at
`yorkie/docs/design/tree-split-undo-redo.md`.

- The `splitLevel === 1` guard in `execute()` was relaxed to
  `splitLevel > 0` after L2 forward convergence was fixed; the
  `toSplitReverseOperation` method already handles any splitLevel via
  `boundarySize = 2 * splitLevel`.
- L2 redo at the back position re-parents into a tombstoned element
  unless §7.4 Empty Sibling Re-Parenting in `tree.ts` checks
  `!insNext.isRemoved`.
- `splitElement` recomputes `visibleSize` from children's
  `paddedSize()`. Since `paddedSize()` does not return 0 for removed
  nodes, the recomputation must explicitly skip removed children to
  avoid inflating the parent's size when tombstoned text nodes are
  present in the left partition.

## Test layout reference

`history_tree_test.ts` Sections A–H cover L1 single-client (A),
single-client chained (B), multi-client convergence (C), edge cases
(D), L2 single-client (E), L2 chained (F, 1 skip on consecutive L2
splits), L2 multi-client (G, 18 tests), L2 multi-client edge cases
(H). The new `history_tree_split_repro_test.ts` is a single-it
regression for descendant filtering, separate from the table-driven
matrix.
