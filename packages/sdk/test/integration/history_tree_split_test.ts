import { describe, it, assert, expect } from 'vitest';
import yorkie, { Document, Tree } from '@yorkie-js/sdk/src/yorkie';
import { withTwoClientsAndDocuments } from '@yorkie-js/sdk/test/integration/integration_helper';
import { TreeEditOperation } from '@yorkie-js/sdk/src/document/operation/tree_edit_operation';
import { traverseAll } from '@yorkie-js/sdk/src/util/index_tree';
import type { Operation } from '@yorkie-js/sdk/src/document/operation/operation';

/**
 * Split- and merge-related Tree History tests.
 *
 * Includes table-driven coverage for `Tree.Edit` with `splitLevel=1`
 * and `splitLevel=2`, multi-client convergence cases, and a regression
 * suite for `cloneAndDropPreTombstoned` (the reverseOp builder that
 * filters descendants tombstoned before the current edit).
 */

const xmlOf = (doc: Document<{ t: Tree }>) => doc.getRoot().t.toXML();

function topRedoTreeEdit(
  doc: Document<{ t: Tree }>,
): TreeEditOperation | undefined {
  const stack = doc.getRedoStackForTest() as Array<Array<unknown>>;
  if (stack.length === 0) return undefined;
  const top = stack[stack.length - 1];
  for (let i = top.length - 1; i >= 0; i--) {
    const op = top[i];
    if (op instanceof TreeEditOperation) return op;
  }
  return undefined;
}
function summarizeOp(op: Operation | undefined): string {
  if (!(op instanceof TreeEditOperation)) return '<not-tree-edit>';
  const contents = op.getContents();
  if (!contents || contents.length === 0) return '(empty)';
  const parts: Array<string> = [];
  for (const root of contents) {
    traverseAll(root, (n) => {
      const created = n.id.getCreatedAt();
      const id = `L${created.getLamport()}/${created.getDelimiter()}`;
      const removed = n.removedAt ? `(R@L${n.removedAt.getLamport()})` : '';
      const val = n.isText ? `:"${n.value}"` : '';
      parts.push(`${n.type}${val}@${id}${removed}`);
    });
  }
  return `[${parts.length}] ${parts.join(' | ')}`;
}
function initDoc(): Document<{ t: Tree }> {
  const doc = new Document<{ t: Tree }>('split-repro');
  doc.update((root) => {
    root.t = new Tree({
      type: 'doc',
      children: [
        {
          type: 'p',
          children: [{ type: 'inline', children: [] }],
        },
      ],
    });
  }, 'init');
  return doc;
}
function insertSiblingBlock(doc: Document<{ t: Tree }>) {
  doc.update((root) => {
    root.t.editByPath([1], [1], {
      type: 'p',
      children: [{ type: 'inline', children: [] }],
    });
  }, 'insert-block');
}
// Insert one character at the end of the second <p>'s inline. Indices
// are computed from the visible XML so this works regardless of
// whether the inline also carries tombstoned children.
function typeInSecondBlock(doc: Document<{ t: Tree }>, ch: string) {
  doc.update((root) => {
    const xml = root.t.toXML();
    const m = xml.match(/<inline>([^<]*)<\/inline><\/p><\/doc>$/);
    const cur = m ? m[1].length : 0;
    root.t.editByPath([1, 0, cur], [1, 0, cur], {
      type: 'text',
      value: ch,
    });
  }, `type-${ch}`);
}

// 4. Single Client - Split/Merge
describe('Tree History - single client split/merge', () => {
  it('should undo editByPath split', () => {
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

    const before = xmlOf(doc);
    assert.equal(before, '<doc><p>ABCD</p></doc>');

    doc.update((root) => {
      root.t.editByPath([0, 2], [0, 2], undefined, 1);
    }, 'split');
    const after = xmlOf(doc);
    assert.equal(after, '<doc><p>AB</p><p>CD</p></doc>');

    doc.history.undo();
    assert.equal(xmlOf(doc), before);
  });

  it('should redo editByPath split', () => {
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

    const before = xmlOf(doc);
    doc.update((root) => {
      root.t.editByPath([0, 2], [0, 2], undefined, 1);
    }, 'split');
    const after = xmlOf(doc);

    doc.history.undo();
    assert.equal(xmlOf(doc), before);

    doc.history.redo();
    assert.equal(xmlOf(doc), after);
  });

  it('should undo editByPath merge', () => {
    const doc = new Document<{ t: Tree }>('test-doc');
    doc.update((root) => {
      root.t = new Tree({
        type: 'doc',
        children: [
          { type: 'p', children: [{ type: 'text', value: 'AB' }] },
          { type: 'p', children: [{ type: 'text', value: 'CD' }] },
        ],
      });
    }, 'init');

    const before = xmlOf(doc);
    assert.equal(before, '<doc><p>AB</p><p>CD</p></doc>');

    doc.update((root) => {
      root.t.editByPath([0, 2], [1, 0]);
    }, 'merge');
    const after = xmlOf(doc);
    assert.equal(after, '<doc><p>ABCD</p></doc>');

    doc.history.undo();
    assert.equal(xmlOf(doc), before);
  });

  it('should redo editByPath merge', () => {
    const doc = new Document<{ t: Tree }>('test-doc');
    doc.update((root) => {
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

    const before = xmlOf(doc);
    doc.update((root) => {
      root.t.editByPath([0, 2], [1, 0]);
    }, 'merge');
    const after = xmlOf(doc);

    doc.history.undo();
    assert.equal(xmlOf(doc), before);

    doc.history.redo();
    assert.equal(xmlOf(doc), after);
  });
});

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

// 4c. Single Client - Split chained with other ops (table-driven)
describe('Tree History - single client split L1 chained ops', () => {
  type SplitChainOp = 'split' | 'insert-text' | 'delete-text';
  const chainOps: Array<SplitChainOp> = ['split', 'insert-text', 'delete-text'];

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
              root.t.edit(1, 1, { type: 'text', value: 'X' });
              break;
            case 'after-split':
              root.t.edit(5, 5, { type: 'text', value: 'X' });
              break;
            case 'different-element':
              root.t.edit(7, 7, { type: 'text', value: 'X' });
              break;
          }
          break;
        case 'delete-text':
          switch (pos) {
            case 'before-split':
              root.t.edit(1, 2);
              break;
            case 'after-split':
              root.t.edit(4, 5);
              break;
            case 'different-element':
              root.t.edit(7, 8);
              break;
          }
          break;
        case 'insert-element':
          switch (pos) {
            case 'before-split':
              root.t.edit(0, 0, {
                type: 'p',
                children: [{ type: 'text', value: 'NEW' }],
              });
              break;
            case 'after-split':
              root.t.edit(6, 6, {
                type: 'p',
                children: [{ type: 'text', value: 'NEW' }],
              });
              break;
            case 'different-element':
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
        await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
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
        }, task.name);
      });
    }
  }
});

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

  it('should handle undo after concurrent parent deletion (L1)', async ({
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
            {
              type: 'p',
              children: [{ type: 'text', value: 'EFGH' }],
            },
          ],
        });
      }, 'init');
      await c1.sync();
      await c2.sync();

      // d1: split first <p> at middle
      d1.update((root) => {
        root.t.edit(3, 3, undefined, 1);
      }, 'split');

      // d2: delete the first <p> entirely
      d2.update((root) => {
        root.t.edit(0, 6);
      }, 'delete parent');

      await c1.sync();
      await c2.sync();
      await c1.sync();

      // d1: undo the split — parent is deleted, should be no-op
      d1.history.undo();

      await c1.sync();
      await c2.sync();
      await c1.sync();

      assert.equal(
        d1.getRoot().t.toXML(),
        d2.getRoot().t.toXML(),
        'divergence after undo with concurrent parent deletion (L1)',
      );
    }, task.name);
  });
});

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
      // TODO(#1235): split-l2 → split-l2 undo chain has a known undo bug:
      // the boundary-deletion reverse op doesn't correctly restore the state
      // when two consecutive L2 splits produce tombstoned structure.
      const skipCase = op1 === 'split-l2' && op2 === 'split-l2';
      const runIt = skipCase ? it.skip : it;
      runIt(`should undo chain: ${op1} → ${op2}`, () => {
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
  // Index layout:
  // <doc>  <div>  <p>  A  B  C  D  </p>  </div>  <div>  <p>  E  F  G  H  </p>  </div>
  //   0      1     2   3  4  5  6    7      8       9     10  11 12 13 14   15     16
  //
  // d1 splits first <div><p> at middle (after B) with splitLevel=2:
  //   <doc><div><p>AB</p></div><div><p>CD</p></div><div><p>EFGH</p></div></doc>
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
              root.t.edit(3, 3, { type: 'text', value: 'X' });
              break;
            case 'after-split':
              root.t.edit(6, 6, { type: 'text', value: 'X' });
              break;
            case 'different-element':
              root.t.edit(11, 11, { type: 'text', value: 'X' });
              break;
          }
          break;
        case 'delete-text':
          switch (pos) {
            case 'before-split':
              root.t.edit(2, 3);
              break;
            case 'after-split':
              root.t.edit(5, 6);
              break;
            case 'different-element':
              root.t.edit(10, 11);
              break;
          }
          break;
        case 'insert-element':
          switch (pos) {
            case 'before-split':
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
      it(`should converge: split L2 + remote ${remoteOp} at ${remotePos}`, async ({
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

          // d1: split first <div><p> at middle (between B and C)
          d1.update((root) => {
            root.t.edit(4, 4, undefined, 2);
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
            `divergence: split L2 + ${remoteOp} at ${remotePos}`,
          );
        }, task.name);
      });
    }
  }

  for (const remoteOp of remoteOps) {
    for (const remotePos of remotePositions) {
      it(`should converge after redo: split L2 + remote ${remoteOp} at ${remotePos}`, async ({
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

          // d1: split first <div><p> at middle (between B and C)
          d1.update((root) => {
            root.t.edit(4, 4, undefined, 2);
          }, 'split');

          // d2: remote operation
          applyRemoteOp(d2, remoteOp, remotePos);

          // Sync both directions
          await c1.sync();
          await c2.sync();
          await c1.sync();

          // d1: undo then redo
          d1.history.undo();
          await c1.sync();
          await c2.sync();
          await c1.sync();

          d1.history.redo();
          await c1.sync();
          await c2.sync();
          await c1.sync();

          // Assert convergence after redo
          assert.equal(
            d1.getRoot().t.toXML(),
            d2.getRoot().t.toXML(),
            `redo divergence: split L2 + ${remoteOp} at ${remotePos}`,
          );
        }, task.name);
      });
    }
  }
});

// 4i. Multi Client - Split L2 edge cases
describe('Tree History - multi client split L2 edge cases', () => {
  it('should converge: undo L2 front split with remote insert', async ({
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
                  children: [{ type: 'text', value: 'AB' }],
                },
              ],
            },
          ],
        });
      }, 'init');
      await c1.sync();
      await c2.sync();

      // d1: front split → <doc><div><p></p></div><div><p>AB</p></div></doc>
      d1.update((root) => {
        root.t.edit(2, 2, undefined, 2);
      }, 'front split');

      // d2: insert text in the same element
      d2.update((root) => {
        root.t.edit(3, 3, { type: 'text', value: 'X' });
      }, 'insert X');

      await c1.sync();
      await c2.sync();
      await c1.sync();

      // d1: undo the front split
      d1.history.undo();

      await c1.sync();
      await c2.sync();
      await c1.sync();

      assert.equal(
        d1.getRoot().t.toXML(),
        d2.getRoot().t.toXML(),
        'divergence: undo front L2 split with remote insert',
      );
    }, task.name);
  });

  it('should converge: undo L2 back split with remote insert', async ({
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
                  children: [{ type: 'text', value: 'AB' }],
                },
              ],
            },
          ],
        });
      }, 'init');
      await c1.sync();
      await c2.sync();

      // d1: back split → <doc><div><p>AB</p></div><div><p></p></div></doc>
      d1.update((root) => {
        root.t.edit(4, 4, undefined, 2);
      }, 'back split');

      // d2: insert text in the same element
      d2.update((root) => {
        root.t.edit(2, 2, { type: 'text', value: 'X' });
      }, 'insert X');

      await c1.sync();
      await c2.sync();
      await c1.sync();

      // d1: undo the back split
      d1.history.undo();

      await c1.sync();
      await c2.sync();
      await c1.sync();

      assert.equal(
        d1.getRoot().t.toXML(),
        d2.getRoot().t.toXML(),
        'divergence: undo back L2 split with remote insert',
      );
    }, task.name);
  });

  it('should handle undo after concurrent parent deletion (L2)', async ({
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

      // d1: split first <div><p> at middle with splitLevel=2
      d1.update((root) => {
        root.t.edit(4, 4, undefined, 2);
      }, 'split');

      // d2: delete the first <div> entirely
      // <div><p>ABCD</p></div> spans index 0-8
      d2.update((root) => {
        root.t.edit(0, 8);
      }, 'delete parent');

      await c1.sync();
      await c2.sync();
      await c1.sync();

      // d1: undo the split — parent is deleted, should be no-op
      d1.history.undo();

      await c1.sync();
      await c2.sync();
      await c1.sync();

      assert.equal(
        d1.getRoot().t.toXML(),
        d2.getRoot().t.toXML(),
        'divergence after undo with concurrent parent deletion (L2)',
      );
    }, task.name);
  });
});

// 5. Single Client - reverseOp pre-tombstoned descendant filtering
describe('Tree History - single client reverseOp pre-tombstoned filter', () => {
  it('should not accumulate reverseOp contents across redo cycles', () => {
    const doc = initDoc();
    insertSiblingBlock(doc);

    const numCycles = 4;
    const redoOpSizes: Array<number> = [];

    for (let cycle = 0; cycle < numCycles; cycle++) {
      // Type "asdf" in the inserted block.
      for (const ch of 'asdf') typeInSecondBlock(doc, ch);

      // Undo each char.
      for (let i = 0; i < 4; i++) doc.history.undo();

      // Undo the block-insert. After this, redoStack's top is the op
      // that the next history.redo() will execute. That op's
      // `contents` is the wire payload observed in production.
      doc.history.undo();

      const redoTop = topRedoTreeEdit(doc);
      let count = 0;
      const contents = redoTop?.getContents() ?? [];
      for (const root of contents) traverseAll(root, () => count++);
      redoOpSizes.push(count);

      process.stdout.write(
        `cycle ${cycle}: redoStack top = ${summarizeOp(redoTop)}\n`,
      );

      // Now actually redo for the next cycle's setup.
      doc.history.redo();
    }

    expect(redoOpSizes).toStrictEqual(Array(numCycles).fill(redoOpSizes[0]));
  });

  it('should produce reverseContents with consistent sizes', () => {
    const doc = initDoc();
    insertSiblingBlock(doc);

    for (const ch of 'asdf') typeInSecondBlock(doc, ch);
    for (let i = 0; i < 4; i++) doc.history.undo();
    doc.history.undo();

    const redoTop = topRedoTreeEdit(doc);
    expect(redoTop).toBeDefined();
    const contents = redoTop!.getContents() ?? [];
    expect(contents.length).toBeGreaterThan(0);

    // For each surviving element node in `reverseContents`, the
    // post-filter `totalSize` must equal the sum of its children's
    // `paddedSize`. Without bottom-up recomputation the deepcopy
    // carries the live tree's stale total, which includes the
    // descendants that were just dropped from `_children`.
    const violations: Array<string> = [];
    for (const root of contents) {
      traverseAll(root, (n) => {
        if (n.isText) return;
        const expected = n._children.reduce(
          (acc, child) => acc + child.paddedSize(),
          0,
        );
        if (n.totalSize !== expected || n.visibleSize !== expected) {
          violations.push(
            `${n.type}: totalSize=${n.totalSize} visibleSize=${n.visibleSize} ` +
              `expected=${expected} (children=${n._children.length})`,
          );
        }
      });
    }
    expect(violations).toStrictEqual([]);
  });

  it('should allow typing at the correct position after redo', () => {
    const doc = initDoc();
    insertSiblingBlock(doc);

    for (const ch of 'asdf') typeInSecondBlock(doc, ch);
    for (let i = 0; i < 4; i++) doc.history.undo();
    doc.history.undo();
    expect(doc.getRoot().t.toXML()).toBe('<doc><p><inline></inline></p></doc>');

    doc.history.redo();
    expect(doc.getRoot().t.toXML()).toBe(
      '<doc><p><inline></inline></p><p><inline></inline></p></doc>',
    );

    typeInSecondBlock(doc, 'x');
    expect(doc.getRoot().t.toXML()).toBe(
      '<doc><p><inline></inline></p><p><inline>x</inline></p></doc>',
    );
  });

  it('should remain stable across three cycles followed by typing', () => {
    const doc = initDoc();
    insertSiblingBlock(doc);

    for (let cycle = 0; cycle < 3; cycle++) {
      for (const ch of 'asdf') typeInSecondBlock(doc, ch);
      for (let i = 0; i < 4; i++) doc.history.undo();
      doc.history.undo();
      doc.history.redo();
      expect(doc.getRoot().t.toXML()).toBe(
        '<doc><p><inline></inline></p><p><inline></inline></p></doc>',
      );
    }

    typeInSecondBlock(doc, 'z');
    expect(doc.getRoot().t.toXML()).toBe(
      '<doc><p><inline></inline></p><p><inline>z</inline></p></doc>',
    );
  });
});

void yorkie;
