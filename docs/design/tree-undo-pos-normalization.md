---
created: 2026-04-17
updated: 2026-04-17
tags: [tree, undo-redo, reconciliation, position]
---

# Tree Undo Position Normalization

## Problem

Tree undo/redo operations store integer indices (`fromIdx`/`toIdx`) as
their position representation. These integers depend on each client's
local tombstone state, making them asymmetric across clients.

This causes two classes of failures:

1. **Redo divergence**: During forward execution, concurrent inserts at
   the same position are ordered by CRDT timestamp. On redo, the insert
   is sequential (no CRDT ordering), so the same integer index resolves
   to a different logical position, producing divergent state.

2. **Cases 3-6 overlapping reconciliation**: When a remote edit's range
   overlaps with an undo range, the integer-based adjustment produces
   different results on different clients because the same integer index
   maps to different tree positions depending on local tombstone state.

### Root Cause: CRDTTreePos Slot vs Node Identity

Text's `RGATreeSplitPos` identifies a **specific node** in the RGA
chain by its node ID. This node is the same on all clients regardless
of concurrent edits. Text's `normalizePos()` walks the chain from this
node to produce absolute offsets that are symmetric.

Tree's `CRDTTreePos` identifies a **slot** (parentID, leftSiblingID) —
the position after a given sibling. When concurrent inserts fill this
slot with new nodes, the same CRDTTreePos resolves to different visible
indices on different clients.

This means integer-based reconciliation (the 6-case overlap logic) is
fundamentally broken for Tree: the same visible index maps to different
CRDT nodes on different clients.

### Goals

- Fix redo divergence for concurrent insert-text + delete-text
- Make tree undo ops use CRDTTreePos for execution (not integers)

### Non-Goals

- Cases 3-6 overlapping reconciliation — requires node-level overlap
  detection, not index-based. Deferred.
- Changing forward (non-undo) operation position handling
- Fixing splitLevel>=2 (forward convergence is broken independently)

## Design

### Approach: CRDTTreePos Execution + Disabled Reconciliation

The fix has three parts:

**1. Use `refineTreePos` for undo execution**

Instead of converting integer indices to CRDTTreePos at execution time
(`findPos(fromIdx)`), refine the already-stored CRDTTreePos to handle
concurrent tree changes:

```typescript
if (this.isUndoOp) {
  this.fromPos = tree.refineTreePos(this.fromPos);
  this.toPos = tree.refineTreePos(this.toPos);
}
```

**2. Disable integer-based reconciliation**

The 6-case overlap logic (`reconcileOperation`) is a no-op for Tree
undo ops. CRDTTreePos handles position resolution correctly without
integer adjustment, because it directly identifies the target position
regardless of concurrent edits.

**3. Preserve CRDTTreePos for tombstoned siblings**

`refineTreePos` must NOT roundtrip through `toTreePos + fromTreePos`
when the leftSibling is tombstoned — this corrupts the offset. Instead,
return the original CRDTTreePos unchanged:

```typescript
public refineTreePos(pos: CRDTTreePos): CRDTTreePos {
  const [[parent, left]] = this.findNodesAndSplitText(pos);
  if (left.isRemoved) {
    return pos;  // tombstoned node ID is still valid
  }
  const treePos = this.toTreePos(parent, left);
  if (!treePos) {
    return pos;
  }
  return CRDTTreePos.fromTreePos(treePos);
}
```

### Why Reconciliation is Disabled (Not Fixed)

The concrete failure: d1 deletes X, d2's redo wants to delete ".".
Both map to visible index [15, 16) on their respective trees. The
reconciliation (Case 3) incorrectly detects overlap and collapses
d2's redo to a no-op — even though the operations target different
CRDT nodes.

Attempted fixes that don't work:

- **Pre-apply normalization**: Computing remote op indices on the local
  tree before applying. Fails because CRDTTreePos(parent, left="jumped")
  resolves to "." (not X) on d2's tree due to concurrent insert.

- **CRDTTreePos-based reconciliation**: CRDTTreePos doesn't have a
  total ordering, so range comparison is non-trivial.

- **Absolute indices (includeRemoved=true)**: The reconciliation math
  assumes visible-index shift semantics. Absolute indices don't shift
  on tombstoning, breaking the shift calculation.

Without reconciliation, CRDTTreePos correctly targets the intended nodes
for Cases 1-2 and redo divergence. Cases 3-6 need node-level overlap
detection — a separate, larger effort.

### File Changes

| File | Change |
|------|--------|
| `crdt/tree.ts` | Add `posToIndex()`, `refineTreePos()` with tombstone guard |
| `operation/tree_edit_operation.ts` | `execute()` uses refineTreePos, `normalizePos(root)` computes from CRDTTreePos, `reconcileOperation` is no-op |
| `history.ts` | Pass root to `reconcileTreeEdit` |
| `document.ts` | Pass root to normalizePos/reconcileTreeEdit |
| `history_tree_test.ts` | Remove `skipRedo` for redo divergence test |

### Risks and Mitigation

| Risk | Mitigation |
|------|------------|
| Disabling reconciliation breaks Cases 1-2 | Tested: all 162 non-skipped tests pass including Cases 1-2, 7. CRDTTreePos handles simple shifts naturally. |
| refineTreePos tombstone guard may miss valid refinements | Only skips refinement when leftSibling is removed. Live siblings still get refined. |
| Future overlapping reconciliation may need re-enabling | reconcileOperation signature preserved for interface compatibility. |

### Design Decisions

| Decision | Reason |
|----------|--------|
| Disable reconciliation entirely | Integer-based overlap detection is fundamentally broken for Tree. Partial fixes (pre-apply, absolute indices) don't work. |
| Preserve original CRDTTreePos for tombstoned siblings | toTreePos + fromTreePos roundtrip corrupts offset when leftSibling is removed (child index mixed with text offset). |
| Keep integer indices alongside CRDTTreePos | Forward ops still use lastFromIdx/lastToIdx. Removing would require protobuf changes. |

## Alternatives Considered

| Alternative | Why not |
|-------------|---------|
| CRDTTreePos-based reconciliation with integer math | CRDTTreePos slot identity makes same index map to different nodes. Pre-apply normalization doesn't fix this. |
| Absolute indices (includeRemoved=true) | Reconciliation math assumes visible-index shift semantics. Absolute indices break shift calculation. |
| Fix Cases 3-6 simultaneously | Requires node-level overlap detection, not index adjustment. Different problem class. |

## Tasks

Implementation complete. Cases 3-6 deferred as separate work item.
