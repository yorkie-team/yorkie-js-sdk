# Tree redo restores a purged node at the wrong position

**Created**: 2026-10-08
Tracked as #1418

## Problem

Client A types `a`, `b`, `c` into a tree; client B then inserts `XYZ` at the
start. A undoes three times and redoes once. `a` should come back where it
was — after `XYZ` — but it lands at the very front (`aXYZ`).

The redo is the identity-preserving `restore` path: it revives the node the
undo tombstoned. Once garbage collection has purged that tombstone, the node
has to be rebuilt from the restore span, and `CRDTTree.recreateFromSpan` walks
an anchor ladder to decide where it goes:

1. same-insertion neighbour piece (text),
2. the span's captured left sibling,
3. the span's captured right sibling,
4. deterministic id-order fallback.

For a node the edit INSERTED, the span is captured in `CRDTTree.edit`'s insert
phase — i.e. at the moment of the original insert, when `a` was `p`'s only
child, so both sibling anchors are `undefined`. By redo time the anchors are
long stale: rungs 2 and 3 are empty and the ladder drops to rung 4, which
orders by node id. Sibling order in a tree is not id order — `XYZ` carries a
LATER ticket than `a` yet sits to its LEFT — so the fallback puts `a` first.

## Approach

Re-capture a span's sibling anchors at the moment the node is tombstoned,
instead of trusting the ones recorded when it was inserted.

`CRDTTree.retombstone` is exactly that moment: it is what an undo of an insert
runs, and the reverse operation it feeds (the redo) is the one that will later
have to recreate the node. Have it return the spans with anchors re-read from
the tree as it stands, and have `TreeEditOperation.execute` store those on the
operation so the reverse op — and the wire encoding — carry them.

## Checklist

- [ ] `CRDTTree.spanAnchors` helper: the sibling anchors for a span covering
      `[first, last]`, shared by the three capture sites.
- [ ] `CRDTTree.retombstone` returns the refreshed spans.
- [ ] `TreeEditOperation.execute` stores them before building the reverse op.
- [ ] Regression test: GC'd undo + redo across a concurrent peer insert.
- [ ] `pnpm verify:fast` green.

## Out of scope

- The server-side (Go) counterpart of the same capture. The spans travel on
  the wire, so a peer running this SDK gets the refreshed anchors; a server
  that rebuilds spans itself would need the same change in
  `yorkie-team/yorkie`.
