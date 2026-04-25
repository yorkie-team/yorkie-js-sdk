---
created: 2026-04-15
updated: 2026-04-25
tags: [tree, undo-redo, split]
---

# Tree Split Undo/Redo (splitLevel≥1)

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

- Generate reverse operations for `splitLevel≥1` split edits.
- Support single-client undo/redo cycle: split → undo → redo.
- Support 2-client concurrent scenarios where remote edits do not
  overlap with the split boundary (reconciliation Cases 1-2).

### Non-Goals

- Overlapping range reconciliation Cases 3-6 — existing Phase 2 scope,
  unchanged by this work.
- New operation types or protocol changes.

## Design

### Reverse Operation: Boundary Deletion

A split creates new element boundaries without removing any nodes.
The boundary size is `2 * splitLevel` tokens (one close + one open tag
per level):

```
splitLevel=1: <p>ab|cd</p>  →  <p>ab</p><p>cd</p>          (2 boundary tokens)
splitLevel=2: <div><p>ab|cd</p></div>
            → <div><p>ab</p></div><div><p>cd</p></div>      (4 boundary tokens)
```

The reverse is a boundary deletion — a `splitLevel=0` edit that removes
the boundary tokens, merging the split elements back:

```
L1 reverse: edit(fromIdx, fromIdx + 2, undefined, 0)   // delete 2 boundary tokens
L2 reverse: edit(fromIdx, fromIdx + 4, undefined, 0)   // delete 4 boundary tokens
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

1. **L1 (done):** Replaced the `splitLevel === 0` guard in `execute()`
   with a branch: `toReverseOperation` for `splitLevel=0`,
   `toSplitReverseOperation` for `splitLevel > 0`. Added the
   `toSplitReverseOperation` method with generic `boundarySize = 2 *
   this.splitLevel`.

2. **L2 (done):** Relaxed the `isPureL1Split` guard (`splitLevel
   === 1`) to `isPureSplit` (`splitLevel > 0`). The
   `toSplitReverseOperation` method already handles any splitLevel via
   the `boundarySize` formula — no method changes needed.

3. **L2 bugfix:** Added `!insNext.isRemoved` guard to §7.4 Empty
   Sibling Re-Parenting in `tree.ts`. Without this, L2 redo at back
   position re-parents into a tombstoned element, making the split
   sibling invisible.

4. **No changes to**: `history.ts`, `document.ts`, `reconcileOperation`,
   or any other file.

### Edge Cases

| Case | Behavior |
|------|----------|
| Front split (`<p>\|ab</p>` → `<p></p><p>ab</p>`) | Undo deletes 2 boundary tokens, merges empty element back |
| Back split (`<p>ab\|</p>` → `<p>ab</p><p></p>`) | Same — boundary deletion merges trailing empty element |
| L2 front split (`<div><p>\|ab</p></div>`) | Undo deletes 4 boundary tokens, merges both levels back |
| L2 back split (`<div><p>ab\|</p></div>`) | Same — 4 boundary tokens removed |
| Concurrent parent deletion | `fromIdx + boundarySize > tree.getSize()` guard → undo is no-op |
| Concurrent insert into split result (non-overlapping) | Reconciliation Cases 1-2 shift indices correctly |
| Concurrent insert into split boundary (overlapping) | Out of scope — Cases 3-6, existing Phase 2 skip |

### Risks and Mitigation

| Risk | Mitigation |
|------|------------|
| Boundary size assumption (`2 * splitLevel`) may be wrong if concurrent edits insert nodes between split boundaries | L1 concurrent split converges (152 tests passing). L2 forward convergence now also passes. Reconciliation Cases 1-2 handle non-overlapping shifts. |
| L2 boundary deletion removes 4 tokens — more structural change than L1 | Same merge path as L1, just applied twice. Verify with L2-specific tests (front/middle/back). |
| Merge semantics on undo may differ from original pre-split state (e.g., `mergedFrom`/`mergedAt` metadata) | Boundary deletion triggers standard CRDTTree merge path, same as user-initiated merge. Verify in tests. |
| Redo re-inserts deep-copied boundary nodes — node IDs may conflict with GC | Existing `splitLevel=0` redo path already handles this. No new risk. |

### Design Decisions

| Decision | Reason |
|----------|--------|
| Boundary deletion as reverse | Reverse op is `splitLevel=0`, reuses all existing reconciliation and redo infrastructure. Simplest approach. |
| L1 first, L2 after forward fix | L2 forward convergence was broken when L1 undo was implemented. Now fixed, so L2 undo can proceed. |
| L2 single-client tests first | Validate the boundary-deletion mechanism works for 4 tokens before adding multi-client complexity. |
| Single file change (guard only for L2) | `toSplitReverseOperation` already supports any splitLevel. Only the guard needs relaxing. |
| `boundarySize = 2 * splitLevel` | Each split level creates one close tag + one open tag = 2 tree index tokens per level. |

## Alternatives Considered

| Alternative | Why not |
|-------------|---------|
| **Content-based reverse** (deep-copy original node, delete split result, re-insert original) | Concurrent edits to split result would be lost. Dangerous in collaborative environment. |
| **Split-aware reverse** (store splitLevel in reverse, execute merge on undo) | Merge is just boundary deletion. Same result as approach A but adds a new reverse op variant for no benefit. |

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

#### L1 Test Sections (done)

**Section A: Single-client split undo/redo (table-driven)**

- Initial tree: `<doc><p>ABCD</p></doc>`
- front/middle/back × undo, undo-redo, undo-redo-undo = 9 tests

**Section B: Single-client chained ops (table-driven)**

- split, insert-text, delete-text combinations = 9 tests
- Snapshot-based verification

**Section C: Multi-client convergence (table-driven)**

- remote op × remote position = 9 tests
- Uses `withTwoClientsAndDocuments`

**Section D: Edge cases (explicit)**

- Empty paragraph undo (front/back split)
- Concurrent parent deletion → undo is no-op

#### L2 Test Sections (done — single-client)

**Section E: Single-client split L2 undo/redo (table-driven)**

Initial tree: `<doc><div><p>ABCD</p></div></doc>` (2 nesting levels
above text). Split with `splitLevel=2` creates 4 boundary tokens.

Tree index layout:

```
<doc>  <div>  <p>  A  B  C  D  </p>  </div>  </doc>
  0      1     2   3  4  5  6    7      8
```

- front: `edit(2, 2, undefined, 2)` — split at `<p>` open
- middle: `edit(4, 4, undefined, 2)` — split between B and C
- back: `edit(6, 6, undefined, 2)` — split at `</p>` close

Each position × {undo, undo-redo, undo-redo-undo} = 9 tests.

**Section F: Single-client L2 chained ops (table-driven)**

Same snapshot-based pattern as Section B, but using `splitLevel=2`
splits. The `applyChainOp` uses `editByPath` for position safety
after structural changes. 8 tests pass, 1 skipped (`split-l2 →
split-l2` chain — consecutive L2 splits produce tombstone structure
that breaks boundary-deletion reverse op).

**Sections G–H: Multi-client L2 (deferred)**

Multi-client convergence and edge cases for L2 follow the same pattern
as Sections C–D but with the L2 initial tree. Deferred to a follow-up
after single-client L2 is validated.

## Tasks

Implementation plan: `docs/tasks/active/20260425-tree-split-l2-undo-redo-todo.md`
