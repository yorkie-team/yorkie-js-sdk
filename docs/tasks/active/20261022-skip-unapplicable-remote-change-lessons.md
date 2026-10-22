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
