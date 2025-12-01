import { describe, it, assert } from 'vitest';
import { Document, Text } from '@yorkie-js/sdk/src/yorkie';

type TextOp = 'insert' | 'delete' | 'replace' | 'style';
const ops: Array<TextOp> = ['insert', 'delete', 'replace'];

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
});

describe.skip('Text Undo - chained ops', () => {
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
