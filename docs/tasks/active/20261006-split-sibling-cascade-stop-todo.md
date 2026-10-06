# Stop the split-sibling cascade at a sibling the editor saw alive

**Created**: 2026-10-06
Fixes #1408. The server half is yorkie-team/yorkie#2143, with the same
change; deploy the server first.

## Problem

Two replicas each split `<span>de</span>` at offset 0 and delete the empty
left piece (also the editor's Enter right before a styled run: split the span
at 0, split the paragraph, drop the empty span). On one replica "de" is gone
and the trees diverge.

Both deletes target the original span. The split products end up ordered
`original → d2's product → d1's product`, with "de" in d1's. On d1, d2's
delete wins the span's LWW and the §4.1 cascade walks the `insNextID` chain
with d2 as editor. It skipped d2's own product (known) and went on to
tombstone d1's product, which held "de". d2 never cascades d1's delete,
because that delete lost the LWW there.

The same walk loses the text of a concurrent Enter at the start of a known
split sibling that the deleter did not delete (`main` diverges there too).

The cascade dates from #1202 (v0.7.4). Editors hit it once `splitByPath`
became a real split in v0.7.23 (#1358).

## Plan

- [x] Red: `tree_split_sibling_cascade_test.ts`, ten split/merge/delete races,
      each in both role assignments and both actor orders (40 runs),
      comparing XML and tree shape, then GC. 22 of 40 fail on `main`.
- [x] Pass a known sibling only if the editor merged it back into its left
      split neighbour (`sawMergedBack`, off the persisted `mergedFrom`/
      `mergedAt` stamps) or this delete encloses it whole; stop at any
      other known sibling (`collectUnknownSplitSiblings`).
- [x] Keep the cascade gated on `canDelete`; pin the scenarios where
      cascading on a lost LWW loses text nobody deleted
      (`tree_split_cascade_regression_test.ts`; 4 of 5 pass on `main`, the
      fifth is #1408 itself).
- [x] Same change and tests in Go (yorkie-team/yorkie#2143), with §4.1 of
      yorkie's `docs/design/concurrent-merge-split.md`.
- [x] Random fuzz against `main` on the Go side (scratch, not committed).
- [x] Unit suites, lint, `tsc`; tree integration suites against a server
      built from the Go branch.

## Known Limitations

- 12 of the 40 cascade runs leave one extra empty element on one replica;
  text agrees. Eight are the two #1408 shapes, where both sides split the
  same boundary: the replica whose own delete won the LWW keeps its own
  split product, emptied because the moved text went to the other side's
  product, while on the other replica that product was born tombstoned. The
  other four are "split at different offsets + drop left piece" and "split +
  drop left piece against deleting the whole span" (the latter also on
  `main`).
- With a third replica, a delete that lost the LWW can leave deleted text on
  one replica. In 10,000 random two-round races (round 2 review) 9 seeds do
  this where `main` leaves none; in the two traced, `main`'s over-delete hid
  an existing divergence.
- The walk's stop rule reads no mutable local state, so every replica
  computes the same cascade for the same change: not `removedAt` (the LWW
  rewrites it, so the answer would depend on apply order) and not the
  `mergedInto` cache (GC purge and `dissolveMerge` drop it). The only
  "editor saw it gone" witness used is the persisted `mergedFrom`/`mergedAt`
  stamp the merge left on the children it moved (`sawMergedBack`). That
  covers a merge that moved children; a merge of an already-empty sibling
  leaves no witness, so the walk stops there and a product split off it
  concurrently survives on that replica only.
- A sibling merged back by a change the editor did not know ends the walk. A
  product split off it concurrently survives on the splitter's own replica
  in every delivery order. Over six delivery orders `main` diverges in
  three, this change in all six; paragraph joins behave the same.
- On a replica that already deleted an element, a concurrent split product
  of it is born tombstoned, so text typed into it there stays hidden (the
  "Enter + type vs Enter" regression case). Not the cascade.
- The style walk over split siblings (§9.2) is not changed here.
