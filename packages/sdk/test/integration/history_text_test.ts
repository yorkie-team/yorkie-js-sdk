import { describe, it, assert } from 'vitest';
import { Document, Text } from '@yorkie-js/sdk/src/yorkie';
import { withTwoClientsAndDocuments } from '@yorkie-js/sdk/test/integration/integration_helper';

type TextOp = 'insert' | 'delete' | 'replace' | 'style';
const ops: Array<TextOp> = ['insert', 'delete', 'replace'];

/**
 * 단일 클라이언트용: root.t에 op1 세트를 적용
 * 문서는 항상 초기 콘텐츠를 충분히 갖도록 설정해서 인덱스 안전하게 씁니다.
 */
function applyTextOp1(doc: Document<{ t: Text }>, op: TextOp) {
  doc.update((root) => {
    const t = root.t;

    switch (op) {
      case 'insert': {
        // 끝에 삽입
        const len = t.length ?? t.toString().length;
        t.edit(len, len, 'X');
        break;
      }
      case 'delete': {
        // 중간 한 글자 삭제 (가능하면)
        const len = t.length ?? t.toString().length;
        if (len >= 3) {
          t.edit(1, 2, ''); // [1,2) 삭제
        } else if (len > 0) {
          t.edit(0, 1, '');
        }
        break;
      }
      case 'replace': {
        // [1,3) → '12' 로 치환 (가능하면)
        const len = t.length ?? t.toString().length;
        if (len >= 3) {
          t.edit(1, 3, '12');
        } else {
          // 길이가 짧으면 앞에서 가능한 범위를 치환
          const to = Math.min(1, len);
          t.edit(0, to, 'R');
        }
        break;
      }
      case 'style': {
        // 전체 또는 가능한 범위에 스타일 부여
        const len = t.length ?? t.toString().length;
        if (len === 0) {
          t.edit(0, 0, 'A');
        }
        const end = t.length ?? t.toString().length;
        t.setStyle(0, end, { bold: true } as any);
        break;
      }
    }
  }, op);
}

/**
 * 두 번째 클라이언트용: op2 세트를 적용
 * 인덱스를 다르게 잡아서 충돌/병합 시나리오를 만들어봄.
 */
function applyTextOp2(doc: Document<{ t: Text }>, op: TextOp) {
  doc.update((root) => {
    const t = root.t;

    switch (op) {
      case 'insert': {
        // 앞쪽에 삽입
        t.edit(0, 0, 'Q');
        break;
      }
      case 'delete': {
        // 뒤쪽 한 글자 삭제 (가능하면)
        const len = t.length ?? t.toString().length;
        if (len > 0) t.edit(len - 1, len, '');
        break;
      }
      case 'replace': {
        // [0,1) → 'Z' 로 치환 (가능하면)
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
      // 초기화
      doc.update((root) => {
        root.t = new Text();
        root.t.edit(0, 0, 'The fox jumped.');
      }, 'init');

      // op 적용 후 undo
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

describe('Text Undo - chained ops', () => {
  // 텍스트 내용만 읽는 헬퍼
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

          // S3 -> S2 -> S1 -> S0 순으로 되돌아가는지 확인
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
          // 초기 동기화
          d1.update((root) => {
            root.t = new Text();
            root.t.edit(0, 0, 'The fox jumped.');
          }, 'init');
          await c1.sync();
          await c2.sync();
          assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

          // 각자 op 적용
          applyTextOp1(d1, op1);
          applyTextOp2(d2, op2);

          // 수렴 확인
          await c1.sync();
          await c2.sync();
          await c1.sync();
          assert.equal(
            d1.toSortedJSON(),
            d2.toSortedJSON(),
            'Mismatch after both ops',
          );

          // 둘 다 undo
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
});
