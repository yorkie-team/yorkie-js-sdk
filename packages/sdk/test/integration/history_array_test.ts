import { describe, it, assert } from 'vitest';
import { Document } from '@yorkie-js/sdk/src/document/document';
import { JSONArray } from '@yorkie-js/sdk/src/yorkie';
import { withTwoClientsAndDocuments } from '@yorkie-js/sdk/test/integration/integration_helper';

type Op = 'add' | 'move' | 'remove' | 'set';
const ops: Array<Op> = ['add', 'remove', 'remove'];

function applyOp1(doc: Document<{ list: JSONArray<string> }>, op: Op) {
  doc.update((root) => {
    const list = root.list;

    switch (op) {
      case 'add': {
        const prev = list.getElementByIndex?.(0);
        if (!prev) return;
        list.insertAfter!(prev.getID!(), String('insV'));
        break;
      }
      case 'move': {
        if (list.length < 2) return;
        const from = list.getElementByIndex!(0);
        const to = list.getElementByIndex!(2);
        list.moveAfter!(to.getID!(), from.getID!());
        break;
      }
      case 'remove': {
        if (list.length > 0) delete list[0];
        break;
      }
    }
  }, op);
}

function applyOp2(doc: Document<{ list: JSONArray<string> }>, op: Op) {
  doc.update((root) => {
    const list = root.list;

    switch (op) {
      case 'add': {
        const prev = list.getElementByIndex?.(2);
        if (!prev) return;
        list.insertAfter!(prev.getID!(), String('insV'));
        break;
      }
      case 'move': {
        if (list.length < 2) return;
        const from = list.getElementByIndex!(1);
        const to = list.getElementByIndex!(3);
        list.moveAfter!(to.getID!(), from.getID!());
        break;
      }
      case 'remove': {
        if (list.length > 1) delete list[1];
        break;
      }
    }
  }, op);
}

describe('Array Undo Operations', () => {
  for (const op1 of ops) {
    for (const op2 of ops) {
      for (const op3 of ops) {
        const caseName = `${op1}-${op2}-${op3}`;
        it(`should return to each state correctly: ${caseName}`, () => {
          const doc = new Document<{ list: JSONArray<string> }>('test-doc');

          doc.update((root) => {
            root.list = ['a', 'b', 'c', 'd', 'e'];
          }, 'init');

          const S: Array<string> = [];
          S.push(doc.toSortedJSON());

          applyOp1(doc, op1);
          S.push(doc.toSortedJSON());
          console.log(`S1: ${S[1]}`);
          applyOp1(doc, op2);
          S.push(doc.toSortedJSON());
          console.log(`S2: ${S[2]}`);
          applyOp1(doc, op3);
          S.push(doc.toSortedJSON());
          console.log(`S3: ${S[3]}`);

          for (let i = 3; i >= 1; i--) {
            doc.history.undo();
            const back = doc.toSortedJSON();
            console.log(`rS${i - 1}: ${back}`);
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

describe('Array Undo in Multi-Client', () => {
  for (const op1 of ops) {
    for (const op2 of ops) {
      const caseName = `${op1}-${op2}`;

      it(`should handle individual undo operation correctly in multi user environment: ${caseName}`, async function ({
        task,
      }) {
        type TestDoc = { list: JSONArray<string> };
        await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
          // Initial setup
          d1.update((root) => {
            root.list = ['a', 'b', 'c', 'd', 'e'];
          }, 'init');
          await c1.sync();
          await c2.sync();
          assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

          applyOp1(d1, op1);
          applyOp2(d2, op2);

          await c1.sync();
          await c2.sync();
          await c1.sync();

          assert.equal(
            d1.toSortedJSON(),
            d2.toSortedJSON(),
            'Mismatch after both ops',
          );

          // Undo
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
