import { describe, it, assert } from 'vitest';
import yorkie, { Document, Tree } from '@yorkie-js/sdk/src/yorkie';
import {
  testRPCAddr,
  toDocKey,
  withTwoClientsAndDocuments,
} from '@yorkie-js/sdk/test/integration/integration_helper';

/**
 * Test State Space:
 * ┌─────────────────┬────────────────────────────────────────────────────────┐
 * │ Variable        │ Domain                                                 │
 * ├─────────────────┼────────────────────────────────────────────────────────┤
 * │ OpType          │ {insert-text, delete-text, insert-element,             │
 * │                 │  delete-element, replace-text, replace-element}        │
 * │ Position        │ {start, middle, end}                                   │
 * │ ClientCount     │ {1, 2}                                                 │
 * │ UndoDepth       │ {0, 1, 2, 3+}                                          │
 * │ ReconcileCase   │ {none, left, right, contained_by, contains,            │
 * │                 │  overlap_start, overlap_end, adjacent}                 │
 * └─────────────────┴────────────────────────────────────────────────────────┘
 */
type TreeOp =
  | 'insert-text'
  | 'delete-text'
  | 'insert-element'
  | 'delete-element'
  | 'replace-text'
  | 'replace-element';
const ops: Array<TreeOp> = [
  'insert-text',
  'delete-text',
  'insert-element',
  'delete-element',
  'replace-text',
  'replace-element',
];

// Initial tree: <doc><p>The fox jumped.</p></doc>
function initTree(doc: Document<{ t: Tree }>) {
  doc.update((root) => {
    root.t = new Tree({
      type: 'doc',
      children: [
        {
          type: 'p',
          children: [{ type: 'text', value: 'The fox jumped.' }],
        },
      ],
    });
  }, 'init');
}

const xmlOf = (doc: Document<{ t: Tree }>) => doc.getRoot().t.toXML();

// Applies tree operations from client 1 (operates at middle/end)
function applyTreeOp1(doc: Document<{ t: Tree }>, op: TreeOp) {
  doc.update((root) => {
    switch (op) {
      case 'insert-text':
        // Append "X" at end of <p> text (before closing tag)
        // <doc><p>The fox jumped.</p></doc> → index 16 is before </p>
        root.t.edit(16, 16, { type: 'text', value: 'X' });
        break;
      case 'delete-text':
        // Delete char at middle: "fox" → "fx" (delete 'o' at index 6)
        root.t.edit(6, 7);
        break;
      case 'insert-element':
        // Add <p>New</p> after first <p>
        root.t.edit(17, 17, {
          type: 'p',
          children: [{ type: 'text', value: 'New' }],
        });
        break;
      case 'delete-element':
        // Delete first <p> entirely: indices [0, 17)
        root.t.edit(0, 17);
        break;
      case 'replace-text':
        // Replace 'fox' with 'cat': indices [5, 8) → 'cat'
        root.t.edit(5, 8, { type: 'text', value: 'cat' });
        break;
      case 'replace-element':
        // Replace first <p> with <p>Replaced</p>
        root.t.edit(0, 17, {
          type: 'p',
          children: [{ type: 'text', value: 'Replaced' }],
        });
        break;
    }
  }, op);
}

// Applies tree operations from client 2 (operates at different positions)
function applyTreeOp2(doc: Document<{ t: Tree }>, op: TreeOp) {
  doc.update((root) => {
    switch (op) {
      case 'insert-text':
        // Insert "Q" at start of <p> text
        root.t.edit(1, 1, { type: 'text', value: 'Q' });
        break;
      case 'delete-text':
        // Delete last char '.' at end of text
        root.t.edit(15, 16);
        break;
      case 'insert-element':
        // Insert <p>Front</p> before first <p>
        root.t.edit(0, 0, {
          type: 'p',
          children: [{ type: 'text', value: 'Front' }],
        });
        break;
    }
  }, op);
}

// 1. Single Client - Basic Undo/Redo
describe('Tree History - single client basic', () => {
  for (const op of ops) {
    it(`should undo/redo ${op}`, () => {
      const doc = new Document<{ t: Tree }>('test-doc');
      initTree(doc);

      const before = xmlOf(doc);
      applyTreeOp1(doc, op);
      const after = xmlOf(doc);

      doc.history.undo();
      assert.equal(xmlOf(doc), before, `undo ${op} failed`);

      doc.history.redo();
      assert.equal(xmlOf(doc), after, `redo ${op} failed`);
    });
  }

  it('should handle undo-redo round trip multiple times', () => {
    const doc = new Document<{ t: Tree }>('test-doc');
    initTree(doc);

    const initial = xmlOf(doc);
    doc.update((root) => {
      root.t.edit(1, 1, { type: 'text', value: 'Hello ' });
    }, 'insert');
    const modified = xmlOf(doc);

    for (let i = 0; i < 3; i++) {
      doc.history.undo();
      assert.equal(xmlOf(doc), initial, `round ${i} undo failed`);
      doc.history.redo();
      assert.equal(xmlOf(doc), modified, `round ${i} redo failed`);
    }
  });

  it('should clear redo stack when new edit is made after undo', () => {
    const doc = new Document<{ t: Tree }>('test-doc');
    initTree(doc);

    doc.update((root) => {
      root.t.edit(16, 16, { type: 'text', value: 'X' });
    }, 'append');

    doc.history.undo();
    assert.equal(doc.history.canRedo(), true);

    doc.update((root) => {
      root.t.edit(1, 1, { type: 'text', value: 'Z' });
    }, 'new edit');
    assert.equal(doc.history.canRedo(), false);
  });
});

// 2. Single Client - Chained Ops
describe('Tree History - single client chained ops', () => {
  const chainOps: Array<TreeOp> = [
    'insert-text',
    'delete-text',
    'insert-element',
  ];

  for (const op1 of chainOps) {
    for (const op2 of chainOps) {
      for (const op3 of chainOps) {
        const caseName = `${op1}-${op2}-${op3}`;

        it(`should undo chain correctly: ${caseName}`, () => {
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

          const snapshots: Array<string> = [xmlOf(doc)];

          // Apply ops sequentially using safe operations at known positions
          const applyChainOp = (doc: Document<{ t: Tree }>, op: TreeOp) => {
            doc.update((root) => {
              switch (op) {
                case 'insert-text':
                  // Insert at end of first <p>
                  root.t.editByPath([0, 1], [0, 1], {
                    type: 'text',
                    value: 'X',
                  });
                  break;
                case 'delete-text':
                  // Delete first char in first <p>
                  root.t.edit(1, 2);
                  break;
                case 'insert-element':
                  // Insert new <p> at end
                  root.t.editByPath([1], [1], {
                    type: 'p',
                    children: [{ type: 'text', value: 'N' }],
                  });
                  break;
              }
            }, op);
          };

          applyChainOp(doc, op1);
          snapshots.push(xmlOf(doc));
          applyChainOp(doc, op2);
          snapshots.push(xmlOf(doc));
          applyChainOp(doc, op3);
          snapshots.push(xmlOf(doc));

          // Undo: S3 → S2 → S1 → S0
          for (let i = 3; i >= 1; i--) {
            doc.history.undo();
            assert.equal(xmlOf(doc), snapshots[i - 1], `undo to S${i - 1}`);
          }

          // Redo: S0 → S1 → S2 → S3
          for (let i = 0; i < 3; i++) {
            doc.history.redo();
            assert.equal(xmlOf(doc), snapshots[i + 1], `redo to S${i + 1}`);
          }
        });
      }
    }
  }
});

// 3. Single Client - Edge Cases
describe('Tree History - single client edge cases', () => {
  it('should handle edit at start position', () => {
    const doc = new Document<{ t: Tree }>('test-doc');
    initTree(doc);

    const before = xmlOf(doc);
    doc.update((root) => {
      root.t.edit(1, 4, { type: 'text', value: 'A' });
    }, 'edit at start');
    const after = xmlOf(doc);

    doc.history.undo();
    assert.equal(xmlOf(doc), before);

    doc.history.redo();
    assert.equal(xmlOf(doc), after);
  });

  it('should handle edit at middle position', () => {
    const doc = new Document<{ t: Tree }>('test-doc');
    initTree(doc);

    const before = xmlOf(doc);
    doc.update((root) => {
      root.t.edit(5, 8, { type: 'text', value: 'cat' });
    }, 'edit at middle');
    const after = xmlOf(doc);

    doc.history.undo();
    assert.equal(xmlOf(doc), before);

    doc.history.redo();
    assert.equal(xmlOf(doc), after);
  });

  it('should handle edit at end position', () => {
    const doc = new Document<{ t: Tree }>('test-doc');
    initTree(doc);

    const before = xmlOf(doc);
    doc.update((root) => {
      root.t.edit(16, 16, { type: 'text', value: '!' });
    }, 'edit at end');
    const after = xmlOf(doc);

    doc.history.undo();
    assert.equal(xmlOf(doc), before);

    doc.history.redo();
    assert.equal(xmlOf(doc), after);
  });

  it('should handle full tree deletion + undo', () => {
    const doc = new Document<{ t: Tree }>('test-doc');
    initTree(doc);

    const before = xmlOf(doc);
    doc.update((root) => {
      root.t.edit(0, 17);
    }, 'delete all');
    assert.equal(xmlOf(doc), '<doc></doc>');

    doc.history.undo();
    assert.equal(xmlOf(doc), before);

    doc.history.redo();
    assert.equal(xmlOf(doc), '<doc></doc>');
  });

  it('should handle empty undo/redo stacks', () => {
    const doc = new Document<{ t: Tree }>('test-doc');
    initTree(doc);

    assert.equal(doc.history.canUndo(), true);
    doc.history.undo();
    assert.equal(doc.history.canUndo(), false);
  });

  it('should handle rapid consecutive edits', () => {
    const doc = new Document<{ t: Tree }>('test-doc');
    doc.update((root) => {
      root.t = new Tree({
        type: 'doc',
        children: [
          {
            type: 'p',
            children: [],
          },
        ],
      });
    }, 'init');

    const states: Array<string> = [xmlOf(doc)];
    for (let i = 0; i < 10; i++) {
      doc.update((root) => {
        // Insert text at position 1 (inside <p>)
        root.t.edit(1, 1, { type: 'text', value: String(i) });
      }, `insert ${i}`);
      states.push(xmlOf(doc));
    }

    // Undo all
    for (let i = 9; i >= 0; i--) {
      doc.history.undo();
      assert.equal(xmlOf(doc), states[i]);
    }

    // Redo all
    for (let i = 1; i <= 10; i++) {
      doc.history.redo();
      assert.equal(xmlOf(doc), states[i]);
    }
  });
});

// 5. Multi Client - Basic
describe('Tree History - multi client basic', () => {
  const multiOps: Array<TreeOp> = [
    'insert-text',
    'delete-text',
    'insert-element',
  ];

  for (const op1 of multiOps) {
    for (const op2 of multiOps) {
      it(`should converge after undo: ${op1}-${op2}`, async ({ task }) => {
        type TestDoc = { t: Tree };
        await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
          d1.update((root) => {
            root.t = new Tree({
              type: 'doc',
              children: [
                {
                  type: 'p',
                  children: [{ type: 'text', value: 'The fox jumped.' }],
                },
              ],
            });
          }, 'init');
          await c1.sync();
          await c2.sync();

          applyTreeOp1(d1, op1);
          applyTreeOp2(d2, op2);

          await c1.sync();
          await c2.sync();
          await c1.sync();
          assert.equal(d1.toSortedJSON(), d2.toSortedJSON(), 'after ops');

          d1.history.undo();
          d2.history.undo();

          await c1.sync();
          await c2.sync();
          await c1.sync();
          assert.equal(d1.toSortedJSON(), d2.toSortedJSON(), 'after undo');
        }, task.name);
      });

      // TODO(Phase 2): Some redo combos with adjacent/overlapping ranges diverge
      const skipRedo = op1 === 'insert-text' && op2 === 'delete-text';
      const redoIt = skipRedo ? it.skip : it;
      redoIt(`should converge after redo: ${op1}-${op2}`, async ({ task }) => {
        type TestDoc = { t: Tree };
        await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
          d1.update((root) => {
            root.t = new Tree({
              type: 'doc',
              children: [
                {
                  type: 'p',
                  children: [{ type: 'text', value: 'The fox jumped.' }],
                },
              ],
            });
          }, 'init');
          await c1.sync();
          await c2.sync();

          applyTreeOp1(d1, op1);
          applyTreeOp2(d2, op2);

          await c1.sync();
          await c2.sync();
          await c1.sync();

          d1.history.undo();
          d2.history.undo();

          await c1.sync();
          await c2.sync();
          await c1.sync();

          d1.history.redo();
          d2.history.redo();

          await c1.sync();
          await c2.sync();
          await c1.sync();
          assert.equal(d1.toSortedJSON(), d2.toSortedJSON(), 'after redo');
        }, task.name);
      });
    }
  }
});

// 6. Multi Client - Reconcile Cases
/**
 * ReconcileCase Diagram (undo range [a,b), remote range [from,to)):
 *   Case 1 (left):         [--remote--]        [--undo--]   → shift left
 *   Case 2 (right):        [--undo--]          [--remote--] → no change
 *   Case 3 (contained_by): [-------remote-------]           → collapse
 *                               [--undo--]
 *   Case 4 (contains):          [--remote--]                → adjust
 *                          [---------undo---------]
 *   Case 5 (overlap_start):[---remote---]                   → partial
 *                                [---undo---]
 *   Case 6 (overlap_end):       [---remote---]              → partial
 *                          [---undo---]
 */
describe('Tree History - reconcile cases', () => {
  // Initial tree: <doc><p>0123456789</p></doc>
  // Indices:       0    1234567890  11
  //                                 01

  it('Case 1 (left): remote edit LEFT of undo should shift position', async ({
    task,
  }) => {
    type TestDoc = { t: Tree };
    await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'doc',
          children: [
            {
              type: 'p',
              children: [{ type: 'text', value: '0123456789' }],
            },
          ],
        });
      }, 'init');
      await c1.sync();
      await c2.sync();

      // d1: delete [7,9) = '67', d2: insert 'XX' at 3 (left of d1)
      d1.update((root) => root.t.edit(7, 9), 'd1 delete');
      d2.update(
        (root) => root.t.edit(3, 3, { type: 'text', value: 'XX' }),
        'd2 insert left',
      );

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      d1.history.undo();
      d2.history.undo();
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      d1.history.redo();
      d2.history.redo();
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, task.name);
  });

  it('Case 2 (right): remote edit RIGHT of undo should not affect', async ({
    task,
  }) => {
    type TestDoc = { t: Tree };
    await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'doc',
          children: [
            {
              type: 'p',
              children: [{ type: 'text', value: '0123456789' }],
            },
          ],
        });
      }, 'init');
      await c1.sync();
      await c2.sync();

      // d1: delete [3,5) = '23', d2: insert 'YY' at 9 (right of d1)
      d1.update((root) => root.t.edit(3, 5), 'd1 delete');
      d2.update(
        (root) => root.t.edit(9, 9, { type: 'text', value: 'YY' }),
        'd2 insert right',
      );

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      d1.history.undo();
      d2.history.undo();
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      d1.history.redo();
      d2.history.redo();
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, task.name);
  });

  // TODO(Phase 2): Overlapping reconciliation cases need symmetric index computation
  it.skip('Case 3 (contained_by): undo range contained by remote should collapse', async ({
    task,
  }) => {
    type TestDoc = { t: Tree };
    await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'doc',
          children: [
            {
              type: 'p',
              children: [{ type: 'text', value: '0123456789' }],
            },
          ],
        });
      }, 'init');
      await c1.sync();
      await c2.sync();

      // d1: delete [5,7) = '45', d2: delete [3,9) = '234567' (contains d1's range)
      d1.update((root) => root.t.edit(5, 7), 'd1 delete');
      d2.update((root) => root.t.edit(3, 9), 'd2 delete larger');

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      d1.history.undo();
      d2.history.undo();
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      d1.history.redo();
      d2.history.redo();
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, task.name);
  });

  // TODO(Phase 2): Overlapping reconciliation cases need symmetric index computation
  it.skip('Case 4 (contains): remote range contained by undo should adjust', async ({
    task,
  }) => {
    type TestDoc = { t: Tree };
    await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'doc',
          children: [
            {
              type: 'p',
              children: [{ type: 'text', value: '0123456789' }],
            },
          ],
        });
      }, 'init');
      await c1.sync();
      await c2.sync();

      // d1: delete [3,9) = '234567', d2: insert 'ZZ' at 6 (inside d1's range)
      d1.update((root) => root.t.edit(3, 9), 'd1 delete large');
      d2.update(
        (root) => root.t.edit(6, 6, { type: 'text', value: 'ZZ' }),
        'd2 insert inside',
      );

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      d1.history.undo();
      d2.history.undo();
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      d1.history.redo();
      d2.history.redo();
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, task.name);
  });

  // TODO(Phase 2): Overlapping reconciliation cases need symmetric index computation
  it.skip('Case 5 (overlap_start): remote overlaps start of undo range', async ({
    task,
  }) => {
    type TestDoc = { t: Tree };
    await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'doc',
          children: [
            {
              type: 'p',
              children: [{ type: 'text', value: '0123456789' }],
            },
          ],
        });
      }, 'init');
      await c1.sync();
      await c2.sync();

      // d1: delete [5,9) = '4567', d2: delete [3,7) = '2345' (overlaps start)
      d1.update((root) => root.t.edit(5, 9), 'd1 delete');
      d2.update((root) => root.t.edit(3, 7), 'd2 overlap start');

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      d1.history.undo();
      d2.history.undo();
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      d1.history.redo();
      d2.history.redo();
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, task.name);
  });

  // TODO(Phase 2): Overlapping reconciliation cases need symmetric index computation
  it.skip('Case 6 (overlap_end): remote overlaps end of undo range', async ({
    task,
  }) => {
    type TestDoc = { t: Tree };
    await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'doc',
          children: [
            {
              type: 'p',
              children: [{ type: 'text', value: '0123456789' }],
            },
          ],
        });
      }, 'init');
      await c1.sync();
      await c2.sync();

      // d1: delete [3,7) = '2345', d2: delete [5,9) = '4567' (overlaps end)
      d1.update((root) => root.t.edit(3, 7), 'd1 delete');
      d2.update((root) => root.t.edit(5, 9), 'd2 overlap end');

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      d1.history.undo();
      d2.history.undo();
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      d1.history.redo();
      d2.history.redo();
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, task.name);
  });

  it('Case 7 (adjacent): adjacent edits at boundary', async ({ task }) => {
    type TestDoc = { t: Tree };
    await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'doc',
          children: [
            {
              type: 'p',
              children: [{ type: 'text', value: '0123456789' }],
            },
          ],
        });
      }, 'init');
      await c1.sync();
      await c2.sync();

      // d1: delete [5,7) = '45', d2: insert 'AA' at 7 (adjacent)
      d1.update((root) => root.t.edit(5, 7), 'd1 delete');
      d2.update(
        (root) => root.t.edit(7, 7, { type: 'text', value: 'AA' }),
        'd2 insert adjacent',
      );

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      d1.history.undo();
      d2.history.undo();
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      d1.history.redo();
      d2.history.redo();
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, task.name);
  });
});

// 7. Multi Client - Edge Cases
describe('Tree History - multi client edge cases', () => {
  it('should converge with concurrent element + text edits', async ({
    task,
  }) => {
    type TestDoc = { t: Tree };
    await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
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
      await c1.sync();
      await c2.sync();

      // d1: insert element, d2: insert text
      d1.update((root) => {
        root.t.edit(5, 5, {
          type: 'p',
          children: [{ type: 'text', value: 'New' }],
        });
      }, 'd1 insert element');
      d2.update((root) => {
        root.t.edit(1, 1, { type: 'text', value: 'X' });
      }, 'd2 insert text');

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      d1.history.undo();
      d2.history.undo();

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, task.name);
  });

  it('should converge with concurrent text edits in same paragraph', async ({
    task,
  }) => {
    type TestDoc = { t: Tree };
    await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'doc',
          children: [
            {
              type: 'p',
              children: [{ type: 'text', value: 'ABCDEFGH' }],
            },
          ],
        });
      }, 'init');
      await c1.sync();
      await c2.sync();

      // Both edit different ranges in same paragraph
      d1.update((root) => {
        root.t.edit(3, 5, { type: 'text', value: 'XX' });
      }, 'd1 edit');
      d2.update((root) => {
        root.t.edit(7, 9, { type: 'text', value: 'YY' });
      }, 'd2 edit');

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      // d1: undo then redo, d2: just undo
      d1.history.undo();
      await c1.sync();
      await c2.sync();
      await c1.sync();

      d1.history.redo();
      d2.history.undo();

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, task.name);
  });

  it('should converge with nested structure concurrent edits', async ({
    task,
  }) => {
    type TestDoc = { t: Tree };
    await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Tree({
          type: 'doc',
          children: [
            {
              type: 'p',
              children: [{ type: 'text', value: 'AB' }],
            },
            {
              type: 'p',
              children: [{ type: 'text', value: 'CD' }],
            },
          ],
        });
      }, 'init');
      await c1.sync();
      await c2.sync();

      // d1: edit in first <p>, d2: edit in second <p>
      d1.update((root) => {
        root.t.edit(1, 1, { type: 'text', value: 'X' });
      }, 'd1 edit first p');
      d2.update((root) => {
        root.t.edit(5, 5, { type: 'text', value: 'Y' });
      }, 'd2 edit second p');

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      d1.history.undo();
      d2.history.undo();

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      d1.history.redo();
      d2.history.redo();

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, task.name);
  });
});

// 4. Tree Style Undo/Redo (table-driven)
describe('Tree History - tree style undo/redo', () => {
  type StyleOp = 'set-bold' | 'set-italic' | 'set-color' | 'remove-bold';

  const styleOps: Array<StyleOp> = [
    'set-bold',
    'set-italic',
    'set-color',
    'remove-bold',
  ];

  const makeTree = () =>
    new Tree({
      type: 'doc',
      children: [
        {
          type: 'p',
          attributes: { bold: 'true' },
          children: [{ type: 'text', value: 'AB' }],
        },
        {
          type: 'p',
          children: [{ type: 'text', value: 'CD' }],
        },
      ],
    });

  const applyStyleOp = (doc: Document<{ t: Tree }>, op: StyleOp) => {
    doc.update((root) => {
      switch (op) {
        case 'set-bold':
          root.t.style(0, 1, { bold: 'true' });
          break;
        case 'set-italic':
          root.t.style(0, 1, { italic: 'true' });
          break;
        case 'set-color':
          root.t.style(3, 4, { color: 'red' });
          break;
        case 'remove-bold':
          root.t.removeStyle(0, 1, ['bold']);
          break;
      }
    }, op);
  };

  // 5a. Single-client style undo/redo
  for (const op of styleOps) {
    it(`should undo/redo: ${op}`, () => {
      const doc = new Document<{ t: Tree }>('test-doc');
      doc.update((root) => {
        root.t = makeTree();
      }, 'init');

      const s0 = xmlOf(doc);
      applyStyleOp(doc, op);
      const s1 = xmlOf(doc);

      doc.history.undo();
      assert.equal(xmlOf(doc), s0, `undo ${op} failed`);

      doc.history.redo();
      assert.equal(xmlOf(doc), s1, `redo ${op} failed`);
    });
  }

  // 5b. Chained style ops (skip combos where second op is a no-op:
  // remove-bold after remove-bold doesn't push to undo stack since
  // the attribute is already removed).
  for (const op1 of styleOps) {
    for (const op2 of styleOps) {
      if (op1 === 'remove-bold' && op2 === 'remove-bold') continue;
      it(`should undo chain: ${op1} → ${op2}`, () => {
        const doc = new Document<{ t: Tree }>('test-doc');
        doc.update((root) => {
          root.t = makeTree();
        }, 'init');

        const s0 = xmlOf(doc);
        applyStyleOp(doc, op1);
        const s1 = xmlOf(doc);
        applyStyleOp(doc, op2);
        const s2 = xmlOf(doc);

        doc.history.undo();
        assert.equal(xmlOf(doc), s1, `undo ${op2} failed`);
        doc.history.undo();
        assert.equal(xmlOf(doc), s0, `undo ${op1} failed`);

        doc.history.redo();
        assert.equal(xmlOf(doc), s1, `redo ${op1} failed`);
        doc.history.redo();
        assert.equal(xmlOf(doc), s2, `redo ${op2} failed`);
      });
    }
  }

  // 5c. Style + edit mixed chains
  it('should undo style after edit', () => {
    const doc = new Document<{ t: Tree }>('test-doc');
    doc.update((root) => {
      root.t = makeTree();
    }, 'init');

    const s0 = xmlOf(doc);
    doc.update((root) => {
      root.t.edit(1, 1, { type: 'text', value: 'X' });
    }, 'insert');
    const s1 = xmlOf(doc);
    applyStyleOp(doc, 'set-italic');
    const s2 = xmlOf(doc);

    doc.history.undo();
    assert.equal(xmlOf(doc), s1, 'undo style failed');
    doc.history.undo();
    assert.equal(xmlOf(doc), s0, 'undo edit failed');
    doc.history.redo();
    assert.equal(xmlOf(doc), s1, 'redo edit failed');
    doc.history.redo();
    assert.equal(xmlOf(doc), s2, 'redo style failed');
  });

  it('should undo edit after style', () => {
    const doc = new Document<{ t: Tree }>('test-doc');
    doc.update((root) => {
      root.t = makeTree();
    }, 'init');

    const s0 = xmlOf(doc);
    applyStyleOp(doc, 'set-italic');
    const s1 = xmlOf(doc);
    doc.update((root) => {
      root.t.edit(1, 1, { type: 'text', value: 'X' });
    }, 'insert');
    const s2 = xmlOf(doc);

    doc.history.undo();
    assert.equal(xmlOf(doc), s1, 'undo edit failed');
    doc.history.undo();
    assert.equal(xmlOf(doc), s0, 'undo style failed');
    doc.history.redo();
    assert.equal(xmlOf(doc), s1, 'redo style failed');
    doc.history.redo();
    assert.equal(xmlOf(doc), s2, 'redo edit failed');
  });
});

// 5. Multi-client Tree Style Undo Convergence (table-driven)
describe('Tree History - multi client style undo convergence', () => {
  type LocalStyleOp = 'set-bold' | 'set-italic' | 'remove-bold';
  type RemoteStyleOp = 'set-color' | 'set-bold' | 'remove-bold';
  type Target = 'same-element' | 'different-element';

  const localOps: Array<LocalStyleOp> = [
    'set-bold',
    'set-italic',
    'remove-bold',
  ];
  const remoteOps: Array<RemoteStyleOp> = [
    'set-color',
    'set-bold',
    'remove-bold',
  ];
  const targets: Array<Target> = ['same-element', 'different-element'];

  for (const localOp of localOps) {
    for (const remoteOp of remoteOps) {
      for (const target of targets) {
        it(`should converge: local ${localOp} + remote ${remoteOp} on ${target}`, async ({
          task,
        }) => {
          type TestDoc = { t: Tree };
          await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
            // Setup: <doc><p bold="true">AB</p><p>CD</p></doc>
            d1.update((root) => {
              root.t = new Tree({
                type: 'doc',
                children: [
                  {
                    type: 'p',
                    attributes: { bold: 'true' },
                    children: [{ type: 'text', value: 'AB' }],
                  },
                  {
                    type: 'p',
                    children: [{ type: 'text', value: 'CD' }],
                  },
                ],
              });
            }, 'init');
            await c1.sync();
            await c2.sync();

            // d1: local style op on first <p>
            d1.update((root) => {
              switch (localOp) {
                case 'set-bold':
                  root.t.style(0, 1, { bold: 'true' });
                  break;
                case 'set-italic':
                  root.t.style(0, 1, { italic: 'true' });
                  break;
                case 'remove-bold':
                  root.t.removeStyle(0, 1, ['bold']);
                  break;
              }
            }, 'local style');

            // d2: remote style op
            d2.update((root) => {
              const idx = target === 'same-element' ? 0 : 3;
              const toIdx = target === 'same-element' ? 1 : 4;
              switch (remoteOp) {
                case 'set-color':
                  root.t.style(idx, toIdx, { color: 'red' });
                  break;
                case 'set-bold':
                  root.t.style(idx, toIdx, { bold: 'true' });
                  break;
                case 'remove-bold':
                  root.t.removeStyle(idx, toIdx, ['bold']);
                  break;
              }
            }, 'remote style');

            // Sync
            await c1.sync();
            await c2.sync();
            await c1.sync();

            // d1: undo local style
            d1.history.undo();

            // Sync again
            await c1.sync();
            await c2.sync();
            await c1.sync();

            assert.equal(
              d1.getRoot().t.toXML(),
              d2.getRoot().t.toXML(),
              `divergence: ${localOp} + ${remoteOp} on ${target}`,
            );
          }, task.name);
        });
      }
    }
  }
});

// 6. Multi-client Style vs Edit/Split mixed convergence (table-driven)
describe('Tree History - multi client style vs edit/split convergence', () => {
  type LocalStyleOp = 'set-bold' | 'set-italic' | 'remove-bold';
  type RemoteEditOp =
    | 'insert-text'
    | 'delete-text'
    | 'insert-element'
    | 'split-l1';

  const localOps: Array<LocalStyleOp> = [
    'set-bold',
    'set-italic',
    'remove-bold',
  ];
  const remoteOps: Array<RemoteEditOp> = [
    'insert-text',
    'delete-text',
    'insert-element',
    'split-l1',
  ];

  for (const localOp of localOps) {
    for (const remoteOp of remoteOps) {
      it(`should converge: local style(${localOp}) + remote edit(${remoteOp})`, async ({
        task,
      }) => {
        type TestDoc = { t: Tree };
        await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
          // Setup: <doc><p bold="true">ABCD</p><p>EFGH</p></doc>
          d1.update((root) => {
            root.t = new Tree({
              type: 'doc',
              children: [
                {
                  type: 'p',
                  attributes: { bold: 'true' },
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

          // d1: local style on first <p>
          d1.update((root) => {
            switch (localOp) {
              case 'set-bold':
                root.t.style(0, 1, { bold: 'true' });
                break;
              case 'set-italic':
                root.t.style(0, 1, { italic: 'true' });
                break;
              case 'remove-bold':
                root.t.removeStyle(0, 1, ['bold']);
                break;
            }
          }, 'local style');

          // d2: remote edit
          d2.update((root) => {
            switch (remoteOp) {
              case 'insert-text':
                root.t.edit(1, 1, { type: 'text', value: 'X' });
                break;
              case 'delete-text':
                root.t.edit(1, 2);
                break;
              case 'insert-element':
                root.t.edit(6, 6, {
                  type: 'p',
                  children: [{ type: 'text', value: 'NEW' }],
                });
                break;
              case 'split-l1':
                root.t.edit(3, 3, undefined, 1);
                break;
            }
          }, 'remote edit');

          await c1.sync();
          await c2.sync();
          await c1.sync();

          // d1: undo style
          d1.history.undo();

          await c1.sync();
          await c2.sync();
          await c1.sync();

          assert.equal(
            d1.getRoot().t.toXML(),
            d2.getRoot().t.toXML(),
            `divergence: style(${localOp}) + edit(${remoteOp})`,
          );
        }, task.name);
      });

      // Reverse direction: local edit, remote style, undo edit
      it(`should converge: local edit(${remoteOp}) + remote style(${localOp})`, async ({
        task,
      }) => {
        type TestDoc = { t: Tree };
        await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
          d1.update((root) => {
            root.t = new Tree({
              type: 'doc',
              children: [
                {
                  type: 'p',
                  attributes: { bold: 'true' },
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

          // d1: local edit
          d1.update((root) => {
            switch (remoteOp) {
              case 'insert-text':
                root.t.edit(1, 1, { type: 'text', value: 'X' });
                break;
              case 'delete-text':
                root.t.edit(1, 2);
                break;
              case 'insert-element':
                root.t.edit(6, 6, {
                  type: 'p',
                  children: [{ type: 'text', value: 'NEW' }],
                });
                break;
              case 'split-l1':
                root.t.edit(3, 3, undefined, 1);
                break;
            }
          }, 'local edit');

          // d2: remote style
          d2.update((root) => {
            switch (localOp) {
              case 'set-bold':
                root.t.style(0, 1, { bold: 'true' });
                break;
              case 'set-italic':
                root.t.style(0, 1, { italic: 'true' });
                break;
              case 'remove-bold':
                root.t.removeStyle(0, 1, ['bold']);
                break;
            }
          }, 'remote style');

          await c1.sync();
          await c2.sync();
          await c1.sync();

          // d1: undo edit
          d1.history.undo();

          await c1.sync();
          await c2.sync();
          await c1.sync();

          assert.equal(
            d1.getRoot().t.toXML(),
            d2.getRoot().t.toXML(),
            `divergence: edit(${remoteOp}) + style(${localOp})`,
          );
        }, task.name);
      });
    }
  }
});

// Verify: attach clears undo stack so initialRoot cannot be undone.
//
// Previously, creating a tree via client.attach({ initialRoot }) left the
// creation on the undo stack. Typing characters and undoing more times
// than characters typed could revert the tree creation, destroying the doc.
describe('Tree History - undo past initial tree via initialRoot', () => {
  it('should not allow undoing past initialRoot after attach', async function ({
    task,
  }) {
    type DocType = { content: Tree };
    const c1 = new yorkie.Client({ rpcAddr: testRPCAddr });
    await c1.activate();
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const doc = new yorkie.Document<DocType>(docKey);

    // Attach with initialRoot containing a Tree (like wafflebase ensureTree)
    await c1.attach(doc, {
      initialRoot: {
        content: new Tree({
          type: 'doc',
          children: [
            {
              type: 'block',
              attributes: { id: 'block-1' },
              children: [{ type: 'inline', children: [] }],
            },
          ],
        }),
      },
    });

    const initialXml = doc.getRoot().content.toXML();

    // After attach, the undo stack should be empty — initialRoot is
    // not an undoable user action.
    assert.equal(
      doc.getUndoStackForTest().length,
      0,
      'undo stack should be empty after attach',
    );
    assert.equal(doc.history.canUndo(), false);

    // Insert 4 characters one by one (like typing "asdf")
    for (const ch of ['a', 's', 'd', 'f']) {
      doc.update((root) => {
        root.content.editByPath([0, 0, 0], [0, 0, 0], {
          type: 'text',
          value: ch,
        });
      }, `type '${ch}'`);
    }

    // Undo 4 times — should revert each character
    for (let i = 0; i < 4; i++) {
      assert.equal(doc.history.canUndo(), true);
      doc.history.undo();
    }
    assert.equal(doc.getRoot().content.toXML(), initialXml);

    // 5th undo — should be blocked, tree stays intact
    assert.equal(
      doc.history.canUndo(),
      false,
      'should not be able to undo past initialRoot',
    );
    assert.equal(
      doc.getRoot().content.toXML(),
      initialXml,
      'tree should remain intact',
    );

    await c1.deactivate();
  });
});
