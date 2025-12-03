import { describe, it, assert } from 'vitest';
import { Document, Text } from '@yorkie-js/sdk/src/yorkie';
import { withTwoClientsAndDocuments } from '@yorkie-js/sdk/test/integration/integration_helper';

type TextOp = 'insert' | 'delete' | 'replace' | 'style';
const ops: Array<TextOp> = ['insert', 'delete', 'replace'];
// TODO(JOOHOJANG): We need to add 'style' operation and multi-client test
/**
 * Operation Set 1
 */
function applyTextOp1(doc: Document<{ t: Text }>, op: TextOp) {
  doc.update((root) => {
    const t = root.t;

    switch (op) {
      case 'insert': {
        const len = t.length ?? t.toString().length;
        t.edit(len, len, 'X');
        break;
      }
      case 'delete': {
        const len = t.length ?? t.toString().length;
        if (len >= 3) {
          t.edit(1, 2, ''); // del [1,2)
        } else if (len > 0) {
          t.edit(0, 1, '');
        }
        break;
      }
      case 'replace': {
        // [1,3) → '12'
        const len = t.length ?? t.toString().length;
        if (len >= 3) {
          t.edit(1, 3, '12');
        } else {
          const to = Math.min(1, len);
          t.edit(0, to, 'R');
        }
        break;
      }
      case 'style': {
        const len = t.length ?? t.toString().length;
        if (len === 0) {
          t.edit(0, 0, 'A');
        }
        const end = t.length ?? t.toString().length;
        t.setStyle(0, end, { bold: true });
        break;
      }
    }
  }, op);
}

/**
 * Operation Set 2
 */
function applyTextOp2(doc: Document<{ t: Text }>, op: TextOp) {
  doc.update((root) => {
    const t = root.t;

    switch (op) {
      case 'insert': {
        t.edit(0, 0, 'Q');
        break;
      }
      case 'delete': {
        const len = t.length ?? t.toString().length;
        if (len > 0) t.edit(len - 1, len, '');
        break;
      }
      case 'replace': {
        const len = t.length ?? t.toString().length;
        if (len > 0) t.edit(0, 1, 'Z');
        else t.edit(0, 0, 'Z');
        break;
      }
    }
  }, op);
}

describe('Text Undo - single op', () => {
  for (const op of ['insert', 'delete', 'replace'] as Array<TextOp>) {
    it(`should undo ${op}`, () => {
      const doc = new Document<{ t: Text }>('test-doc');
      // initialize
      doc.update((root) => {
        root.t = new Text();
        root.t.edit(0, 0, 'The fox jumped.');
      }, 'init');

      // undo
      applyTextOp1(doc, op);
      doc.history.undo();

      assert.equal(
        doc.getRoot().t.toString(),
        'The fox jumped.',
        `undo ${op} should restore text content`,
      );
    });
  }

  // TODO(JOOHOJANG): We need to test this after implementing style operation
  it.skip('should undo/redo style op', () => {
    const doc = new Document<{ t: Text }>('test-doc');
    doc.update((root) => {
      root.t = new Text();
      root.t.edit(0, 0, 'The fox jumped.');
    }, 'init');

    const initialJSON = doc.toSortedJSON();
    const styledJSON =
      '{"t":[{"attrs":{"bold":true},"val":"The fox jumped."}]}';

    applyTextOp1(doc, 'style');
    assert.equal(
      doc.toSortedJSON(),
      styledJSON,
      'style op should add formatting',
    );

    doc.history.undo();
    assert.equal(doc.toSortedJSON(), initialJSON, 'undo should drop style');

    doc.history.redo();
    assert.equal(doc.toSortedJSON(), styledJSON, 'redo should reapply style');
  });
});

describe('Text Undo - chained ops', () => {
  // read the text content
  const contentOf = (doc: Document<{ t: Text }>) => doc.getRoot().t.toString();

  for (const op1 of ops) {
    for (const op2 of ops) {
      for (const op3 of ops) {
        const caseName = `${op1}-${op2}-${op3}`;

        it(`should step back correctly: ${caseName}`, () => {
          const doc = new Document<{ t: Text }>('test-doc');

          doc.update((root) => {
            root.t = new Text();
            root.t.edit(0, 0, 'ABCD');
          }, 'init');

          // 텍스트 스냅샷 저장
          const S: Array<string> = [];
          S.push(contentOf(doc)); // S0

          applyTextOp1(doc, op1);
          S.push(contentOf(doc)); // S1

          applyTextOp1(doc, op2);
          S.push(contentOf(doc)); // S2

          applyTextOp1(doc, op3);
          S.push(contentOf(doc)); // S3

          // S3 -> S2 -> S1 -> S0
          for (let i = 3; i >= 1; i--) {
            doc.history.undo();
            const back = contentOf(doc);
            assert.equal(
              back,
              S[i - 1],
              `undo back to S${i - 1} failed on ${caseName}`,
            );
          }
        });
      }
    }
  }
});

describe('Text Undo - multi client', () => {
  for (const op1 of ops) {
    for (const op2 of ops) {
      const caseName = `${op1}-${op2}`;

      it(`should converge after both undo: ${caseName}`, async function ({
        task,
      }) {
        type TestDoc = { t: Text };
        await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
          d1.update((root) => {
            root.t = new Text();
            root.t.edit(0, 0, 'The fox jumped.');
          }, 'init');
          await c1.sync();
          await c2.sync();
          assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

          applyTextOp1(d1, op1);
          applyTextOp2(d2, op2);

          await c1.sync();
          await c2.sync();
          await c1.sync();
          assert.equal(
            d1.toSortedJSON(),
            d2.toSortedJSON(),
            'Mismatch after both ops',
          );

          d1.history.undo();
          d2.history.undo();

          await c1.sync();
          await c2.sync();
          await c1.sync();

          assert.equal(
            d1.toSortedJSON(),
            d2.toSortedJSON(),
            'Mismatch after both undos',
          );
        }, task.name);
      });
    }
  }

  // TODO(JOOHOJANG): We need to test this after implementing style operation
  it.skip('should keep convergence when both clients style/undo/redo', async function ({
    task,
  }) {
    type TestDoc = { t: Text };
    await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
      const initialSetup = () => {
        d1.update((root) => {
          root.t = new Text();
          root.t.edit(0, 0, 'The fox jumped.');
        }, 'init');
      };

      initialSetup();
      await c1.sync();
      await c2.sync();
      const initialJSON = '{"t":[{"val":"The fox jumped."}]}';
      assert.equal(d1.toSortedJSON(), initialJSON);
      assert.equal(d2.toSortedJSON(), initialJSON);

      d1.update((root) => {
        root.t.setStyle(0, 15, { bold: true });
      }, 'style bold by c1');
      d2.update((root) => {
        root.t.setStyle(4, 15, { italic: true });
      }, 'style italic by c2');

      await c1.sync();
      await c2.sync();
      await c1.sync();

      const styledJSON =
        '{"t":[{"attrs":{"bold":true},"val":"The "},{"attrs":{"bold":true,"italic":true},"val":"fox jumped."}]}';
      assert.equal(d1.toSortedJSON(), styledJSON, 'Mismatch after style ops');
      assert.equal(d2.toSortedJSON(), styledJSON, 'Mismatch after style ops');

      d1.history.undo();
      d2.history.undo();

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), initialJSON, 'Mismatch after style undo');
      assert.equal(d2.toSortedJSON(), initialJSON, 'Mismatch after style undo');

      d1.history.redo();
      d2.history.redo();

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), styledJSON, 'Mismatch after style redo');
      assert.equal(d2.toSortedJSON(), styledJSON, 'Mismatch after style redo');
    }, task.name);
  });
});
