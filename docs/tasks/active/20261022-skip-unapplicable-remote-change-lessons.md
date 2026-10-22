# Skip a remote change this SDK cannot apply, as Go does — lessons

**Created**: 2026-10-22

- `Change.execute` already had the two halves of this fix written down: it
  wraps only remote failures in `ChangeApplyError` because the checkpoint does
  not advance past a change that throws, and it `continue`s past an operation
  whose `execute` returns nothing. Skipping an unapplicable remote operation
  needed no new mechanism, just the existing `undefined` return.
- `fromPresenceChange` is reached by the push path too (an echo of this
  client's own change), so a decoded `DELETE` has to resolve to the same
  presence state a server-side delete would, not to a dropped change.
- CI failed on this branch for a reason the branch did not cause: the server
  container crash-looped against a MongoDB that was not accepting connections
  yet, so `wait-for-yorkie` timed out with nothing ever served. The list form
  of `depends_on` only waits for the dependency to *start*. Sibling branches
  running the same compose minutes earlier passed, which is what a startup
  race looks like from the outside -- the fix is to gate on
  `condition: service_healthy`, not to retry the lane.
- Panel round 1: the skip was written as a guard on the one branch that
  prompted it (`counter.isDedup()`), but Go's `skipUnlessLocal` wraps the
  whole `Execute`. A missing target or a non-counter target is just as
  unrecoverable from a stored change, so the skip belongs around the whole
  body, with the throwing path factored out as `executeInternal`.
- The same "a stored change must never wedge the pull" rule applies to the
  decoder, not just to operations. `fromPresence` trusted both the optional
  `presence` message (`presence!`) and that every value is JSON -- either
  assumption fails on a change a non-SDK writer can store, and a `TypeError`
  or `SyntaxError` out of the pack decode wedges attach permanently.
- Panel round 2: `OpSource` does not say what the skip actually needs to know.
  The pull path does not only apply remote changes -- `applySnapshot` replays
  the queued local ones on top of the snapshot root, under the source each one
  originally ran with (`replaySourceOf`, so `Local` or `UndoRedo`). A queued
  increase whose counter the snapshot removed threw there and wedged the very
  pull the skip was added to unwedge. Widening `OpSource` with a `Replay`
  member would have erased the `UndoRedo` distinction `replaySourceOf` exists
  to preserve, so the signal is a separate `isReplay` flag threaded through
  `Change.execute` into `Operation.execute`. The question an operation is
  really asking is "is a caller waiting on this mutation", and only a live
  `update` or an undo/redo answers yes.
