import { Document, Tree } from '@yorkie-js-sdk/src/yorkie';
import { MaxTimeTicket } from '@yorkie-js-sdk/src/document/time/ticket';
import { describe, bench, assert } from 'vitest';

const benchmarkTree = (size: number) => {
  const doc = new Document<{ tree: Tree }>('test-doc');

  doc.update((root) => {
    root.tree = new Tree({
      type: 'doc',
      children: [{ type: 'p', children: [] }],
    });

    for (let i = 1; i <= size; i++) {
      root.tree.edit(i, i, { type: 'text', value: 'a' });
    }
  });
};
const benchmarkTreeDeleteAll = (size: number) => {
  const doc = new Document<{ tree: Tree }>('test-doc');

  doc.update((root) => {
    root.tree = new Tree({
      type: 'doc',
      children: [{ type: 'p', children: [] }],
    });

    for (let i = 1; i <= size; i++) {
      root.tree.edit(i, i, { type: 'text', value: 'a' });
    }
  });

  doc.update((root) => {
    root.tree.edit(1, size + 1);
  }, 'delete them');
  assert.equal(doc.getRoot().tree.toXML(), `<doc><p></p></doc>`);
};
const benchmarkTreeSplitGC = (size: number) => {
  const doc = new Document<{ tree: Tree }>('test-doc');

  doc.update((root) => {
    root.tree = new Tree({
      type: 'doc',
      children: [
        { type: 'p', children: [{ type: 'text', value: 'a'.repeat(size) }] },
      ],
    });
  });

  doc.update((root) => {
    for (let i = 1; i <= size; i++) {
      root.tree.edit(i, i + 1, { type: 'text', value: 'b' });
    }
  }, `modify ${size} nodes`);
  // 03. GC
  assert.equal(size, doc.getGarbageLen());
  assert.equal(size, doc.garbageCollect(MaxTimeTicket));
  const empty = 0;
  assert.equal(empty, doc.getGarbageLen());
};
const benchmarkTreeEditGC = (size: number) => {
  const doc = new Document<{ tree: Tree }>('test-doc');

  doc.update((root) => {
    root.tree = new Tree({
      type: 'doc',
      children: [{ type: 'p', children: [] }],
    });
  });
  doc.update((root) => {
    for (let i = 1; i <= size; i++) {
      root.tree.edit(i, i, { type: 'text', value: 'a' });
    }
  });

  doc.update((root) => {
    for (let i = 1; i <= size; i++) {
      root.tree.edit(i, i + 1, { type: 'text', value: 'b' });
    }
  }, `modify ${size} nodes`);
  // 03. GC
  assert.equal(size, doc.getGarbageLen());
  assert.equal(size, doc.garbageCollect(MaxTimeTicket));
  const empty = 0;
  assert.equal(empty, doc.getGarbageLen());
};

describe('tree', () => {
  bench('tree 100', () => {
    benchmarkTree(100);
  });

  bench('tree 1000', () => {
    benchmarkTree(1000);
  });

  bench('tree 100', () => {
    benchmarkTree(100);
  });

  bench('tree 1000', () => {
    benchmarkTree(1000);
  });

  bench('tree delete all 1000', () => {
    benchmarkTreeDeleteAll(1000);
  });

  bench('tree split GC 100', () => {
    benchmarkTreeSplitGC(100);
  });

  bench('tree split GC 1000', () => {
    benchmarkTreeSplitGC(1000);
  });

  bench('tree edit GC 100', () => {
    benchmarkTreeEditGC(100);
  });

  bench('tree edit GC 1000', () => {
    benchmarkTreeEditGC(1000);
  });
});
