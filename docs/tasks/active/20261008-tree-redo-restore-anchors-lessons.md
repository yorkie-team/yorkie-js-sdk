# Lessons — tree redo restore anchors

## Reproduction

The issue reports two rows. Only the first — "synced between undos, nodes
garbage-collected, both replicas agree on the WRONG position" — reproduces in
an in-process unit harness (two `Document`s exchanging change packs through
`converter.toChangePack`/`fromChangePack`, then `garbageCollect` with a max
version vector). It lands `aXYZ` where `XYZa` is expected.

The second row — "not synced, nodes still tombstones, replicas DIVERGE" — does
not reproduce in-process: with the tombstone still present both replicas take
the identity branch of `CRDTTree.restore` and `unremove` the same node, so both
end at `XYZa`. Divergence there needs a replica that has lost the tombstone,
which in the reporter's run is the server's own garbage collection. The fix
here is the same root cause either way: whichever replica has to RECREATE the
node is the one that reads the stale anchors.

## Why the anchors were stale

`removedSpans` (the delete path) captures anchors at the delete, so they are
fresh. `insertedSpans` captures at the insert — and that span is not used for
placement until the redo, which can be arbitrarily far in the future. The two
capture sites are character-for-character identical, which hid the difference
in *when* they run.

## Review rounds

`/self-review` was not run: this autonomous run is granted no tool that can
dispatch the reviewer subagent it requires.

### PR #1466 panel, round 1

Two blocking findings, both acted on.

1. *correctness* — `spanAnchors(first, last)` read the parent from `first` and
   silently tolerated `indexOf(last) === -1`. That is the cross-parent case:
   `findPiecesOverlapping` matches on creation ticket and offset alone, so an
   element split that scatters a text insertion's pieces hands `retombstone`
   two pieces under different parents. `retombstone` now only advances `last`
   while the piece still sits under `first`'s parent, and `spanAnchors` falls
   back to `first`'s own slot when it does not — the right boundary stays
   resolvable under the one `parentID` a span can record.

   Worth recording: the pre-fix degradation is not *observably* wrong in any
   scenario we could construct. Any right sibling of `first` other than the
   span's own pieces must have been inserted after the span (it has to sit
   between two of its pieces to survive the split boundary), so it carries a
   later id and the id-order fallback picks the same slot the right anchor
   would. The fix removes a silent dependence on that coincidence.

2. *test-adequacy* — the multi-piece span path (`first !== last`) was
   unexercised. `buildSplitTextWithPeerInsert` now has d2 split d1's one
   three-character insert by typing inside it, so the undo re-removes two
   pieces of one insertion. Verified by probe that the new cases are the only
   ones reaching `first !== last` and the cross-parent branch, and that
   'XYZabcQ' flips to 'abcXYZQ' with the re-anchoring removed.
