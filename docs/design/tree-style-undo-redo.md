---
created: 2026-03-31
updated: 2026-03-31
tags: [tree, undo-redo, crdt]
---

# Tree.Style Undo/Redo

## Problem

Multi-User Undo/Redo is supported for Text.Edit, Text.Style, and Tree.Edit,
but not for Tree.Style. When a user applies `tree.style()` or
`tree.removeStyle()`, the operation cannot be undone because
`TreeStyleOperation` does not generate a reverse operation.

This means collaborative editors that use Tree (e.g. ProseMirror binding)
cannot undo style changes such as bold, italic, or custom attributes on tree
nodes.

### Goals

- `TreeStyleOperation` generates a `reverseOp` on execution, enabling
  undo/redo through the existing `History` stack
- The reverse operation correctly restores previous attribute values (set style)
  or removes newly added attributes (add style)
- Behavior is consistent with the existing `StyleOperation` (Text.Style)
  pattern

### Non-Goals

- Per-node attribute capture: Like Text.Style, we capture previous values from
  the first styleable node only. Handling per-node attribute divergence is out
  of scope (same trade-off as Text.Style).
- Reconciliation for concurrent remote edits: Tree.Style modifies attributes on
  existing nodes without changing tree structure, so position-based
  reconciliation (like Tree.Edit's 6-case index adjustment) is not needed
  initially. If concurrent tests reveal issues, reconciliation can be added as
  a follow-up.
- Server-side (Go) changes: Undo/redo is client-only. The server CRDT layer
  does not need to return previous attribute values.

## Design

The implementation follows the same pattern as `StyleOperation` (Text.Style),
which is the closest analogue.

### Overview

```
User calls undo
  → History.popUndo() returns TreeStyleOperation (reverse)
  → TreeStyleOperation.execute()
    → CRDTTree.style() / removeStyle() with previous values
    → generates another reverseOp → pushed to redo stack
```

### Step 1: CRDTTree.style() returns previous attribute values

Change the return type from `[GCPair[], TreeChange[], DataSize]` to
`[GCPair[], TreeChange[], DataSize, Map<string, string>, string[]]`.

The two new return values:
- `prevAttributes: Map<string, string>` — previous values of keys that existed
  before styling
- `attrsToRemove: string[]` — keys that are newly added (did not exist before)

Inside `traverseInPosRange`, capture from the first styleable node:

```typescript
const prevAttributes = new Map<string, string>();
const attrsToRemove: string[] = [];
let capturedPrev = false;

// Inside traverseInPosRange callback:
if (!capturedPrev && node.canStyle(editedAt, clientLamportAtChange)) {
  for (const key of Object.keys(attributes)) {
    if (node.attrs?.has(key)) {
      prevAttributes.set(key, node.attrs.get(key));
    } else {
      attrsToRemove.push(key);
    }
  }
  capturedPrev = true;
}
```

### Step 2: CRDTTree.removeStyle() returns previous attribute values

Change the return type from `[GCPair[], TreeChange[], DataSize]` to
`[GCPair[], TreeChange[], DataSize, Map<string, string>]`.

Before removing attributes, capture current values from the first styleable
node:

```typescript
const prevAttributes = new Map<string, string>();
let capturedPrev = false;

// Inside traverseInPosRange callback:
if (!capturedPrev && node.canStyle(editedAt, clientLamportAtChange)) {
  for (const key of attributesToRemove) {
    if (node.attrs?.has(key)) {
      prevAttributes.set(key, node.attrs.get(key));
    }
  }
  capturedPrev = true;
}
```

### Step 3: TreeStyleOperation.execute() generates reverseOp

Follow the same branching logic as `StyleOperation.execute()`:

```typescript
const reversePrevAttributes = new Map<string, string>();
const reverseAttrsToRemove: string[] = [];

if (this.attributesToRemove.length > 0) {
  const [pairs, changes, diff, prevAttributes] = tree.removeStyle(...);
  for (const [key, value] of prevAttributes) {
    reversePrevAttributes.set(key, value);
  }
}

if (this.attributes.size > 0) {
  const [pairs, changes, diff, prevAttributes, attrsToRemove] = tree.style(...);
  for (const [key, value] of prevAttributes) {
    reversePrevAttributes.set(key, value);
  }
  reverseAttrsToRemove.push(...attrsToRemove);
}

// Build reverse op (3 cases, same as StyleOperation)
let reverseOp: Operation | undefined;
if (reversePrevAttributes.size > 0 && reverseAttrsToRemove.length > 0) {
  reverseOp = new TreeStyleOperation(
    parentCreatedAt, fromPos, toPos,
    reversePrevAttributes, reverseAttrsToRemove, executedAt,
  );
} else if (reverseAttrsToRemove.length > 0) {
  reverseOp = TreeStyleOperation.createTreeRemoveStyleOperation(
    parentCreatedAt, fromPos, toPos, reverseAttrsToRemove, executedAt,
  );
} else if (reversePrevAttributes.size > 0) {
  reverseOp = TreeStyleOperation.create(
    parentCreatedAt, fromPos, toPos, reversePrevAttributes, executedAt,
  );
}

return { opInfos: ..., reverseOp };
```

### Step 4: Tests

Add test cases in `packages/sdk/test/integration/history_tree_test.ts`:

1. **style undo/redo**: Apply bold → undo → verify bold removed → redo →
   verify bold restored
2. **new attribute undo**: Add new attribute → undo → verify attribute removed
3. **removeStyle undo**: Remove attribute → undo → verify attribute restored
4. **mixed style + removeStyle undo**: Combine set and remove in one operation
5. **concurrent style + undo**: Two clients style same range → one undoes →
   verify correct merged state

### Risks and Mitigation

| Risk | Mitigation |
|------|------------|
| Nodes in range have different previous values for the same key | Same trade-off as Text.Style: capture from first node only. Acceptable because same-range nodes typically share attributes in practice |
| Concurrent remote edit deletes styled node before undo | Undo applies style to remaining nodes; deleted nodes are tombstoned and skipped by `canStyle()` |

### Design Decisions

| Decision | Reason |
|----------|--------|
| Follow Text.Style pattern exactly | Proven pattern, consistent codebase, minimal design risk |
| Capture previous values from first node only | Same approach as Text.Style. Per-node capture would require storing a map per node, adding complexity for a rare edge case |
| No reconciliation initially | Style does not change tree structure. Position validity is maintained as long as nodes exist. Unlike Tree.Edit which inserts/deletes nodes and shifts indices, style only mutates attributes in place |
| No server-side changes | Undo/redo is entirely client-side. CRDTTree in Go does not need to return previous values |

## Alternatives Considered

| Alternative | Why not |
|-------------|---------|
| Per-node previous value capture | Significantly more complex storage (Map per node per key). Text.Style uses first-node-only and it works in practice |
| Add reconciliation from the start | Over-engineering. Style operations target existing nodes by CRDTTreePos, which remains valid unless the node is deleted. Can be added later if concurrent tests fail |
| Store reverse op at Change level instead of Operation level | Breaks the existing pattern where each Operation is responsible for its own reverse. Would require refactoring the entire undo/redo system |

## Tasks

See [20260331-tree-style-undo-redo-todo.md](../tasks/active/20260331-tree-style-undo-redo-todo.md)
for the execution checklist.
