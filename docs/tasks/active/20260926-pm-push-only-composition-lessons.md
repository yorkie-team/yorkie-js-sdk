# Push-only composition — lessons

## Panel round: PM-vs-tree block comparison

The `alignBlockIndex` / `blocksAligned` gate added in this branch compared
`pmToYorkie(oldDoc)` blocks with `tree.toJSON()` blocks using
`yorkieNodesEqual`, which is exact. The CRDT does not coalesce adjacent text
nodes — `toTreeNode` (`sdk/src/document/crdt/tree.ts`) maps `children` straight
through — so a block typed into twice serializes as several sibling text nodes
while ProseMirror holds one. Two in-step representations therefore compared as
diverged, which disabled intra-block diffing, native split and native merge,
and in a multi-block document made `alignBlockIndex` return undefined so the
local edit was dropped.

Fix: `yorkieNodesEquivalent` — merges adjacent text runs before comparing, and
compares attributes key-order-independently, since the CRDT's map decides its
own order. Merging is index-safe: a text node's flat size is its length with no
open/close tags, so how a run is split never moves a Yorkie index.
`yorkieNodesEqual` stays exact for the PM-vs-PM diff.

Lesson: the unit helpers derive the mock tree's `toJSON()` from `pmToYorkie`,
so every PM-vs-tree comparison looked exact by construction. Tests for that
boundary have to build the tree side by hand.
