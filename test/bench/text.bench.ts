import { Document, Text } from '@yorkie-js-sdk/src/yorkie';
import { MaxTimeTicket } from '@yorkie-js-sdk/src/document/time/ticket';
import { assert, bench, describe } from 'vitest';

const benchmarkTextEditGC = (size: number) => {
  const doc = new Document<{ text: Text }>('test-doc');
  assert.equal('{}', doc.toJSON());
  // 01. initial
  doc.update((root) => {
    root.text = new Text();
    const { text } = root;
    for (let i = 0; i < size; i++) {
      text.edit(i, i, 'a');
    }
  }, 'initial');
  // 02. 100 nodes modified
  doc.update((root) => {
    const { text } = root;
    for (let i = 0; i < size; i++) {
      text.edit(i, i + 1, 'b');
    }
  }, `modify ${size} nodes`);
  // 03. GC
  assert.equal(size, doc.getGarbageLen());
  assert.equal(size, doc.garbageCollect(MaxTimeTicket));
  const empty = 0;
  assert.equal(empty, doc.getGarbageLen());
};
const benchmarkTextSplitGC = (size: number) => {
  const doc = new Document<{ text: Text }>('test-doc');
  assert.equal('{}', doc.toJSON());

  // 01. initial
  const string = 'a'.repeat(size);
  doc.update((root) => {
    root.text = new Text();

    root.text.edit(0, 0, string);
  }, 'initial');
  // 02. 100 nodes modified
  doc.update((root) => {
    for (let i = 0; i < size; i++) {
      root.text.edit(i, i + 1, 'b');
    }
  }, 'Modify one node multiple times');
  // 03. GC
  assert.equal(size, doc.getGarbageLen());
  assert.equal(size, doc.garbageCollect(MaxTimeTicket));
  const empty = 0;
  assert.equal(empty, doc.getGarbageLen());
};
const benchmarkTextDeleteAll = (size: number) => {
  const doc = new Document<{ text: Text }>('test-doc');
  doc.update((root) => {
    root.text = new Text();
  }, 'initialize');
  // 01. inserts many chracters
  for (let i = 0; i < size; i++) {
    doc.update((root) => {
      root.text.edit(i, i, 'a');
    }, 'insert chracter');
  }
  // 02. deletes them
  doc.update((root) => {
    root.text.edit(0, size, '');
  }, 'delete them');
  assert.equal(doc.getRoot().text.toString(), '');
};
const benchmarkText = (size: number) => {
  const doc = new Document<{ text: Text }>('test-doc');

  doc.update((root) => {
    root.text = new Text();

    for (let i = 0; i < size; i++) {
      root.text.edit(i, i, 'a');
    }
  });
};

describe('Text', () => {
  bench('text', () => {
    const doc = new Document<{ k1: Text }>('test-doc');
    doc.update((root) => {
      root.k1 = new Text();
      root.k1.edit(0, 0, 'ABCD');
      root.k1.edit(1, 3, '12');
    });
    assert.equal(`{"k1":[{"val":"A"},{"val":"12"},{"val":"D"}]}`, doc.toJSON());
    assert.equal(
      `[0:00:0:0 ][1:00:2:0 A][1:00:3:0 12]{1:00:2:1 BC}[1:00:2:3 D]`,
      doc.getRoot().k1.toTestString(),
    );
    doc.update((root) => {
      const [pos1] = root.k1.createRangeForTest(0, 0);
      assert.equal('0:00:0:0:0', pos1.toTestString());
      const [pos2] = root.k1.createRangeForTest(1, 1);
      assert.equal('1:00:2:0:1', pos2.toTestString());
      const [pos3] = root.k1.createRangeForTest(2, 2);
      assert.equal('1:00:3:0:1', pos3.toTestString());
      const [pos4] = root.k1.createRangeForTest(3, 3);
      assert.equal('1:00:3:0:2', pos4.toTestString());
      const [pos5] = root.k1.createRangeForTest(4, 4);
      assert.equal('1:00:2:3:1', pos5.toTestString());
    });
  });

  bench('text composition', () => {
    const doc = new Document<{ k1: Text }>('test-doc');
    doc.update((root) => {
      root.k1 = new Text();
      root.k1.edit(0, 0, 'ㅎ');
      root.k1.edit(0, 1, '하');
      root.k1.edit(0, 1, '한');
      root.k1.edit(0, 1, '하');
      root.k1.edit(1, 1, '느');
      root.k1.edit(1, 2, '늘');
    });
    assert.equal(`{"k1":[{"val":"하"},{"val":"늘"}]}`, doc.toJSON());
  });

  bench('rich text', () => {
    const doc = new Document<{ k1: Text }>('test-doc');
    doc.update((root) => {
      root.k1 = new Text();
      root.k1.edit(0, 0, 'Hello world');
      assert.equal('[0:00:0:0 ][1:00:2:0 Hello world]', root.k1.toTestString());
    });
    assert.equal('{"k1":[{"val":"Hello world"}]}', doc.toJSON());
    doc.update((root) => {
      root.k1.setStyle(0, 5, { b: '1' });
      assert.equal(
        '[0:00:0:0 ][1:00:2:0 Hello][1:00:2:5  world]',
        root.k1.toTestString(),
      );
    });
    assert.equal(
      '{"k1":[{"attrs":{"b":"1"},"val":"Hello"},{"val":" world"}]}',
      doc.toJSON(),
    );
    doc.update((root) => {
      root.k1.setStyle(0, 5, { b: '1' });
      assert.equal(
        '[0:00:0:0 ][1:00:2:0 Hello][1:00:2:5  world]',
        root.k1.toTestString(),
      );
      root.k1.setStyle(3, 5, { i: '1' });
      assert.equal(
        '[0:00:0:0 ][1:00:2:0 Hel][1:00:2:3 lo][1:00:2:5  world]',
        root.k1.toTestString(),
      );
    });
    assert.equal(
      '{"k1":[{"attrs":{"b":"1"},"val":"Hel"},{"attrs":{"b":"1","i":"1"},"val":"lo"},{"val":" world"}]}',
      doc.toJSON(),
    );
    doc.update((root) => {
      root.k1.edit(5, 11, ' yorkie');
      assert.equal(
        '[0:00:0:0 ][1:00:2:0 Hel][1:00:2:3 lo][4:00:1:0  yorkie]{1:00:2:5  world}',
        root.k1.toTestString(),
      );
    });
    assert.equal(
      '{"k1":[{"attrs":{"b":"1"},"val":"Hel"},{"attrs":{"b":"1","i":"1"},"val":"lo"},{"val":" yorkie"}]}',
      doc.toJSON(),
    );
    doc.update((root) => {
      root.k1.edit(5, 5, '\n', { list: 'true' });
      assert(
        '[0:00:0:0 ][1:00:2:0 Hel][1:00:2:3 lo][5:00:1:0 ]' +
          '[4:00:1:0  yorkie]{1:00:2:5  world}',
        root.k1.toTestString(),
      );
    });
    assert.equal(
      '{"k1":[{"attrs":{"b":"1"},"val":"Hel"},{"attrs":{"b":"1","i":"1"},"val":"lo"},{"attrs":{"list":"true"},"val":"\\n"},{"val":" yorkie"}]}',
      doc.toJSON(),
    );
  });

  bench('text Edit-GC 100', () => {
    benchmarkTextEditGC(100);
  });

  bench('text Edit-GC 1000', () => {
    benchmarkTextEditGC(1000);
  });

  bench('text Split-GC 100', () => {
    benchmarkTextSplitGC(100);
  });

  bench('text Split-GC 1000', () => {
    benchmarkTextSplitGC(100);
  });

  bench('text Delete-All 10000', () => {
    benchmarkTextDeleteAll(10000);
  });

  bench('text 100', () => {
    benchmarkText(100);
  });

  bench('text 1000', () => {
    benchmarkText(1000);
  });
});
