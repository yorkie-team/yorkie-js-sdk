---
created: 2026-08-15
updated: 2026-08-15
tags: [tree, crdt, undo-redo, snapshot]
---

# One Node per CRDTTreeNodeID

## Problem

Every Tree position is anchored by a `CRDTTreeNodeID` (`createdAt` + `offset`),
so an ID must name a single node. This document records the rules that keep
that true, why they exist, and what they still leave open. They mirror the
server-side rules in
[yorkie/docs/design/tree.md](https://github.com/yorkie-team/yorkie/blob/main/docs/design/tree.md);
a client and the server have to apply them the same way, or the same position
resolves to different nodes on each side.

### Goals

- Keep a document loadable when two nodes already share one ID.
- Stop creating new duplicates.
- Resolve an ID to the same node on a live document and on one rebuilt from a
  snapshot.

### Non-Goals

- Removing duplicates from documents that already carry them.
- Replacing copy-based undo, which still duplicates content when undo ranges
  overlap even though its copies no longer reuse an identity (see Open
  Problems).

## Proposal Details

### How two nodes end up under one ID

`nodeMapByID` is an LLRB keyed by `CRDTTreeNodeID` and cannot hold two entries
for one key: the second `put` overwrites the first, so the winner follows the
order the nodes were registered — operation order on a live document, document
order in the `CRDTTree` constructor when it is rebuilt from a snapshot. Two
nodes under one ID therefore resolve differently on each replica, and the
offset a position carries can fall outside the node it lands on.

On the server that produced a panic in `splitText` and a document that could
not be opened (yorkie#1927). In this SDK `String.slice` does not throw: the
right value comes back empty, the split looks like a no-op, and the edit
silently lands at the wrong position — the same corruption, quieter.

Two paths produce the duplicates:

1. **Undo by copy.** `TreeEditOperation.toReverseOperation` reverses a deletion
   by deep-copying the removed nodes, and the copy keeps each node's ID. The
   identity-preserving restore path (`restoreSpans`) avoids this, but it only
   covers edits that were merge- and split-free — the spans are dropped when
   merge propagation, a piece split off an already-tombstoned node, or content
   inserted under a removed parent adds GC pairs beyond the plain deletion —
   and SDKs from 0.7.13 and earlier copy for every deletion.
2. **Simulated split delimiters.** An element split issues its tickets by
   simulating the delimiters the client consumed rather than replaying them
   (see the note in `TreeEditOperation.execute`), so two nodes in one change
   can be issued the same ID.

### Rules

1. **Content that reuses an identity is dropped.** Content created by an edit
   carries that edit's lamport and actor, so a content node whose `createdAt`
   names another change is a copy of a node that already exists.
   `CRDTTree.dropDuplicateContents` drops it and the rest of the edit applies.
   Content from the edit's own change is kept even when its ID collides —
   that is path 2 above, and the node belongs to the document.

2. **A live node keeps the ID over a tombstone.** `CRDTTree.registerNode` keeps
   the live node when a different node already holds the ID, so a live document
   and one rebuilt from a snapshot agree. `CRDTTree.purge` removes only the
   entry the purged node itself holds, so collecting a tombstone does not
   unregister the live node sharing its ID.

3. **An unresolvable position fails the operation.** `splitText` throws
   `ErrInvalidArgument` when the offset is past the end of the node, instead of
   letting `slice` turn it into a silent no-op.

Dropping content rather than failing the change is deliberate: such changes are
already in the history of existing documents, and a change that cannot be
replayed is a document that can never be loaded again. An undo that takes the
copy path now re-inserts its content under fresh identities, so the rule no
longer has anything to drop there.

### Risks and Mitigation

| Risk | Mitigation |
|------|------------|
| A dropped content node is silent, so a user's undo appears to do nothing | The copy path now takes fresh identities at undo time, so it has nothing left to drop. What remains is content from an SDK old enough to still copy identities |
| `splitText` now throws where it used to no-op | It only throws for a position that cannot be resolved in this replica, which previously produced a wrong edit position instead |
| Two nodes in the same state (both live or both tombstoned) still resolve by registration order | **Reachable**: deleting the live one of a duplicated pair leaves two tombstones, and nothing re-registers a node when it is tombstoned, so a live replica and one rebuilt from a snapshot can disagree again. Out of scope here — see Open Problems |

## Open Problems

- **Undo by copy no longer reuses identity.** The copy path now takes fresh
  tickets at undo time (`TreeEditOperation.reissueContentIDs`, called from
  `executeUndoRedo` where `ArraySet` and `Add` already re-identify a restored
  value), so a reverse that re-inserts a copy can no longer put two nodes under
  one ID. What it does not fix is the copy-based model itself: overlapping
  undos still duplicate content, which only routing every reverse through the
  restore path solves. That path already covers every deletion reachable
  through ordinary single-client editing — probing plain deletes, deletes
  across a tombstone, and deletes whose boundary lands inside one all produced
  restore reverses — leaving the copy path to merge-propagation cases and to
  reverse operations that older SDKs left on a user's undo stack.
- **Simulated split delimiters are the second source.** Carrying the split
  tickets in the operation would remove path 2, and only then can rule 1 drop
  its same-change carve-out and become an invariant rather than a goal.
- **Documents already carrying duplicates keep them.** They load and resolve
  consistently, but nothing removes the duplicates.
- **Rule 2 only covers a live/tombstone pair.** Delete the live duplicate and
  both become tombstones, at which point registration order decides again: the
  live replica keeps the node it registered last, a rebuilt one takes document
  order, and a position anchored there resolves to a different node on each.
  Closing it needs a replica-independent total order (live first, then
  `removedAt`, then ID) plus re-registration when a node is tombstoned — and it
  has to land on the server in the same cycle, since a tie-break applied on one
  side only is worse than none.
- **The drop decision depends on GC state.** `purge` unregisters the ID, so a
  replica that has already collected the tombstone accepts a copy that a
  replica which has not would drop.
- **`setActor` rewrites the operation's actor, not its content's.** A change
  built before `attach` carries content whose `createdAt` names a different
  actor than `executedAt`, so every replica reads it as foreign content. The
  identities an undo reissues inherit the same limitation. A
  false drop still needs the ID to be in the tree already, which for fresh
  content only happens through the delimiter path, but rule 1's carve-out is
  conditional on this.
- **An unresolvable position aborts the change.** `splitText` throws and
  nothing between it and `Document.applyChanges` catches, so one such position
  fails the whole change rather than the operation. The server behaves the same
  way with `ErrSplitOutOfRange`; both sides should decide together whether the
  operation should be skipped instead.
