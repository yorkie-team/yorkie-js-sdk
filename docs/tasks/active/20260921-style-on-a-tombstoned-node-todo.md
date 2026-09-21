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

Taken on the server side and mirrored here: **a style applies to every node
the styling change knew about, and does not ask whether that node has since
been removed.** `canStyle` reduces to one question:

```ts
public canStyle(versionVector?: VersionVector): boolean {
  return ticketKnown(versionVector, this.getCreatedAt());
}
```

The branch's first answer was to skip a removal the change had already seen —
which would have kept this SDK's behaviour unchanged. It does not converge.
`removedAt` is last-writer-wins and mutable, while a style is evaluated once,
when it arrives, so two clients deleting the same run concurrently plus a
third styling over it make the answer depend on delivery order. Measured on
four causally legal replay orders; `B,S,C` disagreed with the other three.
Neither storing more removal tickets nor converging removal on the earliest
tombstone repairs it — see the server-side task doc for the full argument.

**This is a behaviour change for this SDK.** A style now covers text the same
client already deleted, so undoing the style and then the deletion brings the
text back without the attributes it carried. The six-step sequence from the
issue ends `[{"val":"abcd"},{"val":"ef"},{"val":"ghij"}]` where it used to
keep `b="OLD"`.

## Tasks

- [x] Export `ticketKnown` from `time/version_vector.ts` so both CRDTs share it
- [x] `canStyle` takes only the change's version vector and asks one question
      -- did the change know this node existed -- on `RGATreeSplitNode` and on
      `CRDTTreeNode`. `clientLamportAtChange` goes with it: the four inlined
      copies were `ticketKnown` spelled a second way
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

SDK version skew: clients apply remote changes with their own `canStyle`, so an
un-upgraded SDK on the same document as an upgraded one computes different
tombstone attributes and a different `docSize.gc` — which `MaxSizeLimit` reads.
The server and both SDKs are one logical release.

### Structural parity with the server

The server's `RegisterGCPair` only added to gc, leaving the live subtraction
to a separate `AdjustDiffForGCPair` every caller had to remember; this SDK's
`registerGCPair` has always done both halves, with `gcOnlySize` meaning "add
to gc, take nothing out of live". The server now matches, and the four Go
registrations that had been relying on the caller's silence say it with
`GCOnlySize` instead.

One of those is shared: the array dead position node. It holds no element, so
`getDataSize` never counted it into live — but this SDK registered it without
`gcOnlySize`, so `registerGCPair` debited live for bytes it never held. An
array move reported `live={12,120}` here against the server's `{12,144}`. Both
now say `{12,144}`.

### Deferred

Keeping the nicer undo semantics would mean expressing a local style as the
live runs the user actually selected rather than one range that sweeps
tombstones. That is order-independent by construction and keeps the old
rendering, but it changes the operation's shape and its wire encoding. Tracked
on the server side.
