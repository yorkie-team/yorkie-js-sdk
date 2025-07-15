import { describe, it, assert } from 'vitest';
import { Document } from '@yorkie-js/sdk/src/document/document';
import { JSONArray } from '@yorkie-js/sdk/src/yorkie';

type Op = 'add' | 'move' | 'remove' | 'set';
const ops: Op[] = ['add', 'remove', 'move'];
const opM: Op[] = ['move'];
const opI: Op[] = ['add'];
const opR: Op[] = ['remove'];

function applyOp(doc: Document<{ list: JSONArray<string> }>, op: Op) {
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

          const S: string[] = [];
          S.push(doc.toSortedJSON());

          applyOp(doc, op1); S.push(doc.toSortedJSON());
          console.log(`S3: ${S[1]}`)
          applyOp(doc, op2); S.push(doc.toSortedJSON());
          console.log(`S3: ${S[2]}`)
          applyOp(doc, op3); S.push(doc.toSortedJSON());
          console.log(`S3: ${S[3]}`)

          console.log(doc.history);

          for (let i = 3; i >= 1; i--) {
            doc.history.undo();
            const back = doc.toSortedJSON();
            console.log(`rS${i-1}: ${back}`)
            assert.equal(back, S[i - 1], `undo back to S${i - 1} failed on ${caseName}`);
          }
        });
      }
    }
  }
});
