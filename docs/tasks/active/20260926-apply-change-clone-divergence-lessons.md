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

The root may still hold a prefix of the failed change, whose `changeID` never
advanced and which is never queued. An earlier revision of this PR queued the
landed prefix as a truncated change and advanced `changeID`, and CI showed how
subtle that is: advancing `changeID` without queueing leaves a clientSeq hole
the server rejects (`change clientSeq must increase by one`). Since Go records
nothing for a failed change either, that contract was split out into a design
issue instead of being settled in this PR.

## Narrowed after #1394

#1394 landed the same clone reset for `applyChange` and `executeUndoRedo`
first, so this PR was rebased down to the one remaining call site, `update()`,
and reuses `clone_reset_test.ts` instead of adding a separate test file.
