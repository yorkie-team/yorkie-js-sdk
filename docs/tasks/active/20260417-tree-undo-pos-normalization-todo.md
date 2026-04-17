# Tree Undo Position Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix tree undo Cases 3-6 and redo divergence by making CRDTTreePos the source of truth for undo operations, following Text's normalizePos/refinePos pattern.

**Architecture:** Add `posToIndex()` and `refineTreePos()` to CRDTTree, change TreeEditOperation to use CRDTTreePos for execution and update CRDTTreePos during reconciliation. 4 files changed, 5 skipped tests activated.

**Tech Stack:** TypeScript, Vitest, CRDTTree/CRDTTreePos

**Spec:** `docs/design/tree-undo-pos-normalization.md`

---

### Task 1: Add `posToIndex` and `refineTreePos` to CRDTTree

**Files:**
- Modify: `packages/sdk/src/document/crdt/tree.ts:1958` (after `toIndex`)

- [ ] **Step 1: Add `posToIndex` method**

Insert after `toIndex` method (line 1958):

```typescript
  /**
   * `posToIndex` converts a CRDTTreePos to a visible index in the tree.
   * This is the inverse of `findPos`: findPos(idx) → pos, posToIndex(pos) → idx.
   */
  public posToIndex(pos: CRDTTreePos): number {
    const [[parent, left]] = this.findNodesAndSplitText(pos);
    return this.toIndex(parent, left);
  }
```

- [ ] **Step 2: Add `refineTreePos` method**

Insert right after `posToIndex`:

```typescript
  /**
   * `refineTreePos` remaps a stored CRDTTreePos to the current tree state.
   * Analogous to Text's `refinePos()` — handles concurrent text node splits
   * and merges that may have changed the node structure since the pos was stored.
   */
  public refineTreePos(pos: CRDTTreePos): CRDTTreePos {
    const [[parent, left]] = this.findNodesAndSplitText(pos);
    const treePos = this.toTreePos(parent, left);
    if (!treePos) {
      return pos;
    }
    return CRDTTreePos.fromTreePos(treePos);
  }
```

- [ ] **Step 3: Run existing tests to verify no regression**

Run: `cd /Users/user/Development/yorkie-team/second-brain/03_projects/yorkie-js-sdk && pnpm sdk test test/integration/tree_test.ts`
Expected: All existing tests pass (new methods are unused yet).

- [ ] **Step 4: Commit**

```bash
git add packages/sdk/src/document/crdt/tree.ts
git commit -m "Add posToIndex and refineTreePos to CRDTTree

posToIndex converts CRDTTreePos to visible index (inverse of findPos).
refineTreePos remaps a stored CRDTTreePos to current tree state,
analogous to Text's refinePos for handling concurrent node splits."
```

---

### Task 2: Change `TreeEditOperation.execute()` to use CRDTTreePos

**Files:**
- Modify: `packages/sdk/src/document/operation/tree_edit_operation.ts:141-153`

- [ ] **Step 1: Replace the undo execution path**

Replace lines 141-153:

```typescript
    // For undo ops: convert stored integer indices to CRDTTreePos
    if (
      this.isUndoOp &&
      this.fromIdx !== undefined &&
      this.toIdx !== undefined
    ) {
      this.fromPos = tree.findPos(this.fromIdx);
      if (this.fromIdx === this.toIdx) {
        this.toPos = this.fromPos;
      } else {
        this.toPos = tree.findPos(this.toIdx);
      }
    }
```

With:

```typescript
    // For undo ops: refine stored CRDTTreePos to current tree state.
    // CRDTTreePos is the source of truth (not integer indices), matching
    // Text's refinePos() pattern for symmetric position resolution.
    if (this.isUndoOp) {
      this.fromPos = tree.refineTreePos(this.fromPos);
      this.toPos = tree.refineTreePos(this.toPos);
    }
```

- [ ] **Step 2: Run existing single-client undo tests**

Run: `cd /Users/user/Development/yorkie-team/second-brain/03_projects/yorkie-js-sdk && pnpm sdk test test/integration/history_tree_test.ts`
Expected: All existing (non-skipped) tests pass. Single-client undo/redo works because CRDTTreePos stored at creation time is still valid.

- [ ] **Step 3: Commit**

```bash
git add packages/sdk/src/document/operation/tree_edit_operation.ts
git commit -m "Use CRDTTreePos as source of truth in tree undo execution

Replace integer-index-based findPos(fromIdx) with refineTreePos(fromPos)
for undo op execution. CRDTTreePos is now the source of truth, matching
Text's refinePos pattern for symmetric position resolution."
```

---

### Task 3: Change `normalizePos` to compute from CRDTTreePos

**Files:**
- Modify: `packages/sdk/src/document/operation/tree_edit_operation.ts:375-390`
- Modify: `packages/sdk/src/document/document.ts:1506`

- [ ] **Step 1: Update `normalizePos` signature and implementation**

Replace the `normalizePos` method (lines 375-390):

```typescript
  /**
   * `normalizePos` returns the visible-index range of this operation.
   * For undo ops, returns the stored (possibly reconciled) indices.
   * For forward ops, returns the pre-edit indices captured during execute().
   */
  public normalizePos(): [number, number] {
    if (
      this.isUndoOp &&
      this.fromIdx !== undefined &&
      this.toIdx !== undefined
    ) {
      return [this.fromIdx, this.toIdx];
    }

    if (this.lastFromIdx !== undefined && this.lastToIdx !== undefined) {
      return [this.lastFromIdx, this.lastToIdx];
    }

    // Fallback: no indices available
    return [0, 0];
  }
```

With:

```typescript
  /**
   * `normalizePos` returns the visible-index range of this operation.
   * For undo ops, computes integer from CRDTTreePos using current tree state
   * (matching Text's normalizePos(root) pattern for symmetric indices).
   * For forward ops, returns the pre-edit indices captured during execute().
   */
  public normalizePos(root: CRDTRoot): [number, number] {
    if (this.isUndoOp) {
      const parentObject = root.findByCreatedAt(this.getParentCreatedAt());
      if (parentObject instanceof CRDTTree) {
        const tree = parentObject as CRDTTree;
        return [tree.posToIndex(this.fromPos), tree.posToIndex(this.toPos)];
      }
      return [0, 0];
    }

    if (this.lastFromIdx !== undefined && this.lastToIdx !== undefined) {
      return [this.lastFromIdx, this.lastToIdx];
    }

    // Fallback: no indices available
    return [0, 0];
  }
```

- [ ] **Step 2: Update call site in document.ts**

In `packages/sdk/src/document/document.ts`, find the TreeEditOperation normalizePos call (line 1506):

```typescript
        const [from, to] = op.normalizePos();
```

Replace with:

```typescript
        const [from, to] = op.normalizePos(this.root);
```

- [ ] **Step 3: Run tests**

Run: `cd /Users/user/Development/yorkie-team/second-brain/03_projects/yorkie-js-sdk && pnpm sdk test test/integration/history_tree_test.ts`
Expected: All existing (non-skipped) tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/sdk/src/document/operation/tree_edit_operation.ts packages/sdk/src/document/document.ts
git commit -m "Compute normalizePos from CRDTTreePos for tree undo ops

normalizePos now takes CRDTRoot and computes visible index from
CRDTTreePos using posToIndex, matching Text's normalizePos(root)
pattern. Forward ops still use stored lastFromIdx/lastToIdx."
```

---

### Task 4: Update `reconcileOperation` to sync CRDTTreePos

**Files:**
- Modify: `packages/sdk/src/document/operation/tree_edit_operation.ts:397-476`
- Modify: `packages/sdk/src/document/history.ts:196-216`

- [ ] **Step 1: Add `root` parameter to `reconcileOperation`**

Replace the method signature and apply helper (lines 397-419):

```typescript
  /**
   * `reconcileOperation` adjusts this undo operation's integer indices
   * when a remote edit modifies the same tree. Uses the same 6-case
   * overlap logic as EditOperation.reconcileOperation for Text.
   */
  public reconcileOperation(
    remoteFrom: number,
    remoteTo: number,
    contentLen: number,
  ): void {
    if (!this.isUndoOp) {
      return;
    }
    if (this.fromIdx === undefined || this.toIdx === undefined) {
      return;
    }
    if (remoteFrom > remoteTo) {
      return;
    }

    const remoteRangeLen = remoteTo - remoteFrom;
    const localFrom = this.fromIdx;
    const localTo = this.toIdx;

    const apply = (na: number, nb: number) => {
      this.fromIdx = Math.max(0, na);
      this.toIdx = Math.max(0, nb);
    };
```

With:

```typescript
  /**
   * `reconcileOperation` adjusts this undo operation's positions when a
   * remote edit modifies the same tree. Uses the same 6-case overlap logic
   * as EditOperation.reconcileOperation for Text. After adjusting integer
   * indices, updates CRDTTreePos via findPos to keep positions symmetric.
   */
  public reconcileOperation(
    root: CRDTRoot,
    remoteFrom: number,
    remoteTo: number,
    contentLen: number,
  ): void {
    if (!this.isUndoOp) {
      return;
    }
    if (this.fromIdx === undefined || this.toIdx === undefined) {
      return;
    }
    if (remoteFrom > remoteTo) {
      return;
    }

    const remoteRangeLen = remoteTo - remoteFrom;
    const localFrom = this.fromIdx;
    const localTo = this.toIdx;

    const parentObject = root.findByCreatedAt(this.getParentCreatedAt());
    const tree = parentObject instanceof CRDTTree
      ? parentObject as CRDTTree
      : undefined;

    const apply = (na: number, nb: number) => {
      this.fromIdx = Math.max(0, na);
      this.toIdx = Math.max(0, nb);
      // Sync CRDTTreePos from adjusted indices
      if (tree) {
        this.fromPos = tree.findPos(this.fromIdx);
        if (this.fromIdx === this.toIdx) {
          this.toPos = this.fromPos;
        } else {
          this.toPos = tree.findPos(this.toIdx);
        }
      }
    };
```

The 6-case logic below (lines 421-476) remains unchanged.

- [ ] **Step 2: Update `reconcileTreeEdit` in history.ts to pass root**

Replace `reconcileTreeEdit` method (lines 196-216):

```typescript
  public reconcileTreeEdit(
    parentCreatedAt: TimeTicket,
    rangeFrom: number,
    rangeTo: number,
    contentSize: number,
  ): void {
    const replace = (stack: Array<Array<HistoryOperation<P>>>) => {
      for (const ops of stack) {
        for (const op of ops) {
          if (
            op instanceof TreeEditOperation &&
            op.getParentCreatedAt().compare(parentCreatedAt) === 0
          ) {
            op.reconcileOperation(rangeFrom, rangeTo, contentSize);
          }
        }
      }
    };
    replace(this.undoStack);
    replace(this.redoStack);
  }
```

With:

```typescript
  public reconcileTreeEdit(
    root: CRDTRoot,
    parentCreatedAt: TimeTicket,
    rangeFrom: number,
    rangeTo: number,
    contentSize: number,
  ): void {
    const replace = (stack: Array<Array<HistoryOperation<P>>>) => {
      for (const ops of stack) {
        for (const op of ops) {
          if (
            op instanceof TreeEditOperation &&
            op.getParentCreatedAt().compare(parentCreatedAt) === 0
          ) {
            op.reconcileOperation(root, rangeFrom, rangeTo, contentSize);
          }
        }
      }
    };
    replace(this.undoStack);
    replace(this.redoStack);
  }
```

- [ ] **Step 3: Update `reconcileTreeEdit` call site in document.ts**

Find the call to `reconcileTreeEdit` in document.ts (around line 1507-1513):

```typescript
        this.internalHistory.reconcileTreeEdit(
          op.getParentCreatedAt(),
          from,
          to,
          op.getContentSize(),
        );
```

Replace with:

```typescript
        this.internalHistory.reconcileTreeEdit(
          this.root,
          op.getParentCreatedAt(),
          from,
          to,
          op.getContentSize(),
        );
```

- [ ] **Step 4: Add CRDTRoot import to history.ts if needed**

Check if `CRDTRoot` is already imported in history.ts. If not, add:

```typescript
import { CRDTRoot } from '@yorkie-js/sdk/src/document/crdt/root';
```

- [ ] **Step 5: Run tests**

Run: `cd /Users/user/Development/yorkie-team/second-brain/03_projects/yorkie-js-sdk && pnpm sdk test test/integration/history_tree_test.ts`
Expected: All existing (non-skipped) tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/sdk/src/document/operation/tree_edit_operation.ts packages/sdk/src/document/history.ts packages/sdk/src/document/document.ts
git commit -m "Sync CRDTTreePos during tree undo reconciliation

reconcileOperation now receives CRDTRoot and updates fromPos/toPos
via findPos after adjusting integer indices. reconcileTreeEdit
passes root through to the operation. This ensures CRDTTreePos
stays in sync with reconciled indices for symmetric execution."
```

---

### Task 5: Activate skipped tests and verify

**Files:**
- Modify: `packages/sdk/test/integration/history_tree_test.ts:636-638,795-796,840-841,888-889,933-934`

- [ ] **Step 1: Remove `skipRedo` condition**

Find the skipRedo variable (around line 636):

```typescript
      const skipRedo = op1 === 'insert-text' && op2 === 'delete-text';
      const redoIt = skipRedo ? it.skip : it;
```

Replace with:

```typescript
      const redoIt = it;
```

- [ ] **Step 2: Activate Cases 3-6 tests**

At line 795-796, replace:
```typescript
      // TODO(Phase 2): Overlapping reconciliation cases need symmetric index computation
      it.skip('Case 3 (contained_by): undo range contained by remote should collapse',
```
With:
```typescript
      it('Case 3 (contained_by): undo range contained by remote should collapse',
```

At line 840-841, replace:
```typescript
      // TODO(Phase 2): Overlapping reconciliation cases need symmetric index computation
      it.skip('Case 4 (contains): remote range contained by undo should adjust',
```
With:
```typescript
      it('Case 4 (contains): remote range contained by undo should adjust',
```

At line 888-889, replace:
```typescript
      // TODO(Phase 2): Overlapping reconciliation cases need symmetric index computation
      it.skip('Case 5 (overlap_start): remote overlaps start of undo range',
```
With:
```typescript
      it('Case 5 (overlap_start): remote overlaps start of undo range',
```

At line 933-934, replace:
```typescript
      // TODO(Phase 2): Overlapping reconciliation cases need symmetric index computation
      it.skip('Case 6 (overlap_end): remote overlaps end of undo range',
```
With:
```typescript
      it('Case 6 (overlap_end): remote overlaps end of undo range',
```

- [ ] **Step 3: Run the activated tests**

Run: `cd /Users/user/Development/yorkie-team/second-brain/03_projects/yorkie-js-sdk && pnpm sdk test test/integration/history_tree_test.ts`
Expected: All tests pass, including the 5 previously-skipped tests.

- [ ] **Step 4: If tests fail, debug with targeted test run**

Run individual failing tests with `.only`:
```bash
pnpm sdk test test/integration/history_tree_test.ts -t "Case 3"
pnpm sdk test test/integration/history_tree_test.ts -t "Case 4"
pnpm sdk test test/integration/history_tree_test.ts -t "Case 5"
pnpm sdk test test/integration/history_tree_test.ts -t "Case 6"
pnpm sdk test test/integration/history_tree_test.ts -t "should converge after redo: insert-text-delete-text"
```

Check actual vs expected output. If the expected values in the test are wrong (they were written before the fix), update them to match the correct converged state.

- [ ] **Step 5: Commit**

```bash
git add packages/sdk/test/integration/history_tree_test.ts
git commit -m "Activate tree undo Cases 3-6 and redo divergence tests

Remove skipRedo condition and it.skip from 5 previously-skipped tests:
- Cases 3-6 overlapping reconciliation (4 tests)
- Redo divergence insert-text + delete-text (1 test)

These tests now pass with CRDTTreePos-based position normalization."
```

---

### Task 6: Full regression and lint

**Files:** None (verification only)

- [ ] **Step 1: Run full test suite**

Run: `cd /Users/user/Development/yorkie-team/second-brain/03_projects/yorkie-js-sdk && pnpm sdk test`
Expected: All tests pass, including tree, text, history, and integration tests.

- [ ] **Step 2: Run lint**

Run: `cd /Users/user/Development/yorkie-team/second-brain/03_projects/yorkie-js-sdk && pnpm lint`
Expected: Zero warnings, zero errors.

- [ ] **Step 3: Run build**

Run: `cd /Users/user/Development/yorkie-team/second-brain/03_projects/yorkie-js-sdk && pnpm sdk build`
Expected: Build succeeds.

- [ ] **Step 4: Fix any issues and commit**

If lint or build issues arise, fix and commit separately.
