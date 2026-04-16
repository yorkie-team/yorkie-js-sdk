---
created: 2026-04-15
updated: 2026-04-15
tags: [tree, undo-redo, split]
---

# Tree Split Undo/Redo (splitLevel=1)

## Problem

`TreeEditOperation` with `splitLevel > 0` does not generate a reverse
operation, so undo/redo is silently skipped for split operations. This
blocks ProseMirror binding and Wafflebase from using Yorkie-native
undo/redo for paragraph splitting (Enter key).

The guard at `tree_edit_operation.ts:187-189` explicitly returns
`undefined` for `splitLevel !== 0`:

```typescript
const reverseOp =
  this.splitLevel === 0
    ? this.toReverseOperation(tree, removedNodes, preEditFromIdx)
    : undefined;
```

### Goals

- Generate reverse operations for `splitLevel=1` split edits.
- Support single-client undo/redo cycle: split → undo → redo.
- Support 2-client concurrent scenarios where remote edits do not
  overlap with the split boundary (reconciliation Cases 1-2).

### Non-Goals

- `splitLevel >= 2` undo/redo — forward convergence fails for L2
  concurrent operations (68/320 tests fail). Deferred until L2 forward
  convergence is fixed.
- Overlapping range reconciliation Cases 3-6 — existing Phase 2 scope,
  unchanged by this work.
- New operation types or protocol changes.

## Design

### Reverse Operation: Boundary Deletion

A split creates new element boundaries without removing any nodes:

```
splitLevel=1: <p>ab|cd</p>  →  <p>ab</p><p>cd</p>   (2 boundary tokens)
```

The reverse is a boundary deletion — a `splitLevel=0` edit that removes
the boundary tokens, merging the split elements back:

```
reverse: edit(fromIdx, fromIdx + 2, undefined, 0)   // delete 2 boundary tokens
```

The reverse op is a standard `TreeEditOperation` with `isUndoOp=true`,
`splitLevel=0`, and integer indices for reconciliation. This means:

1. **No new operation types.** The reverse reuses the existing
   `TreeEditOperation` infrastructure.
2. **Reconciliation unchanged.** The reverse op is `splitLevel=0`, so
   the existing 6-case overlap logic in `reconcileOperation` applies
   directly.
3. **Redo works automatically.** When the boundary deletion (undo)
   executes, it removes nodes and produces its own reverse op via the
   existing `toReverseOperation` path — a `splitLevel=0` re-insertion
   of the boundary nodes.

### Undo/Redo Cycle

```
split(L1)
  → undo: boundary delete (splitLevel=0, removes 2 tokens)
    → redo: re-insert boundary nodes (splitLevel=0, deep-copied nodes)
      → undo again: boundary delete (same as first undo)
```

Each step produces a standard `splitLevel=0` reverse op, so the entire
cycle uses existing infrastructure after the initial reverse op
generation.

### Code Changes

Only `tree_edit_operation.ts` is modified:

1. **Remove the `splitLevel === 0` guard** in `execute()` and replace
   with a branch: call `toReverseOperation` for `splitLevel=0`, call a
   new `toSplitReverseOperation` for `splitLevel > 0`.

2. **Add `toSplitReverseOperation` method** that:
   - Computes `boundarySize = 2 * this.splitLevel` (for L1, this is 2)
   - Guards against `fromIdx + boundarySize > tree.getSize()` (concurrent
     parent deletion → no-op)
   - Returns `TreeEditOperation.create(parentCreatedAt, fromPos,
     tree.findPos(fromIdx + boundarySize), undefined, 0, executedAt,
     isUndoOp=true, fromIdx, fromIdx + boundarySize)`

3. **No changes to**: `history.ts`, `document.ts`, `reconcileOperation`,
   or any other file.

### Edge Cases

| Case | Behavior |
|------|----------|
| Front split (`<p>\|ab</p>` → `<p></p><p>ab</p>`) | Undo deletes 2 boundary tokens, merges empty element back |
| Back split (`<p>ab\|</p>` → `<p>ab</p><p></p>`) | Same — boundary deletion merges trailing empty element |
| Concurrent parent deletion | `fromIdx + boundarySize > tree.getSize()` guard → undo is no-op |
| Concurrent insert into split result (non-overlapping) | Reconciliation Cases 1-2 shift indices correctly |
| Concurrent insert into split boundary (overlapping) | Out of scope — Cases 3-6, existing Phase 2 skip |

### Risks and Mitigation

| Risk | Mitigation |
|------|------------|
| Boundary size assumption (`2 * splitLevel`) may be wrong if concurrent edits insert nodes between split boundaries | Only L1 is in scope; L1 concurrent split already converges (152 tests passing). Reconciliation Cases 1-2 handle non-overlapping shifts. |
| Merge semantics on undo may differ from original pre-split state (e.g., `mergedFrom`/`mergedAt` metadata) | Boundary deletion triggers standard CRDTTree merge path, same as user-initiated merge. Verify in tests. |
| Redo re-inserts deep-copied boundary nodes — node IDs may conflict with GC | Existing `splitLevel=0` redo path already handles this. No new risk. |

### Design Decisions

| Decision | Reason |
|----------|--------|
| Boundary deletion as reverse | Reverse op is `splitLevel=0`, reuses all existing reconciliation and redo infrastructure. Simplest approach. |
| `splitLevel=1` only | L2 forward convergence is broken (68 test failures). Enabling undo on broken forward ops adds risk. |
| Single file change | Split reverse is a small extension to `toReverseOperation`. No architectural changes needed. |
| `boundarySize = 2 * splitLevel` | Each split level creates one close tag + one open tag = 2 tree index tokens per level. |

## Alternatives Considered

| Alternative | Why not |
|-------------|---------|
| **Content-based reverse** (deep-copy original node, delete split result, re-insert original) | Concurrent edits to split result would be lost. Dangerous in collaborative environment. |
| **Split-aware reverse** (store splitLevel in reverse, execute merge on undo) | Merge is just boundary deletion. Same result as approach A but adds a new reverse op variant for no benefit. |
| **Support splitLevel=2 simultaneously** | Forward convergence fails for L2 concurrent splits. Fix forward first, then add undo. |

### Test Strategy: Table-Driven

Follow the existing `history_tree_test.ts` pattern of declaring a test
state space and iterating over combinations.

#### Test State Space

```
┌─────────────────┬─────────────────────────────────────────────────┐
│ Variable        │ Domain                                          │
├─────────────────┼─────────────────────────────────────────────────┤
│ SplitPosition   │ {front, middle, back}                           │
│ Action          │ {undo, undo-redo, undo-redo-undo}               │
│ ClientCount     │ {1, 2}                                          │
│ ChainOp         │ {split-only, split+insert-text, split+delete,   │
│                 │  insert-text+split}                              │
│ RemoteOp        │ {insert-text, delete-text, insert-element}      │
│ RemotePosition  │ {before-split, after-split, different-element}  │
└─────────────────┴─────────────────────────────────────────────────┘
```

#### Test Sections

**Section A: Single-client split undo/redo (table-driven)**

```typescript
type SplitPos = 'front' | 'middle' | 'back';
const splitPositions: SplitPos[] = ['front', 'middle', 'back'];

for (const pos of splitPositions) {
  it(`should undo split at ${pos}`, ...);
  it(`should redo split at ${pos}`, ...);
  it(`should undo-redo-undo split at ${pos}`, ...);
}
```

- Initial tree: `<doc><p>ABCD</p></doc>`
- front: `edit(1, 1, undefined, 1)` → `<doc><p></p><p>ABCD</p></doc>`
- middle: `edit(3, 3, undefined, 1)` → `<doc><p>AB</p><p>CD</p></doc>`
- back: `edit(5, 5, undefined, 1)` → `<doc><p>ABCD</p><p></p></doc>`

**Section B: Single-client chained ops (table-driven)**

```typescript
type SplitChainOp = 'split' | 'insert-text' | 'delete-text';
for (const op1 of splitChainOps) {
  for (const op2 of splitChainOps) {
    it(`should undo chain: ${op1} → ${op2}`, ...);
  }
}
```

Snapshot-based verification: record XML after each op, undo in reverse
order checking each snapshot, redo forward checking each snapshot.

**Section C: Multi-client convergence (table-driven)**

```typescript
for (const remoteOp of ['insert-text', 'delete-text', 'insert-element']) {
  for (const remotePos of ['before-split', 'after-split', 'different-element']) {
    it(`should converge: split + remote ${remoteOp} at ${remotePos}`, ...);
  }
}
```

Uses `withTwoClientsAndDocuments`. d1 splits, d2 does remote op,
sync, d1 undoes, sync again, assert convergence.

**Section D: Edge cases (explicit)**

- Empty paragraph undo (front/back split)
- Concurrent parent deletion → undo is no-op

## Tasks

Implementation plan to be created separately.
