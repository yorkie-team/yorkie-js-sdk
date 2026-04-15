# Tree Split Undo/Redo (splitLevel=1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable undo/redo for Tree.Edit splitLevel=1 operations by generating boundary-deletion reverse ops.

**Architecture:** When a splitLevel>0 edit executes, generate a splitLevel=0 boundary-deletion reverse op (2 tokens per split level). This reverse op reuses all existing reconciliation and redo infrastructure unchanged.

**Tech Stack:** TypeScript, Vitest, yorkie-js-sdk CRDT internals

**Design doc:** `docs/design/tree-split-undo-redo.md`

---

### Task 1: Table-driven single-client split undo tests (Section A)

**Files:**
- Modify: `packages/sdk/test/integration/history_tree_test.ts`

- [ ] **Step 1: Add the split undo/redo test section**

Append after the existing "Tree History - single client split/merge" describe block (line ~481):

```typescript
// 4b. Single Client - Split Undo/Redo (splitLevel=1, table-driven)
describe('Tree History - single client split L1 undo/redo', () => {
  type SplitPos = 'front' | 'middle' | 'back';
  const splitCases: Array<{
    pos: SplitPos;
    splitIdx: number;
    afterXML: string;
  }> = [
    {
      pos: 'front',
      splitIdx: 1,
      afterXML: '<doc><p></p><p>ABCD</p></doc>',
    },
    {
      pos: 'middle',
      splitIdx: 3,
      afterXML: '<doc><p>AB</p><p>CD</p></doc>',
    },
    {
      pos: 'back',
      splitIdx: 5,
      afterXML: '<doc><p>ABCD</p><p></p></doc>',
    },
  ];

  const beforeXML = '<doc><p>ABCD</p></doc>';

  for (const { pos, splitIdx, afterXML } of splitCases) {
    it(`should undo split at ${pos}`, () => {
      const doc = new Document<{ t: Tree }>('test-doc');
      doc.update((root) => {
        root.t = new Tree({
          type: 'doc',
          children: [
            {
              type: 'p',
              children: [{ type: 'text', value: 'ABCD' }],
            },
          ],
        });
      }, 'init');
      assert.equal(xmlOf(doc), beforeXML);

      doc.update((root) => {
        root.t.edit(splitIdx, splitIdx, undefined, 1);
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
              type: 'p',
              children: [{ type: 'text', value: 'ABCD' }],
            },
          ],
        });
      }, 'init');

      doc.update((root) => {
        root.t.edit(splitIdx, splitIdx, undefined, 1);
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
              type: 'p',
              children: [{ type: 'text', value: 'ABCD' }],
            },
          ],
        });
      }, 'init');

      doc.update((root) => {
        root.t.edit(splitIdx, splitIdx, undefined, 1);
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

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm sdk test test/integration/history_tree_test.ts`

Expected: 9 new tests fail (3 positions × 3 actions). The `undo` call
has no effect because `reverseOp` is `undefined` for splitLevel=1, so
`afterXML` persists instead of reverting to `beforeXML`.

- [ ] **Step 3: Commit failing tests**

```bash
git add packages/sdk/test/integration/history_tree_test.ts
git commit -m "Add failing tests for splitLevel=1 split undo/redo

Table-driven tests covering front/middle/back split positions with
undo, undo-redo, and undo-redo-undo actions. All 9 tests fail
because reverse ops are not generated for splitLevel > 0."
```

---

### Task 2: Implement `toSplitReverseOperation` and enable reverse ops

**Files:**
- Modify: `packages/sdk/src/document/operation/tree_edit_operation.ts`

- [ ] **Step 1: Add `toSplitReverseOperation` method**

Add this method after the existing `toReverseOperation` method (after line ~288):

```typescript
  /**
   * `toSplitReverseOperation` creates the reverse operation for a split edit.
   *
   * A split creates element boundaries (close + open tags). The reverse
   * is a boundary deletion: a splitLevel=0 edit that removes those tokens,
   * merging the split elements back together.
   *
   * boundarySize = 2 * splitLevel (each level creates 1 close + 1 open tag)
   *
   * @param tree - The CRDTTree after the split has been applied
   * @param preEditFromIdx - The from index captured BEFORE the split
   */
  private toSplitReverseOperation(
    tree: CRDTTree,
    preEditFromIdx: number,
  ): Operation | undefined {
    const boundarySize = 2 * this.splitLevel;
    const reverseFromIdx = preEditFromIdx;
    const reverseToIdx = preEditFromIdx + boundarySize;

    // Guard: if indices exceed tree size, the split was a no-op
    // (e.g., concurrent parent deletion tombstoned the split result).
    if (reverseToIdx > tree.getSize()) {
      return undefined;
    }

    const reverseFromPos = tree.findPos(reverseFromIdx);
    const reverseToPos = tree.findPos(reverseToIdx);

    return TreeEditOperation.create(
      this.getParentCreatedAt(),
      reverseFromPos,
      reverseToPos,
      undefined, // no content — this is a deletion
      0, // splitLevel=0: boundary deletion
      undefined!, // executedAt assigned at undo time
      true, // isUndoOp
      reverseFromIdx,
      reverseToIdx,
    );
  }
```

- [ ] **Step 2: Update `execute()` to call the new method**

Replace lines 186-190:

```typescript
    // Create reverse op (skip for splitLevel > 0 in Phase 1)
    const reverseOp =
      this.splitLevel === 0
        ? this.toReverseOperation(tree, removedNodes, preEditFromIdx)
        : undefined;
```

With:

```typescript
    // Create reverse op for undo
    let reverseOp: Operation | undefined;
    if (this.splitLevel === 0) {
      reverseOp = this.toReverseOperation(tree, removedNodes, preEditFromIdx);
    } else {
      reverseOp = this.toSplitReverseOperation(tree, preEditFromIdx);
    }
```

- [ ] **Step 3: Run tests to verify Task 1 tests pass**

Run: `pnpm sdk test test/integration/history_tree_test.ts`

Expected: All 9 new split undo/redo tests pass. All existing tests still pass.

- [ ] **Step 4: Run full test suite**

Run: `pnpm lint && pnpm sdk build && pnpm sdk test`

Expected: Clean lint, successful build, all tests pass.

- [ ] **Step 5: Commit implementation**

```bash
git add packages/sdk/src/document/operation/tree_edit_operation.ts
git commit -m "Generate reverse ops for splitLevel>0 Tree.Edit

Add toSplitReverseOperation that creates a boundary-deletion
reverse op (splitLevel=0) for split edits. The reverse removes
2*splitLevel boundary tokens, merging split elements back.

Redo works automatically: the boundary deletion produces its own
reverse via the existing toReverseOperation path."
```

---

### Task 3: Table-driven single-client chained ops tests (Section B)

**Files:**
- Modify: `packages/sdk/test/integration/history_tree_test.ts`

- [ ] **Step 1: Add chained ops test section**

Append after the Section A describe block:

```typescript
// 4c. Single Client - Split chained with other ops (table-driven)
describe('Tree History - single client split L1 chained ops', () => {
  type SplitChainOp = 'split' | 'insert-text' | 'delete-text';
  const chainOps: Array<SplitChainOp> = [
    'split',
    'insert-text',
    'delete-text',
  ];

  // Uses path-based ops for position safety after structural changes
  const applyChainOp = (doc: Document<{ t: Tree }>, op: SplitChainOp) => {
    doc.update((root) => {
      switch (op) {
        case 'split':
          // Split first <p> at offset 2 (between 2nd and 3rd char)
          root.t.editByPath([0, 2], [0, 2], undefined, 1);
          break;
        case 'insert-text':
          // Insert 'X' at start of first <p>
          root.t.editByPath([0, 0], [0, 0], { type: 'text', value: 'X' });
          break;
        case 'delete-text':
          // Delete first char of first <p>
          root.t.edit(1, 2);
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
                type: 'p',
                children: [{ type: 'text', value: 'ABCD' }],
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

- [ ] **Step 2: Run tests**

Run: `pnpm sdk test test/integration/history_tree_test.ts`

Expected: All 9 chained ops tests pass (3×3 combinations). The
implementation from Task 2 already handles split reverse ops.

- [ ] **Step 3: Commit**

```bash
git add packages/sdk/test/integration/history_tree_test.ts
git commit -m "Add table-driven chained ops tests for split undo/redo

9 combinations of split, insert-text, and delete-text in sequence.
Snapshot-based undo/redo verification at each step."
```

---

### Task 4: Table-driven multi-client convergence tests (Section C)

**Files:**
- Modify: `packages/sdk/test/integration/history_tree_test.ts`

- [ ] **Step 1: Add multi-client convergence test section**

Append after the Section B describe block:

```typescript
// 4d. Multi Client - Split undo convergence (table-driven)
describe('Tree History - multi client split L1 convergence', () => {
  type RemoteOp = 'insert-text' | 'delete-text' | 'insert-element';
  type RemotePos = 'before-split' | 'after-split' | 'different-element';

  const remoteOps: Array<RemoteOp> = [
    'insert-text',
    'delete-text',
    'insert-element',
  ];
  const remotePositions: Array<RemotePos> = [
    'before-split',
    'after-split',
    'different-element',
  ];

  // Initial tree: <doc><p>ABCD</p><p>EFGH</p></doc>
  // d1 splits first <p> at middle: <doc><p>AB</p><p>CD</p><p>EFGH</p></doc>
  // d2 does remote op at various positions

  const applyRemoteOp = (
    doc: Document<{ t: Tree }>,
    op: RemoteOp,
    pos: RemotePos,
  ) => {
    doc.update((root) => {
      switch (op) {
        case 'insert-text':
          switch (pos) {
            case 'before-split':
              // Insert 'X' at start of first <p>
              root.t.edit(1, 1, { type: 'text', value: 'X' });
              break;
            case 'after-split':
              // Insert 'X' at end of first <p> (after split point)
              root.t.edit(5, 5, { type: 'text', value: 'X' });
              break;
            case 'different-element':
              // Insert 'X' at start of second <p>
              root.t.edit(7, 7, { type: 'text', value: 'X' });
              break;
          }
          break;
        case 'delete-text':
          switch (pos) {
            case 'before-split':
              // Delete 'A' (first char of first <p>)
              root.t.edit(1, 2);
              break;
            case 'after-split':
              // Delete 'D' (last char of first <p>)
              root.t.edit(4, 5);
              break;
            case 'different-element':
              // Delete 'E' (first char of second <p>)
              root.t.edit(7, 8);
              break;
          }
          break;
        case 'insert-element':
          switch (pos) {
            case 'before-split':
              // Insert <p>NEW</p> before first <p>
              root.t.edit(0, 0, {
                type: 'p',
                children: [{ type: 'text', value: 'NEW' }],
              });
              break;
            case 'after-split':
              // Insert <p>NEW</p> between first and second <p>
              root.t.edit(6, 6, {
                type: 'p',
                children: [{ type: 'text', value: 'NEW' }],
              });
              break;
            case 'different-element':
              // Insert <p>NEW</p> after second <p>
              root.t.edit(12, 12, {
                type: 'p',
                children: [{ type: 'text', value: 'NEW' }],
              });
              break;
          }
          break;
      }
    }, `remote ${op} at ${pos}`);
  };

  for (const remoteOp of remoteOps) {
    for (const remotePos of remotePositions) {
      it(`should converge: split + remote ${remoteOp} at ${remotePos}`, async ({
        task,
      }) => {
        type TestDoc = { t: Tree };
        await withTwoClientsAndDocuments<TestDoc>(
          async (c1, d1, c2, d2) => {
            // Setup: both clients have the same initial tree
            d1.update((root) => {
              root.t = new Tree({
                type: 'doc',
                children: [
                  {
                    type: 'p',
                    children: [{ type: 'text', value: 'ABCD' }],
                  },
                  {
                    type: 'p',
                    children: [{ type: 'text', value: 'EFGH' }],
                  },
                ],
              });
            }, 'init');
            await c1.sync();
            await c2.sync();

            // d1: split first <p> at middle (between B and C)
            d1.update((root) => {
              root.t.edit(3, 3, undefined, 1);
            }, 'split');

            // d2: remote operation
            applyRemoteOp(d2, remoteOp, remotePos);

            // Sync both directions
            await c1.sync();
            await c2.sync();
            await c1.sync();

            // d1: undo the split
            d1.history.undo();

            // Sync again
            await c1.sync();
            await c2.sync();
            await c1.sync();

            // Assert convergence
            assert.equal(
              d1.getRoot().t.toXML(),
              d2.getRoot().t.toXML(),
              `divergence: split + ${remoteOp} at ${remotePos}`,
            );
          },
          task.name,
        );
      });
    }
  }
});
```

- [ ] **Step 2: Run tests**

Run: `pnpm sdk test test/integration/history_tree_test.ts`

Expected: All 9 multi-client convergence tests pass (3 ops × 3 positions).
These are all non-overlapping cases (Cases 1-2), which are already
supported by reconciliation.

- [ ] **Step 3: Commit**

```bash
git add packages/sdk/test/integration/history_tree_test.ts
git commit -m "Add table-driven multi-client split undo convergence tests

9 combinations of remote ops (insert-text, delete-text,
insert-element) at non-overlapping positions (before-split,
after-split, different-element). All use Cases 1-2
reconciliation."
```

---

### Task 5: Edge case tests (Section D)

**Files:**
- Modify: `packages/sdk/test/integration/history_tree_test.ts`

- [ ] **Step 1: Add edge case tests**

Append after the Section C describe block:

```typescript
// 4e. Edge cases for split undo/redo
describe('Tree History - split L1 edge cases', () => {
  it('should undo front split with empty paragraph', () => {
    const doc = new Document<{ t: Tree }>('test-doc');
    doc.update((root) => {
      root.t = new Tree({
        type: 'doc',
        children: [
          {
            type: 'p',
            children: [{ type: 'text', value: 'AB' }],
          },
        ],
      });
    }, 'init');
    const before = xmlOf(doc);

    // Front split creates empty <p> on the left
    doc.update((root) => {
      root.t.edit(1, 1, undefined, 1);
    }, 'front split');
    assert.equal(xmlOf(doc), '<doc><p></p><p>AB</p></doc>');

    doc.history.undo();
    assert.equal(xmlOf(doc), before);

    doc.history.redo();
    assert.equal(xmlOf(doc), '<doc><p></p><p>AB</p></doc>');
  });

  it('should undo back split with empty paragraph', () => {
    const doc = new Document<{ t: Tree }>('test-doc');
    doc.update((root) => {
      root.t = new Tree({
        type: 'doc',
        children: [
          {
            type: 'p',
            children: [{ type: 'text', value: 'AB' }],
          },
        ],
      });
    }, 'init');
    const before = xmlOf(doc);

    // Back split creates empty <p> on the right
    doc.update((root) => {
      root.t.edit(3, 3, undefined, 1);
    }, 'back split');
    assert.equal(xmlOf(doc), '<doc><p>AB</p><p></p></doc>');

    doc.history.undo();
    assert.equal(xmlOf(doc), before);

    doc.history.redo();
    assert.equal(xmlOf(doc), '<doc><p>AB</p><p></p></doc>');
  });

  it('should clear redo stack when new edit is made after split undo', () => {
    const doc = new Document<{ t: Tree }>('test-doc');
    doc.update((root) => {
      root.t = new Tree({
        type: 'doc',
        children: [
          {
            type: 'p',
            children: [{ type: 'text', value: 'ABCD' }],
          },
        ],
      });
    }, 'init');

    doc.update((root) => {
      root.t.edit(3, 3, undefined, 1);
    }, 'split');

    doc.history.undo();
    assert.equal(doc.history.canRedo(), true);

    doc.update((root) => {
      root.t.edit(1, 1, { type: 'text', value: 'Z' });
    }, 'new edit');
    assert.equal(doc.history.canRedo(), false);
  });
});
```

- [ ] **Step 2: Run tests**

Run: `pnpm sdk test test/integration/history_tree_test.ts`

Expected: All 3 edge case tests pass.

- [ ] **Step 3: Run full test suite**

Run: `pnpm lint && pnpm sdk build && pnpm sdk test`

Expected: Clean lint, successful build, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add packages/sdk/test/integration/history_tree_test.ts
git commit -m "Add edge case tests for split undo/redo

Cover front/back split with empty paragraphs and redo stack
clearing after split undo + new edit."
```
