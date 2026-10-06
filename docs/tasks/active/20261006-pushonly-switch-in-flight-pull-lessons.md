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

