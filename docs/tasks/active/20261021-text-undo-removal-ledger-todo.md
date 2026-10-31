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
uncancelled deletion, so a node without undo looks exactly as before. The
rules are Go's as merged in yorkie-team/yorkie#2310; its
`docs/design/undo-redo.md`, "Removal Ledger", is the design. This repository
has no copy of that document.

- A restore cancels the one uncancelled removal by the actor running the
  undo. An actor removes a piece only while it is live in its view, so the
  restore needs no field to name it, and no wire change or capability.
- A remote deletion removes only nodes live in the deleter's view (creation
  known, and every deletion it knew cancelled by an undo it knew). A node it
  saw live but someone else removed records the deletion anyway, so a later
  undo of the other deletion keeps it removed in every delivery order. A
  redo applies the same rule with the change's version vector.
- No second uncancelled removal by one actor is recorded: only a change whose
  vector leaves out its own removal sends one.
- A redo, and the undo of an insertion, return a reverse that names only the
  pieces they recorded a removal on. An identity reverse left with no spans
  degrades to an empty undo edit at the head, and an undo edit that inserts
  nothing runs as a no-op there.
- GC keeps a tombstone until every removal and cancel in its ledger is known
  everywhere and a single removal holds it (`heldFromPurge`), and prunes the
  removal-cancel pairs every replica knows. A restore that finds a piece
  purged recreates it with a stand-in removal by the undoing actor at
  lamport 0 and its cancel, anchored before the nearest following piece of
  its insertion.
- Snapshots carry the ledger in `TextNode.removal_events`; a reader refuses
  events that break the pairing rules. Protobuf source of truth is yorkie;
  this mirrors it.

## Plan

The Follow-up below supersedes the items marked superseded.

- [x] RED: `test/unit/document/text_undo_removal_ledger_test.ts` through the
      protobuf converter: undo vs unseen concurrent deletion (both orders),
      yorkie#2237, undo-redo-undo, a deleter that saw the piece removed, the
      ledger through a snapshot, undo after GC with another deletion holding
      the piece. 7 of 8 fail before the fix.
- [x] (partly superseded) Ledger in `RGATreeSplitNode`, live-in-view rule in
      `deleteNodes`, `removedBy` in `restore`, version vector in
      `retombstone`, purged ledger in `purge`.
- [x] (superseded) `CRDTText.edit` returns spans with `removedBy`;
      `EditOperation` reverse/redo rewrites `removedBy` to the removal it
      made.
- [x] (superseded) Protobuf fields and converter.
- [x] (superseded) `restore-removed-by` capability.
- [x] `pnpm verify:fast`.

## Follow-up (2026-10-31): port yorkie#2310

The Go change was reworked after a randomized harness found divergence on
top of the plan above, and merged as yorkie `8997daf2`. This ports the
result so Go and JS run the same rules and the same snapshot format.

- [x] Derive the undone removal from the undo's actor; drop
      `RestoreSpan.removedBy`, `restore-removed-by` and `dropRemovedBy`.
- [x] Encode the ledger as `TextNode.removal_events` (field 6, Go's proto
      comment); drop `has_ledger`, `removals`, `removal_cancels`,
      `purged_removals` and `RestoreSpan.removed_by`. A node whose
      `removed_at` says it all writes nothing.
- [x] Record no second uncancelled removal by one actor; index cancels by
      deletion so every ledger walk is linear.
- [x] The reverse of a redo and of an insertion's undo names only the pieces
      the removal was recorded on.
- [x] GC holds a tombstone until its ledger is stable and a single removal
      holds it; prune stable removal-cancel pairs; drop the purged ledgers.
      A recreated piece records the lamport-0 stand-in removal and its
      cancel.
- [x] Anchor a recreated piece before the nearest following piece of its
      insertion, and link it to the nearest surviving pieces on both sides
      (`LLRBTree.ceilingEntry`).
- [x] Select the identity path by restore mode; degrade an empty identity
      reverse to an empty undo edit at the head; run an empty undo edit as a
      no-op there. Propagating an undo whose operations ran was already the
      JS rule (#1368).
- [x] Port Go's ledger, CRDT and fuzz tests; the push/pull model is shared
      in `test/helper/adv_sync.ts`.
- [x] `pnpm verify:fast`.

Not ported: Go bounds removal events at 4096 per node in element payloads
a client pushes, and holds an identity op's own ticket to the change's
clock. Both guard the server against untrusted pushes; a JS client decodes
only what the server already accepted.

## Review

- `TEXT_UNDO_FUZZ_SEEDS=1000 TEXT_UNDO_FUZZ_FULL=1`: GC off, 3 and 4
  replicas, with and without inserts: 0 of 1000 each. GC on, deletes only:
  0 of 1000. GC on with inserts: 5 of 1000, each the out-of-scope anchor
  case below. Every step re-encodes each replica's text as a snapshot and
  compares the decoded ledger.
- Removing the GC hold or the actor rule fails the default 10-seed run;
  removing the stand-in removal or the redo's view rule fails at 200 seeds.
  Each of those, and every other rule ported here but the `insNext` link of
  a recreated piece (no test reaches it, in Go either), also fails a named
  test in `text_undo_removal_ledger_test.ts` or
  `crdt/text_removal_ledger_test.ts`.

## Out of scope

- After GC, a recreated piece can still land after text another insertion
  placed between the gap and the following piece of its own insertion, so a
  replica that collected and one that did not can order it differently.
  Fixing it needs the purged piece's position. Also in Go.
- The Tree half of yorkie#2237 (`CRDTTree` has its own removal path).
- A tombstone held by two concurrent deletions that are never undone is
  never collected, with or without undo, as in Go.
- Mixed versions: an SDK without these rules can still disagree with this
  one when an undo races a deletion -- the same disagreement it has today.
  The server has to be upgraded first: an older one drops `removal_events`
  when it re-encodes a document.
