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

_Appended as the work proceeds._
