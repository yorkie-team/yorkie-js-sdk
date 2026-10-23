# Keep a removal the undo never saw

**Created**: 2026-10-21
Fixes the `Text` half of yorkie-team/yorkie#2237. Go counterpart: yorkie-team/yorkie (same branch name).

## Problem

Two ways an identity-preserving undo of a `Text` deletion diverges replicas:

1. `RGATreeSplit.restore` clears a tombstone unconditionally, so an undo also
   revives text a concurrent deletion it never saw removed. Start `abcdefgh`;
   B deletes `d` and undoes it while A deletes `defgh`. Depending on delivery
   order A ends with `abcd` and B with `abc`.
2. A remote deletion removes every node whose creation it knew, so it also
   removes a node the deleter saw removed and an undo revived here
   (yorkie#2237: d1 `efh`, d2 `eh`).

## Layer decision

A per-node removal ledger in `RGATreeSplit`, the structure Text is built on:
the deletions that removed a node while it was live in the deleter's view,
and the undos that cancelled some of them. `removedAt` stays the latest
uncancelled deletion, so a node without undo looks exactly as before.

- A restore span carries `removedBy`, the deletion it undoes; restore cancels
  only that one. Spans without it (older clients) clear the tombstone as
  before.
- A remote deletion removes only nodes live in the deleter's view (creation
  known, and every deletion it knew cancelled by an undo it knew). A node it
  saw live but someone else removed records the deletion anyway, so a later
  undo of the other deletion keeps it removed in every delivery order.
- A redo records a new deletion; the next undo's span names the redo.
- GC keeps what a purged piece's ledger still said (`purgedLedger`); a
  restore that finds the piece gone recreates only offsets no other deletion
  holds, the answer an unpurged replica gives.
- The ledger and the purged ledgers travel in snapshots (`TextNode`
  `has_ledger`/`removals`/`removal_cancels`, `JSONElement.Text.
purged_removals`), and `RestoreSpan.removed_by` on the wire. Protobuf source
  of truth is yorkie; this mirrors it.
- `removedBy` is sent only while the server advertises `restore-removed-by`
  on the pack it last returned. A server without it re-encodes the change and
  drops the field, so the undoer would cancel one deletion while every other
  replica revived the span outright. Without the capability an undo drops
  `removedBy` before it runs, which is the restore every replica applied
  before this change.
- A purged run is recreated piece by piece, along the boundaries the purged
  ledger recorded, so a replica that collected splits the run where an
  unpurged one still has the pieces.

## Plan

- [x] RED: `test/unit/document/text_undo_removal_ledger_test.ts` through the
      protobuf converter: undo vs unseen concurrent deletion (both orders),
      yorkie#2237, undo-redo-undo, a deleter that saw the piece removed, the
      ledger through a snapshot, undo after GC with another deletion holding
      the piece. 7 of 8 fail before the fix. Plus one test for the
      capability gate.
- [x] Ledger in `RGATreeSplitNode`, live-in-view rule in `deleteNodes`,
      `removedBy` in `restore`, version vector in `retombstone`, purged
      ledger in `purge`.
- [x] `CRDTText.edit` returns spans with `removedBy`; `EditOperation`
      reverse/redo rewrites `removedBy` to the removal it made.
- [x] Protobuf fields and converter.
- [x] `restore-removed-by` capability: `Document` learns it from returned
      packs, `executeUndoRedoInternal` drops `removedBy` without it.
- [x] Integration against a stock yorkie main server and one built from the
      Go branch: only `gc_test` "gc targeting nodes made by deactivated
      client" fails, as it does on main without this change.
- [x] `pnpm verify:fast`.

## Out of scope

- Undo after GC still recreates a purged piece next to the following piece of
  its insertion (`findRestoreAnchor`), which can land after text inserted
  concurrently at that place, so a replica that collected and one that did not
  can order it differently. Fixing it needs the piece to keep its place.
- The Tree half of yorkie#2237 (`CRDTTree` has its own removal path).
- Purged ledgers are kept for the life of the document.
- Mixed versions: an SDK without the ledger ignores `removed_by` and revives
  the span outright, so it can still disagree with this SDK when an undo
  races a deletion -- the same disagreement it has today.
