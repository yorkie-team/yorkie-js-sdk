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
- Fixing the undo path that creates them (see Open Problems).

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
   covers edits that were merge- and split-free; everything else still copies,
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
replayed is a document that can never be loaded again. The cost is that an undo
which took the copy path no longer restores its text.

### Risks and Mitigation

| Risk | Mitigation |
|------|------------|
| A dropped content node is silent, so a user's undo appears to do nothing | Only fires for content that reuses another change's identity, which is the buggy path. The repair is to stop copying — see Open Problems |
| `splitText` now throws where it used to no-op | It only throws for a position that cannot be resolved in this replica, which previously produced a wrong edit position instead |
| Two nodes in the same state (both live or both tombstoned) still resolve by registration order | Not reachable through the public edit path today; documented rather than fixed, since a tie-break would have to be identical on every replica |

## Open Problems

- **Undo by copy is the source.** Routing every reverse the restore path can
  express through it removes path 1. Issuing fresh IDs for the copies would
  stop the collision, but it keeps the copy-based model that duplicates content
  when undo ranges overlap — a narrower fix for the identity problem alone, not
  for undo correctness. Until then these rules only contain it.
- **Simulated split delimiters are the second source.** Carrying the split
  tickets in the operation would remove path 2, and only then can rule 1 drop
  its same-change carve-out and become an invariant rather than a goal.
- **Documents already carrying duplicates keep them.** They load and resolve
  consistently, but nothing removes the duplicates.
