# Lessons — clone/root divergence on a failed change (issue #1366)

**Created**: 2026-09-26

## Root-first does not fix it

The issue's cheap option is to execute the root first and the clone second.
That only helps if `Change.execute` is atomic, and it is not: any operation can
throw after its predecessors have mutated the root. Reordering moves the
partial state from the clone to the root and leaves the pair just as diverged.

## The clone is a cache

`update()` already drops the clone on updater failure, schema failure and the
size limit, and `ensureClone()` rebuilds it from the root. Dropping it when the
root pass throws is the same move, and it costs one deep copy on a path that
has just thrown.

## Dropping the clone is not a rollback

The root may still hold a prefix of the failed change. Dropping the clone hides
the divergence from the *clone*, but the prefix is still real document state:
`toSortedJSON` shows it and the rebuilt clone hands it to the next updater. So
the prefix has to be recorded, or it is state no peer ever sees.

## Queueing and advancing move together

`update` now queues the landed prefix as a truncated change **and** advances
`changeID`. Doing only one of the two is what an earlier revision got wrong:
advancing without queueing leaves a clientSeq hole the server rejects (`change
clientSeq must increase by one`), and queueing without advancing reissues
tickets that the landed operations already burned into the root, colliding in
`elementPairMapByCreatedAt`. When nothing landed neither moves, and the next
change reuses the failed change's ID.

`Change.execute` takes an optional `ExecutionResult` accumulator so the catch
block can read which prefix reached the root; the operation that threw may have
mutated the root below operation granularity, and that part stays unrecorded.

## Narrowed after #1394

#1394 landed the same clone reset for `applyChange` and `executeUndoRedo`
first, so this PR was rebased down to the one remaining call site, `update()`,
and reuses `clone_reset_test.ts` instead of adding a separate test file.
