import { Document, JSONArray } from '@yorkie-js-sdk/src/yorkie';
import { MaxTimeTicket } from '@yorkie-js-sdk/src/document/time/ticket';
import { InitialCheckpoint } from '@yorkie-js-sdk/src/document/change/checkpoint';
import { DocumentStatus } from '@yorkie-js-sdk/src/document/document';
import { describe, bench, assert } from 'vitest';

const benchmarkObject = (size: number) => {
  const doc = new Document<{ k1: number }>('test-doc');

  doc.update((root) => {
    for (let i = 0; i < size; i++) {
      root.k1 = i;
    }
  });
};

const benchmarkArray = (size: number) => {
  const doc = new Document<{ k1: JSONArray<number> }>('test-doc');

  doc.update((root) => {
    root.k1 = [];

    for (let i = 0; i < size; i++) {
      root.k1.push(i);
    }
  });
};

const benchmarkArrayGC = (size: number) => {
  const doc = new Document<{ k1?: JSONArray<number> }>('test-doc');

  doc.update((root) => {
    root.k1 = [];

    for (let i = 0; i < size; i++) {
      root.k1.push(i);
    }
  });
  doc.update((root) => {
    delete root.k1;
  });

  assert.equal(size + 1, doc.garbageCollect(MaxTimeTicket));
};

describe('Document', () => {
  bench('constructor', () => {
    const doc = new Document<{ text: JSONArray<string> }>(`test-doc`);
    assert.equal('{}', doc.toJSON());
    assert.equal(doc.getCheckpoint(), InitialCheckpoint);
    assert.isFalse(doc.hasLocalChanges());
  });

  bench('status', () => {
    const doc = new Document<{ text: JSONArray<string> }>(`test-doc`);
    assert.equal(doc.getStatus(), DocumentStatus.Detached);
    doc.applyStatus(DocumentStatus.Attached);
    assert.equal(doc.getStatus(), DocumentStatus.Attached);
  });

  bench('equals', () => {
    const doc1 = new Document<{ text: string }>('d1');
    const doc2 = new Document<{ text: string }>('d2');
    const doc3 = new Document<{ text: string }>('d3');
    doc1.update((root) => {
      root.text = 'value';
    }, 'update text');
    assert.notEqual(doc1.toJSON(), doc2.toJSON());
    assert.equal(doc2.toJSON(), doc3.toJSON());
  });

  bench('nested update', () => {
    const expected = `{"k1":"v1","k2":{"k4":"v4"},"k3":["v5","v6"]}`;
    const doc = new Document<{
      k1: string;
      k2: { k4: string };
      k3: Array<string>;
    }>('test-doc');
    assert.equal('{}', doc.toJSON());
    assert.isFalse(doc.hasLocalChanges());
    doc.update((root) => {
      root.k1 = 'v1';
      root.k2 = { k4: 'v4' };
      root.k3 = ['v5', 'v6'];
    }, 'updates k1,k2,k3');
    assert.equal(expected, doc.toJSON());
    assert.isTrue(doc.hasLocalChanges());
  });

  bench('delete', () => {
    const doc = new Document<{
      k1?: string;
      k2?: { k4: string };
      k3?: Array<string>;
    }>('test-doc');
    assert.equal('{}', doc.toJSON());
    assert.isFalse(doc.hasLocalChanges());
    let expected = `{"k1":"v1","k2":{"k4":"v4"},"k3":["v5","v6"]}`;
    doc.update((root) => {
      root.k1 = 'v1';
      root.k2 = { k4: 'v4' };
      root.k3 = ['v5', 'v6'];
    }, 'updates k1,k2,k3');
    assert.equal(expected, doc.toJSON());
    expected = `{"k1":"v1","k3":["v5","v6"]}`;
    doc.update((root) => {
      delete root.k2;
    }, 'deletes k2');
    assert.equal(expected, doc.toJSON());
  });

  bench('object', () => {
    const doc = new Document<{ k1: string }>('test-doc');
    doc.update((root) => {
      root.k1 = 'v1';
      root.k1 = 'v2';
    });
    assert.equal(`{"k1":"v2"}`, doc.toJSON());
  });

  bench('array', () => {
    const doc = new Document<{ k1: JSONArray<number> }>('test-doc');

    doc.update((root) => {
      root.k1 = [];
      root.k1.push(1);
      root.k1.push(2);
      root.k1.push(3);

      assert.equal('{"k1":[1,2,3]}', root.toJSON!());
      assert.equal(root.k1.length, 3);
      assert.equal(
        '[1:000000000000000000000000:2:1][1:000000000000000000000000:3:2][1:000000000000000000000000:4:3]',
        root.k1.toTestString!(),
      );

      root.k1.splice(1, 1);
      assert.equal('{"k1":[1,3]}', root.toJSON!());
      assert.equal(root.k1.length, 2);
      assert.equal(
        '[1:000000000000000000000000:2:1]{1:000000000000000000000000:3:2}[1:000000000000000000000000:4:3]',
        root.k1.toTestString!(),
      );

      const first = root.k1.getElementByIndex!(0);
      root.k1.insertAfter!(first.getID!(), 2);
      assert.equal('{"k1":[1,2,3]}', root.toJSON!());
      assert.equal(root.k1.length, 3);
      assert.equal(
        '[1:000000000000000000000000:2:1][1:000000000000000000000000:6:2]{1:000000000000000000000000:3:2}[1:000000000000000000000000:4:3]',
        root.k1.toTestString!(),
      );

      const third = root.k1.getElementByIndex!(2);
      root.k1.insertAfter!(third.getID!(), 4);
      assert.equal('{"k1":[1,2,3,4]}', root.toJSON!());
      assert.equal(root.k1.length, 4);
      assert.equal(
        '[1:000000000000000000000000:2:1][1:000000000000000000000000:6:2]{1:000000000000000000000000:3:2}[1:000000000000000000000000:4:3][1:000000000000000000000000:7:4]',
        root.k1.toTestString!(),
      );

      for (let i = 0; i < root.k1.length; i++) {
        assert.equal(i + 1, root.k1[i]);
      }
    });
  });

  bench('array 1000', () => {
    benchmarkArray(1000);
  });

  bench('array 10000', () => {
    benchmarkArray(10000);
  });

  bench('array GC 1000', () => {
    benchmarkArrayGC(1000);
  });

  bench('array GC 10000', () => {
    benchmarkArrayGC(10000);
  });

  bench('object 1000', () => {
    benchmarkObject(1000);
  });

  bench('object 10000', () => {
    benchmarkObject(10000);
  });
});
