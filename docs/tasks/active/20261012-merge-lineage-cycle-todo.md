**Created**: 2026-10-12

# Refuse a merge that would move a node under itself

Tracked as #1478. JS half of yorkie-team/yorkie#2172; the server half is
yorkie-team/yorkie#2186.

## Problem

The tree edit's merge step resolves its destination through
`resolveMergeTarget`, which follows `mergedInto`. `rebuildMergeState` derives
`mergedInto` from the `mergedFrom` an element payload (Set/Add/ArraySet)
keeps, so a crafted change can point a tombstoned merge source at a child the
merge moves, or at a node inside one. `dest.moveChild(node)` then re-parents
the child under itself and `updateAncestorsSize` loops forever. In the
browser that freezes the tab of every peer that applies the change.

## Fix

Match the server (yorkie#2186) exactly. When the resolved destination is a
child the merge moves, or sits inside one, tombstone that child's subtree in
place instead of moving it, and book a GC pair for each node. Every later
child in the same merge list is tombstoned in place too, since the
destination now sits inside a tombstone. `edit` returns these stranded nodes
so the operation layer counts them in the removed size, as Go does in
`RemovedSize`. The check reads only the tree every replica holds when it
applies the change, so all replicas decide alike.

The panel rounds had moved JS to a different design (refuse the forged
forwarding and fall back to `fromParent`, plus a containment bound on every
`mergedInto` reader). That left Go and JS producing different trees from the
same change, so it was reverted to the Go shape; the broader hardening is a
cross-SDK follow-up.

## Plan

- [x] RED: `tree_merge_lineage_test.ts`, both shapes (destination is the
      moved child, destination inside it); hangs on main
- [x] Fix in the merge step of `CRDTTree.edit`
- [x] GREEN, `pnpm verify:fast`
- [x] Self review (1 round, no blocking findings)
- [x] Open PR, link the Go PR
- [x] Restore Go parity after the panel rounds (see lessons)
- [x] Parity probe: Go head 2f1dccfc and this branch print identical parent,
      tombstones, GC pair order, removed size and XML on the shared fixtures

## Review
