# A style lands on a deleted text node in Go and not in JS

**Created**: 2026-09-21

Mirror of yorkie#2011 and its server-side fix.

## Problem

`CRDTText.setStyle` and `.removeStyle` refuse every removed node:

```ts
if (node.isRemoved()) {
  continue;
}
```

The server's `canStyle` instead admitted one whenever
`editedAt.After(removedAt)`. The issue framed this as a choice between the
two. Measuring says neither is right.

A style concurrent with a removal is applied unconditionally on the replica
that issues it — the node is still live there, and nothing can retract it
afterwards. So refusing it on the replica that receives it leaves the two
holding different attributes on the same node forever: invisible while it is
a tombstone, rendered the moment the removal is undone. Measured on two
replicas seeded with `"abcdefghij"`, one styling `[4,6)` while the other
deletes it:

| who styles | d1 | d2 |
|---|---|---|
| d1 | `"ef" (removed) [b=1]` | `"ef" (removed) []` |
| d2 | `"ef" (removed) []` | `"ef" (removed) [b=1]` |

The two replicas also report different `docSize.gc` for the same document
(`{8,72}` vs `{4,48}`), and `MaxSizeLimit` is enforced client-side off that
number.

## Decision

Taken on the server side and mirrored here: **a style skips a node whose
removal the styling change already knew about, and applies to one removed
concurrently.** Locally every removal is known, so nothing a user sees
changes — this SDK's current behaviour becomes the contract.

## Tasks

- [x] Export `ticketKnown` from `time/version_vector.ts` so both CRDTs share it
- [x] `canStyle` takes the change's version vector and skips a causally-known
      removal, on `RGATreeSplitNode` and on `CRDTTreeNode`
- [x] Drop the `isRemoved()` guards in `setStyle`/`removeStyle`; a tombstoned
      node is styled but reports no change to editors
- [x] `accAttrWrite` takes `nodeIsLive` and books a tombstoned node's write to
      `gc` — the tree path had no such guard at all and was charging `live`
      for attributes on a removed tree node
- [x] Restore `textAttrGCPair`'s third case, which the previous commit removed
      as unreachable behind the guard
- [x] `setStyle`/`removeStyle`/`style`/`removeStyle` report `DocSize`, and
      `CRDTRoot.accGC` takes the gc half
- [x] Tests mirroring the server's: the six-operation local sequence, both
      concurrent ticket orderings, a shrinking overwrite on a tombstone, and
      the tree's remote-style case, each asserting `live` and `gc` against a
      rebuild and then collecting

## Review

Measured before and after on both SDKs; the six-operation sequence from the
issue now produces the same document on each, and the concurrent case
converges in both ticket orderings with an exact ledger on both replicas.
