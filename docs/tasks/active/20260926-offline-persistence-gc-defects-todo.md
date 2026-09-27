**Created**: 2026-09-26

# Three defects in offline-persistence repair and GC accounting

Issue [#1377]. Three independent defects reported while porting v0.7.22 into
`yorkie-ios-sdk`, all in code added or touched by #1341/#1350/#1354. They share
a filing, not a mechanism, so each gets its own fix and its own test.

## Goal

1. Log-discontinuity repair must not rewind the `clientSeq` counter below what
   the discarded header said the server had already acknowledged.
2. A released tombstone's zero `sizeInGC` record must not outlive the element.
3. `converter.fromObject` must not bump a decoded tombstone's `removedAt`.

## Plan

### 1. `clientSeq` rewind on log-discontinuity repair

`client.ts` re-restores from the snapshot bytes when the appended log cannot
back the stored header. That returns `checkpoint`, `epoch` and `changeID` to the
snapshot's values — correct for the first two, wrong for the counter: the
header's counter records sequence numbers the server has already taken. Minting
them again gets them skipped as duplicates and then dropped from
`localChanges` by the next ack, silently.

- [x] `ChangeID.setClientSeq` — the counter-only sibling of `setLamport`.
- [x] `Document.advanceClientSeqTo(clientSeq)` — move the counter forward only,
      never back.
- [x] Call it in the `log-discontinuity` branch with `ackedWatermark` — the
      header's checkpoint, not its counter. The server validates continuity
      from the position it holds, so resuming at a counter that leads it would
      mint past the server and wedge every push on `ErrInvalidClientSeq`; and
      the entry that lead came from is exactly the one the log lost.
- [x] Unit test: snapshot counter below the header's, repair, assert the next
      edit mints above the header's.

### 2. Permanent zero `sizeInGC` record

`sizeInGC` is a `Map` keyed by element identity, so it strongly retains every
element it has a record for. `release` writes a zero record for a tombstone that
the restore orphaned, and that tombstone is dropped from
`gcElementSetByCreatedAt`, so nothing ever collects it and nothing ever
deregisters it — the record, and the element it pins, are permanent.

- [x] Make `sizeInGC` a `WeakMap`. It is only ever read/written by element
      identity — never iterated, never sized — so the record's lifetime can
      simply be the element's. The zero marker still stands for exactly as long
      as the tombstone stays addressable, which is the only window in which
      `moveSizeToGC` or `accMovedElement` can reach it.
- [x] No new test. Retention is not observable from inside the process without
      forcing a GC, and the accounting the change must not disturb is already
      pinned by `gc_containment_test.ts`, `docsize_rebuild_drift_test.ts` and
      `document_size_test.ts`, which all stay green.

### 3. `fromObject` mutates decoded tombstones

`rht.set(key, value, value.getPositionedAt())` marks the LWW loser removed so it
does not surface in `ownKeys`. A decoded tombstone is already removed, and
`CRDTElement.remove` accepts any later ticket, so its `removedAt` is bumped from
`R` to the occupant's `positionedAt`. GC on that replica then waits on the wrong
ticket, and the replica's re-serialized snapshots and `docSize.gc` disagree with
replicas that never reloaded.

- [x] Guard the losing branch on `!value.isRemoved()`. An already-removed loser
      needs no marking: the marking exists only to hide it from `ownKeys`.
- [x] Unit test in `element_rht_order_test.ts`: a losing tombstone keeps its own
      `removedAt`.

## Verification

- [x] `pnpm verify:fast`
- [x] Targeted unit files for each of the three.

[#1377]: https://github.com/yorkie-team/yorkie-js-sdk/issues/1377
