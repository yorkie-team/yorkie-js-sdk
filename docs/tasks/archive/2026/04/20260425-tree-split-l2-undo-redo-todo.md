**Created**: 2026-04-25

# Tree Split Undo/Redo (splitLevel=2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend Tree split undo/redo from splitLevel=1 to splitLevel≥2 with single-client and multi-client convergence tests.

**Architecture:** `toSplitReverseOperation` already supports any splitLevel via `boundarySize = 2 * splitLevel`. The only code change is relaxing `isPureL1Split` (splitLevel === 1) to `isPureSplit` (splitLevel > 0). Tests cover single-client (Sections E-F) and multi-client (Sections G-H).

**Status:** All tasks complete. PR: #1234

**Tech Stack:** TypeScript, Vitest, yorkie-js-sdk CRDT internals

**Design doc:** `docs/design/tree-split-undo-redo.md`

---

### Task 1: Write failing L2 split undo test (Section E, first case)

**Files:**
- Modify: `packages/sdk/test/integration/history_tree_test.ts` (after line ~1456, after L1 edge cases)

- [x] **Step 1: Add a single L2 split undo test**

Append after the "Tree History - split L1 edge cases" describe block:

```typescript
// 4f. Single Client - Split Undo/Redo (splitLevel=2, table-driven)
describe('Tree History - single client split L2 undo/redo', () => {
  type SplitPos = 'front' | 'middle' | 'back';
  const l2SplitCases: Array<{
    pos: SplitPos;
    splitIdx: number;
    afterXML: string;
  }> = [
    {
      pos: 'front',
      splitIdx: 2,
      afterXML: '<doc><div><p></p></div><div><p>ABCD</p></div></doc>',
    },
    {
      pos: 'middle',
      splitIdx: 4,
      afterXML: '<doc><div><p>AB</p></div><div><p>CD</p></div></doc>',
    },
    {
      pos: 'back',
      splitIdx: 6,
      afterXML: '<doc><div><p>ABCD</p></div><div><p></p></div></doc>',
    },
  ];

  // Tree index layout:
  // <doc>  <div>  <p>  A  B  C  D  </p>  </div>  </doc>
  //   0      1     2   3  4  5  6    7      8
  const beforeXML = '<doc><div><p>ABCD</p></div></doc>';

  for (const { pos, splitIdx, afterXML } of l2SplitCases) {
    it(`should undo split at ${pos}`, () => {
      const doc = new Document<{ t: Tree }>('test-doc');
      doc.update((root) => {
        root.t = new Tree({
          type: 'doc',
          children: [
            {
              type: 'div',
              children: [
                {
                  type: 'p',
                  children: [{ type: 'text', value: 'ABCD' }],
                },
              ],
            },
          ],
        });
      }, 'init');
      assert.equal(xmlOf(doc), beforeXML);

      doc.update((root) => {
        root.t.edit(splitIdx, splitIdx, undefined, 2);
      }, `split at ${pos}`);
      assert.equal(xmlOf(doc), afterXML);

      doc.history.undo();
      assert.equal(xmlOf(doc), beforeXML, `undo split at ${pos} failed`);
    });

    it(`should undo-redo split at ${pos}`, () => {
      const doc = new Document<{ t: Tree }>('test-doc');
      doc.update((root) => {
        root.t = new Tree({
          type: 'doc',
          children: [
            {
              type: 'div',
              children: [
                {
                  type: 'p',
                  children: [{ type: 'text', value: 'ABCD' }],
                },
              ],
            },
          ],
        });
      }, 'init');

      doc.update((root) => {
        root.t.edit(splitIdx, splitIdx, undefined, 2);
      }, `split at ${pos}`);

      doc.history.undo();
      assert.equal(xmlOf(doc), beforeXML);

      doc.history.redo();
      assert.equal(xmlOf(doc), afterXML, `redo split at ${pos} failed`);
    });

    it(`should undo-redo-undo split at ${pos}`, () => {
      const doc = new Document<{ t: Tree }>('test-doc');
      doc.update((root) => {
        root.t = new Tree({
          type: 'doc',
          children: [
            {
              type: 'div',
              children: [
                {
                  type: 'p',
                  children: [{ type: 'text', value: 'ABCD' }],
                },
              ],
            },
          ],
        });
      }, 'init');

      doc.update((root) => {
        root.t.edit(splitIdx, splitIdx, undefined, 2);
      }, `split at ${pos}`);

      doc.history.undo();
      doc.history.redo();
      doc.history.undo();
      assert.equal(
        xmlOf(doc),
        beforeXML,
        `undo-redo-undo split at ${pos} failed`,
      );
    });
  }
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `cd packages/sdk && npx vitest run test/integration/history_tree_test.ts -t "single client split L2"`
Expected: FAIL — `undo()` is a no-op because the `isPureL1Split` guard blocks splitLevel=2.

- [x] **Step 3: Commit failing tests**

```bash
git add packages/sdk/test/integration/history_tree_test.ts
git commit -m "Add single-client split L2 undo/redo tests (Section E)

These tests fail because the isPureL1Split guard in
tree_edit_operation.ts only allows splitLevel=1. The next commit
relaxes this guard to support splitLevel>0."
```

---

### Task 2: Relax the guard to support splitLevel≥2

**Files:**
- Modify: `packages/sdk/src/document/operation/tree_edit_operation.ts:195-201`
- Modify: `packages/sdk/src/document/crdt/tree.ts:~660` (§7.4 tombstone guard — discovered during implementation)

- [x] **Step 1: Change the guard from L1-only to any splitLevel**

In `tree_edit_operation.ts`, change lines 195-201:

```typescript
// Before:
const isPureL1Split =
  this.splitLevel === 1 &&
  !this.contents?.length &&
  removedNodes.length === 0;
if (this.splitLevel === 0) {
  reverseOp = this.toReverseOperation(tree, removedNodes, preEditFromIdx);
} else if (isPureL1Split) {
  reverseOp = this.toSplitReverseOperation(tree, preEditFromIdx);
}

// After:
const isPureSplit =
  this.splitLevel > 0 &&
  !this.contents?.length &&
  removedNodes.length === 0;
if (this.splitLevel === 0) {
  reverseOp = this.toReverseOperation(tree, removedNodes, preEditFromIdx);
} else if (isPureSplit) {
  reverseOp = this.toSplitReverseOperation(tree, preEditFromIdx);
}
```

- [x] **Step 2: Run L2 tests to verify they pass**

Run: `cd packages/sdk && npx vitest run test/integration/history_tree_test.ts -t "single client split L2"`
Expected: PASS — all 9 tests (3 positions × 3 actions).

- [x] **Step 3: Run all L1 tests to verify no regression**

Run: `cd packages/sdk && npx vitest run test/integration/history_tree_test.ts -t "split L1"`
Expected: PASS — all existing L1 tests still pass.

- [x] **Step 4: Commit**

```bash
git add packages/sdk/src/document/operation/tree_edit_operation.ts
git commit -m "Relax isPureL1Split guard to support splitLevel>=2

toSplitReverseOperation already handles any splitLevel via
boundarySize = 2 * splitLevel. Only the guard needed changing:
isPureL1Split (splitLevel === 1) → isPureSplit (splitLevel > 0)."
```

---

### Task 3: Add L2 chained ops tests (Section F)

**Files:**
- Modify: `packages/sdk/test/integration/history_tree_test.ts` (after Section E describe block)

- [x] **Step 1: Add the L2 chained ops test section**

Append after the Section E describe block:

```typescript
// 4g. Single Client - Split L2 chained with other ops (table-driven)
describe('Tree History - single client split L2 chained ops', () => {
  type SplitChainOp = 'split-l2' | 'insert-text' | 'delete-text';
  const chainOps: Array<SplitChainOp> = [
    'split-l2',
    'insert-text',
    'delete-text',
  ];

  const applyChainOp = (doc: Document<{ t: Tree }>, op: SplitChainOp) => {
    doc.update((root) => {
      switch (op) {
        case 'split-l2':
          // Split first <p> at offset 2 with splitLevel=2
          root.t.editByPath([0, 0, 2], [0, 0, 2], undefined, 2);
          break;
        case 'insert-text':
          // Insert 'X' at start of first <p>
          root.t.editByPath([0, 0, 0], [0, 0, 0], { type: 'text', value: 'X' });
          break;
        case 'delete-text':
          // Delete first char of first text in first <div><p>
          root.t.editByPath([0, 0, 0], [0, 0, 1]);
          break;
      }
    }, op);
  };

  for (const op1 of chainOps) {
    for (const op2 of chainOps) {
      it(`should undo chain: ${op1} → ${op2}`, () => {
        const doc = new Document<{ t: Tree }>('test-doc');
        doc.update((root) => {
          root.t = new Tree({
            type: 'doc',
            children: [
              {
                type: 'div',
                children: [
                  {
                    type: 'p',
                    children: [{ type: 'text', value: 'ABCD' }],
                  },
                ],
              },
            ],
          });
        }, 'init');

        const s0 = xmlOf(doc);
        applyChainOp(doc, op1);
        const s1 = xmlOf(doc);
        applyChainOp(doc, op2);
        const s2 = xmlOf(doc);

        // Undo: s2 → s1 → s0
        doc.history.undo();
        assert.equal(xmlOf(doc), s1, `undo ${op2} failed`);
        doc.history.undo();
        assert.equal(xmlOf(doc), s0, `undo ${op1} failed`);

        // Redo: s0 → s1 → s2
        doc.history.redo();
        assert.equal(xmlOf(doc), s1, `redo ${op1} failed`);
        doc.history.redo();
        assert.equal(xmlOf(doc), s2, `redo ${op2} failed`);
      });
    }
  }
});
```

- [x] **Step 2: Run the chained ops tests**

Run: `cd packages/sdk && npx vitest run test/integration/history_tree_test.ts -t "single client split L2 chained"`
Expected: PASS — all 9 tests (3 × 3 chain combinations).

- [x] **Step 3: Run the full history_tree_test suite**

Run: `cd packages/sdk && npx vitest run test/integration/history_tree_test.ts`
Expected: PASS — all existing + new tests pass. No regressions.

- [x] **Step 4: Commit**

```bash
git add packages/sdk/test/integration/history_tree_test.ts
git commit -m "Add single-client split L2 chained ops tests (Section F)

Table-driven tests covering split-l2, insert-text, delete-text
combinations with snapshot-based undo/redo verification."
```

---

### Task 4: Update undo-redo.md status and lint

**Files:**
- Modify: `docs/design/undo-redo.md` (in yorkie repo, not yorkie-js-sdk — update via second-brain submodule)

- [x] **Step 1: Run lint**

Run: `cd packages/sdk && npx eslint test/integration/history_tree_test.ts src/document/operation/tree_edit_operation.ts`
Expected: No warnings or errors. Fix any lint issues before proceeding.

- [x] **Step 2: Update undo-redo.md Current Status table**

In `03_projects/yorkie/docs/design/undo-redo.md`, update the Completed table to add:

```markdown
| Tree split L2 undo/redo (single-client) | ✅ | Guard relaxed to splitLevel>0; 18 tests (Section E+F) |
```

And update the Remaining Work table — change the splitLevel≥2 row:

```markdown
| LOW | splitLevel≥2 multi-client undo/redo | Single-client done. Multi-client deferred until single-client is validated. |
```

- [x] **Step 3: Commit the design doc update**

```bash
git add 03_projects/yorkie/docs/design/undo-redo.md
git commit -m "Update undo-redo.md: mark split L2 single-client as done"
```

---

### Task 5: Add multi-client L2 convergence tests (Section G)

**Files:**
- Modify: `packages/sdk/test/integration/history_tree_test.ts`

- [x] **Step 1: Add table-driven undo convergence tests**

9 tests: `insert-text`, `delete-text`, `insert-element` × `before-split`,
`after-split`, `different-element`. Initial tree:
`<doc><div><p>ABCD</p></div><div><p>EFGH</p></div></doc>`.
d1 splits at index 4 with `splitLevel=2`. d2 does remote op. Sync, undo, sync, assert convergence.

- [x] **Step 2: Add table-driven redo convergence tests**

9 tests: same matrix. d1 splits, d2 does remote op, sync, undo, sync,
redo, sync, assert convergence.

- [x] **Step 3: Run tests and commit**

All 18 tests pass. Committed in `f302f69c6` and `1dd5017b4`.

---

### Task 6: Add multi-client L2 edge cases (Section H)

**Files:**
- Modify: `packages/sdk/test/integration/history_tree_test.ts`

- [x] **Step 1: Add front/back L2 split undo with remote insert**

2 tests: front split (`edit(2,2,undefined,2)`) and back split
(`edit(4,4,undefined,2)`) with concurrent remote text insert. Assert
convergence after undo.

- [x] **Step 2: Run full suite and commit**

198 passed, 6 skipped. Committed in `f302f69c6`.
