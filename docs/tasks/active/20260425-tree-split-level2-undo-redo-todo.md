# Tree Split Level>=2 Undo/Redo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable undo/redo for `splitLevel >= 2` tree edits by relaxing the L1-only guard and verifying correctness experimentally with tests.

**Architecture:** Experiment-driven — write L2 tests first, make the minimal code change (guard relaxation), run tests to verify behavior, then document results. The existing `toSplitReverseOperation` already computes `boundarySize = 2 * splitLevel`, so L2 should produce a 4-token boundary deletion as reverse op.

**Tech Stack:** TypeScript (JS SDK), Vitest test framework. Tests require a running Yorkie server (`docker compose -f docker/docker-compose.yml up --build -d`).

---

### Task 1: Write Single-Client L2 Undo/Redo Tests

**Files:**
- Modify: `packages/sdk/test/integration/history_tree_test.ts:1456` (append after split L1 edge cases)

Write the L2 test section mirroring the L1 structure at line 483. These tests will FAIL until the guard is relaxed in Task 2.

- [ ] **Step 1: Add single-client L2 undo/redo test section**

Append after line 1456 (after the `split L1 edge cases` describe block), before the `Tree Style` section at line 1458:

```typescript
// 4f. Single Client - Split Undo/Redo (splitLevel=2, table-driven)
describe('Tree History - single client split L2 undo/redo', () => {
  type SplitPos = 'front' | 'middle' | 'back';
  const splitCases: Array<{
    pos: SplitPos;
    splitIdx: number;
    afterXML: string;
  }> = [
    {
      pos: 'front',
      splitIdx: 1,
      afterXML: '<doc><div><p></p></div><div><p>ABCD</p></div></doc>',
    },
    {
      pos: 'middle',
      splitIdx: 3,
      afterXML: '<doc><div><p>AB</p></div><div><p>CD</p></div></doc>',
    },
    {
      pos: 'back',
      splitIdx: 5,
      afterXML: '<doc><div><p>ABCD</p></div><div><p></p></div></doc>',
    },
  ];

  const beforeXML = '<doc><div><p>ABCD</p></div></doc>';

  for (const { pos, splitIdx, afterXML } of splitCases) {
    it(`should undo L2 split at ${pos}`, () => {
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
      }, `L2 split at ${pos}`);
      assert.equal(xmlOf(doc), afterXML);

      doc.history.undo();
      assert.equal(xmlOf(doc), beforeXML, `undo L2 split at ${pos} failed`);
    });

    it(`should undo-redo L2 split at ${pos}`, () => {
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
      }, `L2 split at ${pos}`);

      doc.history.undo();
      assert.equal(xmlOf(doc), beforeXML);

      doc.history.redo();
      assert.equal(
        xmlOf(doc),
        afterXML,
        `redo L2 split at ${pos} failed`,
      );
    });

    it(`should undo-redo-undo L2 split at ${pos}`, () => {
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
      }, `L2 split at ${pos}`);

      doc.history.undo();
      doc.history.redo();
      doc.history.undo();
      assert.equal(
        xmlOf(doc),
        beforeXML,
        `undo-redo-undo L2 split at ${pos} failed`,
      );
    });
  }
});
```

- [ ] **Step 2: Run tests to verify they fail (no reverse op generated yet)**

```bash
cd /Users/hackerwins/Development/yorkie-team/second-brain/03_projects/yorkie-js-sdk
pnpm sdk test test/integration/history_tree_test.ts 2>&1 | grep -E 'split L2|FAIL|PASS'
```

Expected: 9 new L2 tests fail (undo does nothing because `splitLevel === 2` has no reverse op).

- [ ] **Step 3: Commit failing tests**

```bash
git add packages/sdk/test/integration/history_tree_test.ts
git commit -m "Add single-client L2 split undo/redo tests (expected to fail)

Table-driven tests mirroring the L1 structure: front/middle/back
split positions × undo, undo-redo, undo-redo-undo actions.
Initial tree uses <doc><div><p>ABCD</p></div></doc> for 2-level
nesting required by splitLevel=2."
```

---

### Task 2: Relax the splitLevel Guard

**Files:**
- Modify: `packages/sdk/src/document/operation/tree_edit_operation.ts:195-201`

- [ ] **Step 1: Change the guard from L1-only to all split levels**

In `packages/sdk/src/document/operation/tree_edit_operation.ts`, replace lines 195-201:

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
```

Replace with:

```typescript
    const isPureSplit =
      this.splitLevel >= 1 &&
      !this.contents?.length &&
      removedNodes.length === 0;
    if (this.splitLevel === 0) {
      reverseOp = this.toReverseOperation(tree, removedNodes, preEditFromIdx);
    } else if (isPureSplit) {
      reverseOp = this.toSplitReverseOperation(tree, preEditFromIdx);
    }
```

- [ ] **Step 2: Run L2 tests to see if they pass**

```bash
cd /Users/hackerwins/Development/yorkie-team/second-brain/03_projects/yorkie-js-sdk
pnpm sdk test test/integration/history_tree_test.ts 2>&1 | grep -E 'split L2|✓|×|FAIL'
```

Record results: which tests pass, which fail, and the actual vs expected XML for failures.

- [ ] **Step 3: Run full history tree tests to check for regressions**

```bash
pnpm sdk test test/integration/history_tree_test.ts
```

All previously-passing tests must still pass.

- [ ] **Step 4: If L2 tests pass, commit**

```bash
git add packages/sdk/src/document/operation/tree_edit_operation.ts
git commit -m "Relax split undo guard from L1-only to all split levels

The isPureL1Split guard (splitLevel === 1) prevented reverse operation
generation for splitLevel >= 2. toSplitReverseOperation already
computes boundarySize = 2 * splitLevel, so L2 produces a 4-token
boundary deletion. The redoSplitLevel field preserves the original
split level for the redo cycle.

Forward convergence for splitLevel >= 2 is now fixed in both Go and
JS SDK, removing the original blocker."
```

- [ ] **Step 5: If any L2 tests fail, record the failure details**

If tests fail, do NOT proceed to Task 3. Instead:
1. Record the actual XML output for each failing test
2. Identify the pattern (which positions fail, undo vs redo)
3. Report findings for investigation

---

### Task 3: Add L2 Edge Case Tests

**Files:**
- Modify: `packages/sdk/test/integration/history_tree_test.ts` (append after L2 undo/redo section)

Only proceed if Task 2 Step 2 passes.

- [ ] **Step 1: Add L2 edge case tests**

Append after the L2 undo/redo describe block:

```typescript
// 4g. Edge cases for split L2 undo/redo
describe('Tree History - split L2 edge cases', () => {
  it('should undo front L2 split with empty elements', () => {
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
                children: [{ type: 'text', value: 'AB' }],
              },
            ],
          },
        ],
      });
    }, 'init');
    const before = xmlOf(doc);

    doc.update((root) => {
      root.t.edit(1, 1, undefined, 2);
    }, 'front L2 split');
    assert.equal(
      xmlOf(doc),
      '<doc><div><p></p></div><div><p>AB</p></div></doc>',
    );

    doc.history.undo();
    assert.equal(xmlOf(doc), before);

    doc.history.redo();
    assert.equal(
      xmlOf(doc),
      '<doc><div><p></p></div><div><p>AB</p></div></doc>',
    );
  });

  it('should undo back L2 split with empty elements', () => {
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
                children: [{ type: 'text', value: 'AB' }],
              },
            ],
          },
        ],
      });
    }, 'init');
    const before = xmlOf(doc);

    doc.update((root) => {
      root.t.edit(3, 3, undefined, 2);
    }, 'back L2 split');
    assert.equal(
      xmlOf(doc),
      '<doc><div><p>AB</p></div><div><p></p></div></doc>',
    );

    doc.history.undo();
    assert.equal(xmlOf(doc), before);

    doc.history.redo();
    assert.equal(
      xmlOf(doc),
      '<doc><div><p>AB</p></div><div><p></p></div></doc>',
    );
  });

  it('should undo L2 split chained with text insert', () => {
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

    // Op 1: L2 split at middle
    doc.update((root) => {
      root.t.edit(3, 3, undefined, 2);
    }, 'L2 split');
    const s1 = xmlOf(doc);

    // Op 2: insert text in second half
    doc.update((root) => {
      root.t.edit(6, 6, { type: 'text', value: 'X' });
    }, 'insert text');
    const s2 = xmlOf(doc);

    // Undo insert
    doc.history.undo();
    assert.equal(xmlOf(doc), s1, 'undo insert failed');

    // Undo split
    doc.history.undo();
    assert.equal(xmlOf(doc), s0, 'undo split failed');

    // Redo split
    doc.history.redo();
    assert.equal(xmlOf(doc), s1, 'redo split failed');

    // Redo insert
    doc.history.redo();
    assert.equal(xmlOf(doc), s2, 'redo insert failed');
  });

  it('should undo text insert chained with L2 split', () => {
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

    // Op 1: insert text
    doc.update((root) => {
      root.t.edit(3, 3, { type: 'text', value: 'X' });
    }, 'insert text');
    const s1 = xmlOf(doc);

    // Op 2: L2 split after inserted text
    doc.update((root) => {
      root.t.edit(4, 4, undefined, 2);
    }, 'L2 split');
    const s2 = xmlOf(doc);

    // Undo split
    doc.history.undo();
    assert.equal(xmlOf(doc), s1, 'undo split failed');

    // Undo insert
    doc.history.undo();
    assert.equal(xmlOf(doc), s0, 'undo insert failed');

    // Redo insert
    doc.history.redo();
    assert.equal(xmlOf(doc), s1, 'redo insert failed');

    // Redo split
    doc.history.redo();
    assert.equal(xmlOf(doc), s2, 'redo split failed');
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd /Users/hackerwins/Development/yorkie-team/second-brain/03_projects/yorkie-js-sdk
pnpm sdk test test/integration/history_tree_test.ts 2>&1 | grep -E 'split L2|edge|✓|×'
```

Record results. If any fail, record actual vs expected XML.

- [ ] **Step 3: Commit**

```bash
git add packages/sdk/test/integration/history_tree_test.ts
git commit -m "Add L2 split undo/redo edge case and chained op tests

Edge cases: front/back L2 split producing empty elements with undo
and redo. Chained ops: L2 split + text insert and text insert + L2
split with full undo-redo cycle verification."
```

---

### Task 4: Add Multi-Client L2 Convergence Tests

**Files:**
- Modify: `packages/sdk/test/integration/history_tree_test.ts` (append after L2 edge cases)

Only proceed if Tasks 2-3 pass.

- [ ] **Step 1: Add multi-client L2 convergence tests**

Append after the L2 edge cases describe block:

```typescript
// 4h. Multi Client - Split L2 undo convergence (table-driven)
describe('Tree History - multi client split L2 convergence', () => {
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

  // Initial tree: <doc><div><p>ABCD</p></div><div><p>EFGH</p></div></doc>
  // d1 splits first <div><p> at middle: splitLevel=2 at index 3
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
              // Insert "X" at start of first <p> text
              root.t.edit(2, 2, { type: 'text', value: 'X' });
              break;
            case 'after-split':
              // Insert "X" at end of first <p> text
              root.t.edit(5, 5, { type: 'text', value: 'X' });
              break;
            case 'different-element':
              // Insert "X" in second <div><p>
              root.t.edit(10, 10, { type: 'text', value: 'X' });
              break;
          }
          break;
        case 'delete-text':
          switch (pos) {
            case 'before-split':
              // Delete "A" at start of first <p>
              root.t.edit(2, 3);
              break;
            case 'after-split':
              // Delete "D" at end of first <p>
              root.t.edit(5, 6);
              break;
            case 'different-element':
              // Delete "E" in second <div><p>
              root.t.edit(10, 11);
              break;
          }
          break;
        case 'insert-element':
          switch (pos) {
            case 'before-split':
              // Insert <div><p>NEW</p></div> before first <div>
              root.t.edit(0, 0, {
                type: 'div',
                children: [
                  {
                    type: 'p',
                    children: [{ type: 'text', value: 'NEW' }],
                  },
                ],
              });
              break;
            case 'after-split':
              // Insert <div><p>NEW</p></div> after first <div>
              root.t.edit(8, 8, {
                type: 'div',
                children: [
                  {
                    type: 'p',
                    children: [{ type: 'text', value: 'NEW' }],
                  },
                ],
              });
              break;
            case 'different-element':
              // Insert <div><p>NEW</p></div> at end
              root.t.edit(16, 16, {
                type: 'div',
                children: [
                  {
                    type: 'p',
                    children: [{ type: 'text', value: 'NEW' }],
                  },
                ],
              });
              break;
          }
          break;
      }
    }, `remote ${op} at ${pos}`);
  };

  for (const remoteOp of remoteOps) {
    for (const remotePos of remotePositions) {
      it(`should converge: L2 split + remote ${remoteOp} at ${remotePos}`, async ({
        task,
      }) => {
        type TestDoc = { t: Tree };
        await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
          d1.update((root) => {
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
                {
                  type: 'div',
                  children: [
                    {
                      type: 'p',
                      children: [{ type: 'text', value: 'EFGH' }],
                    },
                  ],
                },
              ],
            });
          }, 'init');
          await c1.sync();
          await c2.sync();

          // d1: L2 split first <div><p> at middle (between B and C)
          d1.update((root) => {
            root.t.edit(4, 4, undefined, 2);
          }, 'L2 split');

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
            `divergence: L2 split + ${remoteOp} at ${remotePos}`,
          );
        }, task.name);
      });
    }
  }
});
```

- [ ] **Step 2: Run multi-client tests**

```bash
cd /Users/hackerwins/Development/yorkie-team/second-brain/03_projects/yorkie-js-sdk
pnpm sdk test test/integration/history_tree_test.ts 2>&1 | grep -E 'L2.*converge|divergence|✓|×'
```

Record results. Multi-client tests require the Yorkie server running.

- [ ] **Step 3: Commit**

```bash
git add packages/sdk/test/integration/history_tree_test.ts
git commit -m "Add multi-client L2 split undo convergence tests

Table-driven: 3 remote ops × 3 positions = 9 convergence tests.
Initial tree uses nested <div><p> structure for splitLevel=2.
Tests non-overlapping reconciliation (Cases 1-2)."
```

---

### Task 5: Update Design Docs

**Files:**
- Modify: `docs/design/tree-split-undo-redo.md`
- Modify: `../../yorkie/docs/design/undo-redo.md` (in yorkie submodule)

Only proceed after recording all test results from Tasks 1-4.

- [ ] **Step 1: Update tree-split-undo-redo.md with L2 section**

Add a section at the end of `docs/design/tree-split-undo-redo.md` documenting L2 results:

```markdown
## Extension: splitLevel>=2

### Status

[Record actual test results here — pass/fail counts, any unexpected
behavior observed during experiments.]

### Approach

Guard relaxation from `splitLevel === 1` to `splitLevel >= 1` in
`tree_edit_operation.ts`. The existing `toSplitReverseOperation`
computes `boundarySize = 2 * splitLevel` (4 tokens for L2), and
`redoSplitLevel` preserves the original level for redo.

### Findings

[Record any surprising behaviors, edge cases discovered, or
differences from L1 behavior.]
```

- [ ] **Step 2: Update undo-redo.md**

In `03_projects/yorkie/docs/design/undo-redo.md`:

1. Remove L2 from Non-Goals (line 29-30)
2. Update Split Undo/Redo section (line 315) to cover L2
3. Move L2 from Remaining Work (line 462) to Completed table (line 443)

Record actual test results in each update.

- [ ] **Step 3: Commit design doc updates**

```bash
cd /Users/hackerwins/Development/yorkie-team/second-brain/03_projects/yorkie-js-sdk
git add docs/design/tree-split-undo-redo.md
git commit -m "Update tree-split-undo-redo design doc with L2 experiment results"
```

```bash
cd /Users/hackerwins/Development/yorkie-team/second-brain/03_projects/yorkie
git add docs/design/undo-redo.md
git commit -m "Update undo-redo design doc: L2 split undo/redo enabled

Remove splitLevel>=2 from Non-Goals and Remaining Work. L2 forward
convergence is fixed, and the guard relaxation (splitLevel >= 1)
enables L2 undo/redo using the same boundary deletion mechanism as
L1."
```
