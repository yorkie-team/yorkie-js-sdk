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
`toSortedJSON` shows it and the rebuilt clone hands it to the next updater.
That prefix is not recorded, so it is state no peer ever sees — a real gap, but
a separate one, and the tests here pin it rather than close it.

## Committing the landed prefix was the wrong shape — reverted

An earlier revision of this branch queued the landed prefix as a truncated
change, pushed its reverse ops and advanced `changeID` with it. Review rejected
the approach and it was reverted. Three reasons, in order of weight:

- **It bypasses the gates.** `update()` validates the document's server-supplied
  ruleset and the size cap against the *clone*, which holds the whole change.
  The artifact committed on failure is a different one — the prefix — and
  schema rules are not subset-monotone, so a peer that makes one operation
  throw could force the victim to push state no client-side check ever saw.
- **It is a new data-model contract.** A failed change becoming a pushable one
  is a change to both SDKs (Go's `Change.Execute` returns an empty result on
  error), not something issue #1366 scoped, and it belongs in a design doc.
- **The undo/redo twin published while the stale clone was installed.** The
  clone is dropped by the outer `executeUndoRedo` wrapper, i.e. *after* the
  inner method publishes, so a synchronous subscriber calling `getRoot()`
  would read the full-undo clone — state that never reached the root.

The pair that *was* right, and is worth recording for whoever picks the design
issue up: queueing and advancing `changeID` have to move together. Advancing
without queueing leaves a clientSeq hole the server rejects (`change clientSeq
must increase by one`); queueing without advancing reissues tickets the landed
operations already burned into the root, colliding in
`elementPairMapByCreatedAt`. And the operation that threw may have mutated the
root below operation granularity, so no accumulator of *completed* operations
describes the root exactly.

## Narrowed after #1394 and #1403

#1394 landed the clone reset for `applyChange` and `executeUndoRedo`, and
#1403 landed it for `update()` while this branch was open. What is left here
is the regression coverage in `clone_reset_test.ts` and the task notes.
