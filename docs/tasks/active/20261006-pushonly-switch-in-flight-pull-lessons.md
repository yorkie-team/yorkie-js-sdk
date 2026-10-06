# Lessons: Drop a pull already in flight when switching to push-only

**Created**: 2026-10-06

- Queueing a state change for ordering (#1243) also delays every guard that
  reads that state. Ask what reads the field between the call and the
  queued task, not only what the task itself does.
- A timing race that shows up about once in ten real runs can be made
  deterministic by holding the RPC after the server answers. Do not
  reproduce it with sleeps.
- `client_test.ts` already wraps `rpcClient.pushPullChanges` to see what the
  server answered. Holding the same wrapper on a promise turns that pattern
  into a gate.

## Self review

Reviewer: a general-purpose subagent over the working-tree diff against
`origin/main`, not the CI lens panel.

- Round 1 (correctness, test adequacy): no blocking finding, so the loop
  stopped. Took: `return await` in the queued task. Without it `finally`
  ran at the inner call's first `await`, which is only correct while
  `changeDocumentSyncMode` sets the mode before awaiting anything. Also took
  test changes: cover `RealtimeSyncOff`, catch up through the realtime loop
  instead of an explicit `sync` (which would hide a stuck loop), bound the
  waits, and restore in `finally`. Not taken: a P → R → P test (not
  deterministic, see the todo) and counting a pause before `attach`
  (documented in the comment instead).
- Lesson: `return promise` inside `try` lets `finally` run before the promise
  settles. When `finally` undoes a guard, `return await`.

## CI review panel

- Round 1 (blast radius): took the one blocking finding. Dropping a pull for
  `pendingPullPauses` alone relied on the queued switch landing to get the
  changes re-pulled — the sync loop had already cleared
  `changeEventReceived`, and a switch that rejects (deactivate/detach racing
  it) left nothing to re-drive the pull. The drop now re-arms
  `changeEventReceived` when the attachment's own mode still pulls.
- Lesson: when a guard discards work on behalf of a state change that has not
  happened yet, the recovery path cannot be the state change itself. Re-arm
  the retry signal at the point of the drop.

- Round 2 (blast radius): took the one blocking finding. Round 1's re-arm of
  `changeEventReceived` is dead weight in `Manual`, where `needRealtimeSync`
  returns false unconditionally, so a pull dropped for a pending count alone
  had nothing to re-drive it. The guard no longer drops on that count for a
  Manual document — the only request in flight there is an explicit
  `sync(doc)`. `Polling` keeps dropping: it ignores the flag too, but its
  interval timer re-pulls at the next tick.
- Lesson: a retry signal only recovers work in the modes that read it. Check
  every mode the drop condition admits against the consumer of the signal,
  not just the mode the bug was reported in.
