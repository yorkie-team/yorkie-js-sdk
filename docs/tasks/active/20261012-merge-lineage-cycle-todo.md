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

Refuse the forged *forwarding*, not the move. Three containment checks, all
reading only the tree every replica holds when it applies the change, so all
replicas decide alike:

1. `rebuildMergeState` does not plant `src.mergedInto` when the destination
   is the source itself or sits inside its subtree.
2. `resolveMergeTarget` cuts a hop that folds back into the current target's
   subtree, so every consumer of the chain sees the same bounded target.
3. The merge step falls back to the unforwarded `fromParent` when the
   resolved destination is one of the children it is about to move, or sits
   inside one. The children still all leave the tombstoned boundary, so the
   boundary keeps no live descendants.

## Plan

- [x] RED: `tree_merge_lineage_test.ts`, both shapes (destination is the
      moved child, destination inside it); hangs on main
- [x] Fix in the merge step of `CRDTTree.edit`
- [x] GREEN, `pnpm verify:fast`
- [x] Self review (1 round, no blocking findings)
- [x] Open PR, link the Go PR

## Review
