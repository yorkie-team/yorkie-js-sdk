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
- [x] Give the tree's `removeStyle` the third accounting case too — it had no
      liveness guard at all, so a live attribute on a tombstoned tree node was
      debited from `live` and drove it to -26 on the case the new test covers
- [x] Align `ticketKnown` with the server's `len(vv) == 0`: an empty-but-
      defined vector is a local change on both sides
- [x] Suppress editor events for a tombstoned node on the tree too, matching
      the text half
- [x] Tests mirroring the server's: the six-operation local sequence, both
      concurrent ticket orderings, a shrinking overwrite on a tombstone, and
      the tree's remote-style case, each asserting `live` and `gc` against a
      rebuild and then collecting

## Review

Measured before and after on both SDKs; the six-operation sequence from the
issue now produces the same document on each, and the concurrent case
converges in both ticket orderings with an exact ledger on both replicas.

`tsc --noEmit` clean, `eslint` 0 warnings, 545 unit tests green. The full
integration suite (2607) passes against a server built from the matching
server branch. Every new test checked Red first.

### From code review

- The tree's `removeStyle` had no liveness guard at all, so a live attribute
  on a tombstoned tree node was debited from `live` — where it never was —
  driving it to **-26** on the case the new test covers. Fixed on both SDKs by
  collapsing `textAttrGCPair` and `attrGCPair` into one three-case helper.
- Two comments claimed `CRDTTreeNode.getDataSize` skips a removed node. It
  does not; the exclusion is `CRDTTree.getDataSize`'s. That confusion is what
  justified leaving the tree at two cases.
- `ticketKnown` read an empty-but-defined vector as "nothing known" where the
  server reads `len(vv) == 0` as "everything known". Masked in practice by an
  equally asymmetric `clientLamportAtChange`, but a latent trap now that
  `canStyle` depends on the helper.
- The tree still reported editor events for a tombstoned node where the text
  half had stopped. Aligned.

### Known limitations

Shared with the server: a document with two concurrent removals of the same
node makes `canStyle`'s input delivery-order dependent, because `removedAt` is
LWW and mutable. Pre-existing on both sides and unchanged by this contract;
tracked on the server side with an executable repro.

SDK version skew: clients apply remote changes with their own `canStyle`, so an
un-upgraded SDK on the same document as an upgraded one computes different
tombstone attributes and a different `docSize.gc` — which `MaxSizeLimit` reads.
The server and both SDKs are one logical release.

### Deferred

`clientLamportAtChange` is now redundant with `versionVector` — the inline
computation in `text.ts` and `tree.ts` is `ticketKnown` spelled out. Collapsing
it would delete ~16 lines per SDK, but it is a refactor rather than a defect
and has to land on both sides together.
