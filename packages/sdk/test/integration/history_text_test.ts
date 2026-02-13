import { describe, it, assert } from 'vitest';
import { Document, Text } from '@yorkie-js/sdk/src/yorkie';
import { withTwoClientsAndDocuments } from '@yorkie-js/sdk/test/integration/integration_helper';

/**
 * Test State Space:
 * ┌─────────────────┬────────────────────────────────────────────────────────┐
 * │ Variable        │ Domain                                                 │
 * ├─────────────────┼────────────────────────────────────────────────────────┤
 * │ OpType          │ {insert, delete, replace, style(TODO: Implement)}      │
 * │ Position        │ {start, middle, end}                                   │
 * │ ClientCount     │ {1, 2}                                                 │
 * │ UndoDepth       │ {0, 1, 2, 3+}                                          │
 * │ ReconcileCase   │ {none, left, right, contained_by, contains,            │
 * │                 │  overlap_start, overlap_end, adjacent}                 │
 * └─────────────────┴────────────────────────────────────────────────────────┘
 */
type TextOp = 'insert' | 'delete' | 'replace' | 'style';
const ops: Array<TextOp> = ['insert', 'delete', 'replace'];

function applyTextOp1(doc: Document<{ t: Text }>, op: TextOp) {
  doc.update((root) => {
    const t = root.t;
    const len = t.length ?? t.toString().length;

    switch (op) {
      case 'insert':
        t.edit(len, len, 'X');
        break;
      case 'delete':
        if (len >= 3) t.edit(1, 2, '');
        else if (len > 0) t.edit(0, 1, '');
        break;
      case 'replace':
        if (len >= 3) t.edit(1, 3, '12');
        else t.edit(0, Math.min(1, len), 'R');
        break;
      case 'style':
        if (len === 0) t.edit(0, 0, 'A');
        t.setStyle(0, t.length ?? t.toString().length, { bold: true });
        break;
    }
  }, op);
}

function applyTextOp2(doc: Document<{ t: Text }>, op: TextOp) {
  doc.update((root) => {
    const t = root.t;
    const len = t.length ?? t.toString().length;

    switch (op) {
      case 'insert':
        t.edit(0, 0, 'Q');
        break;
      case 'delete':
        if (len > 0) t.edit(len - 1, len, '');
        break;
      case 'replace':
        if (len > 0) t.edit(0, 1, 'Z');
        else t.edit(0, 0, 'Z');
        break;
    }
  }, op);
}

// 1. Single Client - Basic Undo/Redo
describe('Text History - single client basic', () => {
  const contentOf = (doc: Document<{ t: Text }>) => doc.getRoot().t.toString();

  for (const op of ops) {
    it(`should undo/redo ${op}`, () => {
      const doc = new Document<{ t: Text }>('test-doc');
      doc.update((root) => {
        root.t = new Text();
        root.t.edit(0, 0, 'The fox jumped.');
      }, 'init');

      const before = contentOf(doc);
      applyTextOp1(doc, op);
      const after = contentOf(doc);

      doc.history.undo();
      assert.equal(contentOf(doc), before, `undo ${op} failed`);

      doc.history.redo();
      assert.equal(contentOf(doc), after, `redo ${op} failed`);
    });
  }

  it('should handle undo-redo round trip multiple times', () => {
    const doc = new Document<{ t: Text }>('test-doc');
    doc.update((root) => {
      root.t = new Text();
      root.t.edit(0, 0, 'ABCD');
    }, 'init');

    const initial = contentOf(doc);
    doc.update((root) => root.t.edit(2, 2, 'XY'), 'insert');
    const modified = contentOf(doc);

    for (let i = 0; i < 3; i++) {
      doc.history.undo();
      assert.equal(contentOf(doc), initial, `round ${i} undo failed`);
      doc.history.redo();
      assert.equal(contentOf(doc), modified, `round ${i} redo failed`);
    }
  });

  it('should clear redo stack when new edit is made after undo', () => {
    const doc = new Document<{ t: Text }>('test-doc');
    doc.update((root) => {
      root.t = new Text();
      root.t.edit(0, 0, 'ABCD');
    }, 'init');
    doc.update((root) => root.t.edit(4, 4, 'EF'), 'append');

    doc.history.undo();
    assert.equal(doc.history.canRedo(), true);

    doc.update((root) => root.t.edit(0, 0, 'Z'), 'new edit');
    assert.equal(doc.history.canRedo(), false);
  });

  it('should undo/redo style op', () => {
    const doc = new Document<{ t: Text }>('test-doc');
    doc.update((root) => {
      root.t = new Text();
      root.t.edit(0, 0, 'The fox jumped.');
    }, 'init');

    const initialJSON = doc.toSortedJSON();
    const styledJSON =
      '{"t":[{"attrs":{"bold":true},"val":"The fox jumped."}]}';

    applyTextOp1(doc, 'style');
    assert.equal(doc.toSortedJSON(), styledJSON);

    doc.history.undo();
    assert.equal(doc.toSortedJSON(), initialJSON);

    doc.history.redo();
    assert.equal(doc.toSortedJSON(), styledJSON);
  });
});

describe('Text History - single client chained ops', () => {
  const contentOf = (doc: Document<{ t: Text }>) => doc.getRoot().t.toString();

  for (const op1 of ops) {
    for (const op2 of ops) {
      for (const op3 of ops) {
        const caseName = `${op1}-${op2}-${op3}`;

        it(`should undo chain correctly: ${caseName}`, () => {
          const doc = new Document<{ t: Text }>('test-doc');
          doc.update((root) => {
            root.t = new Text();
            root.t.edit(0, 0, 'ABCD');
          }, 'init');

          const snapshots: Array<string> = [contentOf(doc)];
          applyTextOp1(doc, op1);
          snapshots.push(contentOf(doc));
          applyTextOp1(doc, op2);
          snapshots.push(contentOf(doc));
          applyTextOp1(doc, op3);
          snapshots.push(contentOf(doc));

          // Undo: S3 → S2 → S1 → S0
          for (let i = 3; i >= 1; i--) {
            doc.history.undo();
            assert.equal(contentOf(doc), snapshots[i - 1], `undo to S${i - 1}`);
          }

          // Redo: S0 → S1 → S2 → S3
          for (let i = 0; i < 3; i++) {
            doc.history.redo();
            assert.equal(contentOf(doc), snapshots[i + 1], `redo to S${i + 1}`);
          }
        });
      }
    }
  }
});

describe('Text History - single client edge cases', () => {
  const contentOf = (doc: Document<{ t: Text }>) => doc.getRoot().t.toString();

  // Position: start
  it('should handle edit at start position', () => {
    const doc = new Document<{ t: Text }>('test-doc');
    doc.update((root) => {
      root.t = new Text();
      root.t.edit(0, 0, 'ABCD');
    }, 'init');

    doc.update((root) => root.t.edit(0, 2, ''), 'delete at start');
    assert.equal(contentOf(doc), 'CD');

    doc.history.undo();
    assert.equal(contentOf(doc), 'ABCD');

    doc.history.redo();
    assert.equal(contentOf(doc), 'CD');
  });

  // Position: end
  it('should handle edit at end position', () => {
    const doc = new Document<{ t: Text }>('test-doc');
    doc.update((root) => {
      root.t = new Text();
      root.t.edit(0, 0, 'ABCD');
    }, 'init');

    doc.update((root) => root.t.edit(2, 4, ''), 'delete at end');
    assert.equal(contentOf(doc), 'AB');

    doc.history.undo();
    assert.equal(contentOf(doc), 'ABCD');

    doc.history.redo();
    assert.equal(contentOf(doc), 'AB');
  });

  // Empty text
  it('should handle insert into empty text', () => {
    const doc = new Document<{ t: Text }>('test-doc');
    doc.update((root) => {
      root.t = new Text();
    }, 'init');
    assert.equal(contentOf(doc), '');

    doc.update((root) => root.t.edit(0, 0, 'Hello'), 'insert');
    assert.equal(contentOf(doc), 'Hello');

    doc.history.undo();
    assert.equal(contentOf(doc), '');

    doc.history.redo();
    assert.equal(contentOf(doc), 'Hello');
  });

  // Full deletion
  it('should handle full deletion then undo', () => {
    const doc = new Document<{ t: Text }>('test-doc');
    doc.update((root) => {
      root.t = new Text();
      root.t.edit(0, 0, 'ABCD');
    }, 'init');

    doc.update((root) => root.t.edit(0, 4, ''), 'delete all');
    assert.equal(contentOf(doc), '');

    doc.history.undo();
    assert.equal(contentOf(doc), 'ABCD');

    doc.history.redo();
    assert.equal(contentOf(doc), '');
  });

  // Full replacement
  it('should handle full replacement', () => {
    const doc = new Document<{ t: Text }>('test-doc');
    doc.update((root) => {
      root.t = new Text();
      root.t.edit(0, 0, 'OLD');
    }, 'init');

    doc.update((root) => {
      const len = root.t.length ?? root.t.toString().length;
      root.t.edit(0, len, 'NEW');
    }, 'replace all');
    assert.equal(contentOf(doc), 'NEW');

    doc.history.undo();
    assert.equal(contentOf(doc), 'OLD');

    doc.history.redo();
    assert.equal(contentOf(doc), 'NEW');
  });

  // Single character
  it('should handle single character operations', () => {
    const doc = new Document<{ t: Text }>('test-doc');
    doc.update((root) => {
      root.t = new Text();
      root.t.edit(0, 0, 'ABC');
    }, 'init');

    doc.update((root) => root.t.edit(1, 1, 'X'), 'insert X');
    assert.equal(contentOf(doc), 'AXBC');

    doc.history.undo();
    assert.equal(contentOf(doc), 'ABC');

    doc.update((root) => root.t.edit(1, 2, ''), 'delete B');
    assert.equal(contentOf(doc), 'AC');

    doc.history.undo();
    assert.equal(contentOf(doc), 'ABC');
  });

  // UndoDepth=0: empty stacks
  it('should handle empty undo stack', () => {
    const doc = new Document<{ t: Text }>('test-doc');
    doc.update((root) => {
      root.t = new Text();
      root.t.edit(0, 0, 'ABCD');
    }, 'init');

    assert.equal(doc.history.canUndo(), true);
    doc.history.undo();
    assert.equal(doc.history.canUndo(), false);
  });

  it('should handle empty redo stack', () => {
    const doc = new Document<{ t: Text }>('test-doc');
    doc.update((root) => {
      root.t = new Text();
      root.t.edit(0, 0, 'ABCD');
    }, 'init');

    assert.equal(doc.history.canRedo(), false);
  });

  // Rapid consecutive edits (UndoDepth=3+)
  it('should handle rapid consecutive edits', () => {
    const doc = new Document<{ t: Text }>('test-doc');
    doc.update((root) => {
      root.t = new Text();
    }, 'init');

    const states: Array<string> = [''];
    for (let i = 0; i < 10; i++) {
      doc.update((root) => {
        const len = root.t.length ?? root.t.toString().length;
        root.t.edit(len, len, String(i));
      }, `insert ${i}`);
      states.push(contentOf(doc));
    }

    // Undo all
    for (let i = 9; i >= 0; i--) {
      doc.history.undo();
      assert.equal(contentOf(doc), states[i]);
    }

    // Redo all
    for (let i = 1; i <= 10; i++) {
      doc.history.redo();
      assert.equal(contentOf(doc), states[i]);
    }
  });
});

describe('Text History - multi client basic', () => {
  for (const op1 of ops) {
    for (const op2 of ops) {
      it(`should converge after undo: ${op1}-${op2}`, async ({ task }) => {
        type TestDoc = { t: Text };
        await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
          d1.update((root) => {
            root.t = new Text();
            root.t.edit(0, 0, 'The fox jumped.');
          }, 'init');
          await c1.sync();
          await c2.sync();

          applyTextOp1(d1, op1);
          applyTextOp2(d2, op2);

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

      it(`should converge after redo: ${op1}-${op2}`, async ({ task }) => {
        type TestDoc = { t: Text };
        await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
          d1.update((root) => {
            root.t = new Text();
            root.t.edit(0, 0, 'The fox jumped.');
          }, 'init');
          await c1.sync();
          await c2.sync();

          applyTextOp1(d1, op1);
          applyTextOp2(d2, op2);

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
describe('Text History - reconcile cases', () => {
  it('Case 1 (left): remote edit LEFT of undo should shift position', async ({
    task,
  }) => {
    type TestDoc = { t: Text };
    await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Text();
        root.t.edit(0, 0, '0123456789');
      }, 'init');
      await c1.sync();
      await c2.sync();

      // d1: delete [6,8), d2: insert at 2 (left of d1)
      d1.update((root) => root.t.edit(6, 8, ''), 'd1 delete');
      d2.update((root) => root.t.edit(2, 2, 'XX'), 'd2 insert left');

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
    type TestDoc = { t: Text };
    await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Text();
        root.t.edit(0, 0, '0123456789');
      }, 'init');
      await c1.sync();
      await c2.sync();

      // d1: delete [2,4), d2: insert at 8 (right of d1)
      d1.update((root) => root.t.edit(2, 4, ''), 'd1 delete');
      d2.update((root) => root.t.edit(8, 8, 'YY'), 'd2 insert right');

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

  it('Case 3 (contained_by): undo range contained by remote should collapse', async ({
    task,
  }) => {
    type TestDoc = { t: Text };
    await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Text();
        root.t.edit(0, 0, '0123456789');
      }, 'init');
      await c1.sync();
      await c2.sync();

      // d1: delete [4,6), d2: delete [2,8) (contains d1's range)
      d1.update((root) => root.t.edit(4, 6, ''), 'd1 delete');
      d2.update((root) => root.t.edit(2, 8, ''), 'd2 delete larger');

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

  it('Case 4 (contains): remote range contained by undo should adjust', async ({
    task,
  }) => {
    type TestDoc = { t: Text };
    await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Text();
        root.t.edit(0, 0, '0123456789');
      }, 'init');
      await c1.sync();
      await c2.sync();

      // d1: delete [2,8), d2: insert at 5 (inside d1's range)
      d1.update((root) => root.t.edit(2, 8, ''), 'd1 delete large');
      d2.update((root) => root.t.edit(5, 5, 'ZZ'), 'd2 insert inside');

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

  it('Case 5 (overlap_start): remote overlaps start of undo range', async ({
    task,
  }) => {
    type TestDoc = { t: Text };
    await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Text();
        root.t.edit(0, 0, '0123456789');
      }, 'init');
      await c1.sync();
      await c2.sync();

      // d1: delete [4,8), d2: delete [2,6) (overlaps start)
      d1.update((root) => root.t.edit(4, 8, ''), 'd1 delete');
      d2.update((root) => root.t.edit(2, 6, ''), 'd2 overlap start');

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

  it('Case 6 (overlap_end): remote overlaps end of undo range', async ({
    task,
  }) => {
    type TestDoc = { t: Text };
    await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Text();
        root.t.edit(0, 0, '0123456789');
      }, 'init');
      await c1.sync();
      await c2.sync();

      // d1: delete [2,6), d2: delete [4,8) (overlaps end)
      d1.update((root) => root.t.edit(2, 6, ''), 'd1 delete');
      d2.update((root) => root.t.edit(4, 8, ''), 'd2 overlap end');

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
    type TestDoc = { t: Text };
    await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Text();
        root.t.edit(0, 0, '0123456789');
      }, 'init');
      await c1.sync();
      await c2.sync();

      // d1: delete [4,6), d2: insert at 6 (adjacent)
      d1.update((root) => root.t.edit(4, 6, ''), 'd1 delete');
      d2.update((root) => root.t.edit(6, 6, 'AA'), 'd2 insert adjacent');

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

describe('Text History - multi client edge cases', () => {
  it('should converge with same position concurrent edits', async function ({
    task,
  }) {
    type TestDoc = { t: Text };
    await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Text();
        root.t.edit(0, 0, 'ABCD');
      }, 'init');
      await c1.sync();
      await c2.sync();

      // Both insert at position 2
      d1.update((root) => root.t.edit(2, 2, 'X'), 'd1 insert');
      d2.update((root) => root.t.edit(2, 2, 'Y'), 'd2 insert');

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

  it('should converge with concurrent full deletion and insertion', async ({
    task,
  }) => {
    type TestDoc = { t: Text };
    await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Text();
        root.t.edit(0, 0, 'ABCD');
      }, 'init');
      await c1.sync();
      await c2.sync();

      d1.update((root) => root.t.edit(0, 4, ''), 'd1 delete all');
      d2.update((root) => root.t.edit(0, 0, 'XY'), 'd2 insert');

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

  it('should converge when one client undos and other redos', async ({
    task,
  }) => {
    type TestDoc = { t: Text };
    await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Text();
        root.t.edit(0, 0, 'ABCDEFGH');
      }, 'init');
      await c1.sync();
      await c2.sync();

      d1.update((root) => root.t.edit(2, 4, 'XX'), 'd1 edit');
      d2.update((root) => root.t.edit(6, 8, 'YY'), 'd2 edit');

      await c1.sync();
      await c2.sync();
      await c1.sync();

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

  it('should converge with concurrent style operations', async ({ task }) => {
    type TestDoc = { t: Text };
    await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.t = new Text();
        root.t.edit(0, 0, 'The fox jumped.');
      }, 'init');
      await c1.sync();
      await c2.sync();

      d1.update((root) => root.t.setStyle(0, 15, { bold: true }), 'bold');
      d2.update((root) => root.t.setStyle(4, 15, { italic: true }), 'italic');

      await c1.sync();
      await c2.sync();
      await c1.sync();

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
