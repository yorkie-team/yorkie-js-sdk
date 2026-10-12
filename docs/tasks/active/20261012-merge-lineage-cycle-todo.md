**Created**: 2026-10-12

# Refuse a merge that would move a node under itself

JS half of yorkie#2172. The Go half is the yorkie PR on the same branch name.

## Problem

The tree edit's merge step resolves its destination through
`resolveMergeTarget`, which follows `mergedInto`. `rebuildMergeState` derives
`mergedInto` from the `mergedFrom` an element payload (Set/Add/ArraySet)
keeps, so a crafted change can point a tombstoned merge source at a child the
merge moves, or at a node inside one. `dest.moveChild(node)` then re-parents
the child under itself and `updateAncestorsSize` loops forever. In the
browser that freezes the tab of every peer that applies the change.

## Fix

Skip a child whose destination is the child itself or one of its
descendants. The check reads only the tree every replica holds when it
applies the change, so all replicas skip the same child, matching Go.

## Plan

- [x] RED: `tree_merge_lineage_test.ts`, both shapes (destination is the
      moved child, destination inside it); hangs on main
- [x] Fix in the merge step of `CRDTTree.edit`
- [x] GREEN, `pnpm verify:fast`
- [x] Self review (1 round, no blocking findings)
- [ ] Open PR, link the Go PR

## Review
