# Incremental Persistence Engine — Lessons (S2)

**Created**: 2026-09-16

## Carried in from S1 and the design work

**Read for the primitive before building one.** Replay looked like the hard
part of this task until `applySnapshot` turned out to already do it: rebuild
the root, then `applyChanges(localChanges, OpSource.Local)` on top. Public
`applyChanges` applies without touching the push queue, which is exactly the
seam restore needs.

**The two kinds of pending change are opposites, and confusing them duplicates
operations.** Changes inside a `toBytes` envelope are *already applied* to the
snapshot's root — `toBytes` serializes the live root — so restore queues them
without applying. Changes in the appended log were written after the snapshot,
so restore must both apply and queue them.

**A fixed compaction threshold cannot serve both a note and a sheet.** The
measured break-even is ~50 edits for a 5,000-character note and ~6,300 for an
8,000-cell sheet. The threshold has to be relative to the snapshot, which also
makes the pathological case — frequent compaction of an expensive snapshot —
unreachable by construction.

**Presence-only changes must be appended.** Their content is worthless after a
restore, but they consume a `clientSeq` and `restoreFromBytes` does not
renumber, so an omitted one leaves a hole and the first restored push is
rejected. Excluding presence was right only while every change cost a snapshot.

**Benchmark by editing, not by constructing.** A fixture built in one
`update()` understates this design's cost by two orders of magnitude: a
20,000-character note is 59 KB assembled at once and 6.60 MB typed one
character at a time, because offline there is no GC to collect the splits.

**Tests that re-state production logic pass while production regresses.** S1
found the session-lock tests asserting against a local copy of the guard. When
adding coverage here, point it at the real function.

**`docker compose up` fails outright if anything else holds 8080.** S1's
integration runs silently went to a sibling project's Yorkie server for that
reason, and the failure reads as "the server would not start".

## From implementation

**The base snapshot already contains the pending queue.** `toBytes` bundles
un-pushed changes into its envelope, so the append watermark must start at the
highest `clientSeq` the snapshot carries — not at the checkpoint. Starting at
the checkpoint logged those changes a second time and a restore would have
applied them twice. The test that caught it asserts no logged `clientSeq`
appears among the ones the snapshot carries; keep that assertion.

**`ChangeStruct` has no `clientSeq` field.** It is encoded inside the hex
`changeID`, so `struct.clientSeq` is `undefined` and a filter on it silently
matches nothing — which is how the first write path appended zero changes while
every other signal looked healthy. `getPendingChangesAfter` returns the pairing
so no caller has to decode hex. A `pnpm sdk build` would have caught the
property access as a type error; `vitest` alone does not typecheck, so run the
build before believing a green test run.

**Persist writes are a chained promise queue, so tests must drain it.** By
design the store trails the document and may never lead it, which means a
single `await` resolves fewer links than the chain holds and reads a
half-written log. One macrotask turn (`setTimeout(…, 0)`) runs every pending
microtask; the `settled()` helper in `offline_persist_sync_test.ts` is that,
not an arbitrary sleep. Three appends looked like one until it was added.

**"The store entry is absent" was a proxy assertion, and it expired.** The
re-anchor guards checked that a data-loss path cleared the key. Attach now
re-establishes a base immediately afterward, because persistence should
continue after a re-anchor rather than stop, so the key is present again. The
property worth asserting was always that nothing *stale* survives — assert the
restored content, not the key's absence.

**Do not assert that a fresh attach queues nothing.** A re-anchored attach
legitimately produces a change of its own (presence, an initial root), so
`pendingChangeStructs.length === 0` is asserting that attach does nothing.
