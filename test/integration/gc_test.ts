import { describe, it, assert } from 'vitest';
import { MaxTimeTicket } from '@yorkie-js-sdk/src/document/time/ticket';
import { CRDTArray } from '@yorkie-js-sdk/src/document/crdt/array';
import yorkie, { Text, Tree, SyncMode } from '@yorkie-js-sdk/src/yorkie';
import {
  testRPCAddr,
  toDocKey,
} from '@yorkie-js-sdk/test/integration/integration_helper';
import { CRDTTreeNode } from '@yorkie-js-sdk/src/document/crdt/tree';
import { IndexTreeNode } from '@yorkie-js-sdk/src/util/index_tree';

// `getNodeLength` returns the number of nodes in the given tree.
function getNodeLength(root: IndexTreeNode<CRDTTreeNode>) {
  let size = 0;

  size += root._children.length;

  if (root._children.length) {
    root._children.forEach((child) => {
      size += getNodeLength(child);
    });
  }

  return size;
}

describe('Garbage Collection', function () {
  it('garbage collection test', function () {
    const doc = new yorkie.Document<{
      1: number;
      2?: Array<number>;
      3: number;
    }>('test-doc');
    assert.equal(doc.toSortedJSON(), '{}');

    doc.update((root) => {
      root['1'] = 1;
      root['2'] = [1, 2, 3];
      root['3'] = 3;
    }, 'set 1, 2, 3');
    assert.equal(doc.toSortedJSON(), '{"1":1,"2":[1,2,3],"3":3}');

    doc.update((root) => {
      delete root['2'];
    }, 'deletes 2');
    assert.equal(doc.toSortedJSON(), '{"1":1,"3":3}');
    assert.equal(doc.getGarbageLen(), 4);
    assert.equal(doc.garbageCollect(MaxTimeTicket), 4);
    assert.equal(doc.getGarbageLen(), 0);
  });

  it('disable GC test', function () {
    const doc = new yorkie.Document<{
      1: number;
      2?: Array<number>;
      3: number;
    }>('test-doc', { disableGC: true });

    doc.update((root) => {
      root['1'] = 1;
      root['2'] = [1, 2, 3];
      root['3'] = 3;
    }, 'set 1, 2, 3');
    assert.equal(doc.toSortedJSON(), '{"1":1,"2":[1,2,3],"3":3}');

    doc.update((root) => {
      delete root['2'];
    }, 'deletes 2');
    assert.equal(doc.toSortedJSON(), '{"1":1,"3":3}');
    assert.equal(doc.getGarbageLen(), 4);
    assert.equal(doc.garbageCollect(MaxTimeTicket), 0);
    assert.equal(doc.getGarbageLen(), 4);
  });

  it('garbage collection test2', function () {
    const size = 10000;
    const doc = new yorkie.Document<{ 1?: Array<unknown> }>('test-doc');
    doc.update((root) => {
      root['1'] = Array.from(Array(size).keys());
    }, 'sets big array');

    doc.update((root) => {
      delete root['1'];
    }, 'deletes the array');

    assert.equal(doc.garbageCollect(MaxTimeTicket), size + 1);
  });

  it('garbage collection test3', function () {
    const doc = new yorkie.Document<{ list: Array<number> }>('test-doc');
    assert.equal(doc.toSortedJSON(), '{}');

    doc.update((root) => {
      root['list'] = [1, 2, 3];
    }, 'set 1, 2, 3');
    assert.equal(doc.toSortedJSON(), '{"list":[1,2,3]}');

    doc.update((root) => {
      delete root['list'][1];
    }, 'deletes 2');
    assert.equal(doc.toSortedJSON(), '{"list":[1,3]}');

    assert.equal(doc.getGarbageLen(), 1);
    assert.equal(doc.garbageCollect(MaxTimeTicket), 1);
    assert.equal(doc.getGarbageLen(), 0);

    const root = (doc.getRootObject().get('list') as CRDTArray)
      .getElements()
      .toTestString();
    const clone = (doc.getCloneRoot()!.get('list') as CRDTArray)
      .getElements()
      .toTestString();

    assert.equal(root, clone);
  });

  it('getGarbageLen should return the actual number of elements garbage-collected', async function ({
    task,
  }) {
    type TestDoc = { point?: { x?: number; y?: number } };
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const doc1 = new yorkie.Document<TestDoc>(docKey);
    const doc2 = new yorkie.Document<TestDoc>(docKey);

    const client1 = new yorkie.Client(testRPCAddr);
    const client2 = new yorkie.Client(testRPCAddr);

    await client1.activate();
    await client2.activate();

    // 1. initial state
    await client1.attach(doc1, { syncMode: SyncMode.Manual });
    doc1.update((root) => (root.point = { x: 0, y: 0 }));
    await client1.sync();
    await client2.attach(doc2, { syncMode: SyncMode.Manual });

    // 2. client1 updates doc
    doc1.update((root) => {
      delete root.point;
    });
    assert.equal(doc1.getGarbageLen(), 3); // point, x, y

    // 3. client2 updates doc
    doc2.update((root) => {
      delete root.point?.x;
    });
    assert.equal(doc2.getGarbageLen(), 1); // x

    await client1.sync();
    await client2.sync();
    await client1.sync();

    const gcNodeLen = 3; // point, x, y
    assert.equal(doc1.getGarbageLen(), gcNodeLen);
    assert.equal(doc2.getGarbageLen(), gcNodeLen);

    // Actual garbage-collected nodes
    assert.equal(doc1.garbageCollect(MaxTimeTicket), gcNodeLen);
    assert.equal(doc2.garbageCollect(MaxTimeTicket), gcNodeLen);

    await client1.deactivate();
    await client2.deactivate();
  });

  it('text garbage collection test', function () {
    const doc = new yorkie.Document<{ text: Text }>('test-doc');
    doc.update((root) => (root.text = new Text()));
    doc.update((root) => root.text.edit(0, 0, 'ABCD'));
    doc.update((root) => root.text.edit(0, 2, '12'));

    assert.equal(
      doc.getRoot().text.toTestString(),
      '[0:00:0:0 ][3:00:1:0 12]{2:00:1:0 AB}[2:00:1:2 CD]',
    );

    assert.equal(doc.getGarbageLen(), 1);
    doc.garbageCollect(MaxTimeTicket);
    assert.equal(doc.getGarbageLen(), 0);

    assert.equal(
      doc.getRoot().text.toTestString(),
      '[0:00:0:0 ][3:00:1:0 12][2:00:1:2 CD]',
    );

    doc.update((root) => root.text.edit(2, 4, ''));

    assert.equal(
      doc.getRoot().text.toTestString(),
      '[0:00:0:0 ][3:00:1:0 12]{2:00:1:2 CD}',
    );
  });

  it('garbage collection test for text', function () {
    const doc = new yorkie.Document<{ k1: Text }>('test-doc');
    assert.equal(doc.toSortedJSON(), '{}');

    let expectedMessage = '{"k1":[{"val":"Hello "},{"val":"mario"}]}';
    doc.update((root) => {
      root.k1 = new Text();
      root.k1.edit(0, 0, 'Hello world');
      root.k1.edit(6, 11, 'mario');
      assert.equal(root.toJSON!(), expectedMessage);
    }, 'edit text k1');
    assert.equal(doc.toSortedJSON(), expectedMessage);
    assert.equal(doc.getGarbageLen(), 1);

    expectedMessage =
      '{"k1":[{"val":"Hi"},{"val":" "},{"val":"j"},{"val":"ane"}]}';

    doc.update((root) => {
      const text = root['k1'];
      text.edit(0, 5, 'Hi');
      text.edit(3, 4, 'j');
      text.edit(4, 8, 'ane');
      assert.equal(root.toJSON!(), expectedMessage);
    }, 'deletes 2');
    assert.equal(doc.toSortedJSON(), expectedMessage);

    const expectedGarbageLen = 4;
    assert.equal(doc.getGarbageLen(), expectedGarbageLen);
    assert.equal(doc.garbageCollect(MaxTimeTicket), expectedGarbageLen);

    const empty = 0;
    assert.equal(doc.getGarbageLen(), empty);
  });

  it('garbage collection test for text with attributes', function () {
    const doc = new yorkie.Document<{ k1: Text }>('test-doc');
    assert.equal(doc.toSortedJSON(), '{}');

    let expectedMessage =
      '{"k1":[{"attrs":{"b":"1"},"val":"Hello "},{"val":"mario"}]}';

    doc.update((root) => {
      root.k1 = new Text();
      root.k1.edit(0, 0, 'Hello world', { b: '1' });
      root.k1.edit(6, 11, 'mario');
      assert.equal(root.toJSON!(), expectedMessage);
    }, 'edit text k1');
    assert.equal(doc.toSortedJSON(), expectedMessage);
    assert.equal(doc.getGarbageLen(), 1);

    expectedMessage =
      '{"k1":[{"attrs":{"b":"1"},"val":"Hi"},{"attrs":{"b":"1"},"val":" "},{"val":"j"},{"attrs":{"b":"1"},"val":"ane"}]}';

    doc.update((root) => {
      const text = root['k1'];
      text.edit(0, 5, 'Hi', { b: '1' });
      text.edit(3, 4, 'j');
      text.edit(4, 8, 'ane', { b: '1' });
      assert.equal(root.toJSON!(), expectedMessage);
    }, 'edit text k1');
    assert.equal(doc.toSortedJSON(), expectedMessage);

    const expectedGarbageLen = 4;
    assert.equal(doc.getGarbageLen(), expectedGarbageLen);
    assert.equal(doc.garbageCollect(MaxTimeTicket), expectedGarbageLen);

    const empty = 0;
    assert.equal(doc.getGarbageLen(), empty);
  });

  it('garbage collection test for tree', function () {
    const doc = new yorkie.Document<{ t: Tree }>('test-doc');
    assert.equal(doc.toSortedJSON(), '{}');

    doc.update((root) => {
      root.t = new Tree({
        type: 'doc',
        children: [
          {
            type: 'p',
            children: [
              {
                type: 'tn',
                children: [
                  { type: 'text', value: 'a' },
                  { type: 'text', value: 'b' },
                ],
              },
              { type: 'tn', children: [{ type: 'text', value: 'cd' }] },
            ],
          },
        ],
      });
    });

    doc.update((root) => {
      root.t.editByPath([0, 0, 0], [0, 0, 2], { type: 'text', value: 'gh' });
      assert.equal(root.t.toXML(), `<doc><p><tn>gh</tn><tn>cd</tn></p></doc>`);
    });

    // [text(a), text(b)]
    let nodeLengthBeforeGC = getNodeLength(
      doc.getRoot().t.getIndexTree().getRoot(),
    );
    assert.equal(doc.getGarbageLen(), 2);
    assert.equal(doc.garbageCollect(MaxTimeTicket), 2);
    assert.equal(doc.getGarbageLen(), 0);
    let nodeLengthAfterGC = getNodeLength(
      doc.getRoot().t.getIndexTree().getRoot(),
    );
    assert.equal(nodeLengthBeforeGC - nodeLengthAfterGC, 2);

    doc.update((root) => {
      root.t.editByPath([0, 0, 0], [0, 0, 2], { type: 'text', value: 'cv' });
      assert.equal(root.t.toXML(), `<doc><p><tn>cv</tn><tn>cd</tn></p></doc>`);
    });

    // [text(cd)]
    nodeLengthBeforeGC = getNodeLength(
      doc.getRoot().t.getIndexTree().getRoot(),
    );
    assert.equal(doc.getGarbageLen(), 1);
    assert.equal(doc.garbageCollect(MaxTimeTicket), 1);
    assert.equal(doc.getGarbageLen(), 0);
    nodeLengthAfterGC = getNodeLength(doc.getRoot().t.getIndexTree().getRoot());
    assert.equal(nodeLengthBeforeGC - nodeLengthAfterGC, 1);

    doc.update((root) => {
      root.t.editByPath([0], [1], {
        type: 'p',
        children: [{ type: 'tn', children: [{ type: 'text', value: 'ab' }] }],
      });
      assert.equal(root.t.toXML(), `<doc><p><tn>ab</tn></p></doc>`);
    });

    // [p, tn, tn, text(cv), text(cd)]
    nodeLengthBeforeGC = getNodeLength(
      doc.getRoot().t.getIndexTree().getRoot(),
    );
    assert.equal(doc.getGarbageLen(), 5);
    assert.equal(doc.garbageCollect(MaxTimeTicket), 5);
    assert.equal(doc.getGarbageLen(), 0);
    nodeLengthAfterGC = getNodeLength(doc.getRoot().t.getIndexTree().getRoot());
    assert.equal(nodeLengthBeforeGC - nodeLengthAfterGC, 5);
  });

  it('Can handle tree garbage collection for multi client', async function ({
    task,
  }) {
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const doc1 = new yorkie.Document<{ t: Tree }>(docKey);
    const doc2 = new yorkie.Document<{ t: Tree }>(docKey);

    const client1 = new yorkie.Client(testRPCAddr);
    const client2 = new yorkie.Client(testRPCAddr);

    await client1.activate();
    await client2.activate();

    await client1.attach(doc1, { syncMode: SyncMode.Manual });
    await client2.attach(doc2, { syncMode: SyncMode.Manual });

    doc1.update((root) => {
      root.t = new Tree({
        type: 'doc',
        children: [
          {
            type: 'p',
            children: [
              {
                type: 'tn',
                children: [
                  { type: 'text', value: 'a' },
                  { type: 'text', value: 'b' },
                ],
              },
              { type: 'tn', children: [{ type: 'text', value: 'cd' }] },
            ],
          },
        ],
      });
    });

    assert.equal(doc1.getGarbageLen(), 0);
    assert.equal(doc2.getGarbageLen(), 0);

    // (0, 0) -> (1, 0): syncedseqs:(0, 0)
    await client1.sync();

    // (1, 0) -> (1, 1): syncedseqs:(0, 0)
    await client2.sync();

    doc2.update((root) => {
      root.t.editByPath([0, 0, 0], [0, 0, 2], { type: 'text', value: 'gh' });
    }, 'removes 2');
    assert.equal(doc1.getGarbageLen(), 0);
    assert.equal(doc2.getGarbageLen(), 2);

    // (1, 1) -> (1, 2): syncedseqs:(0, 1)
    await client2.sync();
    assert.equal(doc1.getGarbageLen(), 0);
    assert.equal(doc2.getGarbageLen(), 2);

    // (1, 2) -> (2, 2): syncedseqs:(1, 1)
    await client1.sync();
    assert.equal(doc1.getGarbageLen(), 2);
    assert.equal(doc2.getGarbageLen(), 2);

    // (2, 2) -> (2, 2): syncedseqs:(1, 2)
    await client2.sync();
    assert.equal(doc1.getGarbageLen(), 2);
    assert.equal(doc2.getGarbageLen(), 2);

    // (2, 2) -> (2, 2): syncedseqs:(2, 2): meet GC condition
    await client1.sync();
    assert.equal(doc1.getGarbageLen(), 0);
    assert.equal(doc2.getGarbageLen(), 2);

    // (2, 2) -> (2, 2): syncedseqs:(2, 2): meet GC condition
    await client2.sync();
    assert.equal(doc1.getGarbageLen(), 0);
    assert.equal(doc2.getGarbageLen(), 0);

    await client1.detach(doc1);
    await client2.detach(doc2);

    await client1.deactivate();
    await client2.deactivate();
  });

  it('Can handle garbage collection for container type', async function ({
    task,
  }) {
    type TestDoc = { 1: number; 2?: Array<number>; 3: number };
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const doc1 = new yorkie.Document<TestDoc>(docKey);
    const doc2 = new yorkie.Document<TestDoc>(docKey);

    const client1 = new yorkie.Client(testRPCAddr);
    const client2 = new yorkie.Client(testRPCAddr);

    await client1.activate();
    await client2.activate();

    await client1.attach(doc1, { syncMode: SyncMode.Manual });
    await client2.attach(doc2, { syncMode: SyncMode.Manual });

    doc1.update((root) => {
      root['1'] = 1;
      root['2'] = [1, 2, 3];
      root['3'] = 3;
    }, 'sets 1, 2, 3');

    assert.equal(doc1.getGarbageLen(), 0);
    assert.equal(doc2.getGarbageLen(), 0);

    // (0, 0) -> (1, 0): syncedseqs:(0, 0)
    await client1.sync();

    // (1, 0) -> (1, 1): syncedseqs:(0, 0)
    await client2.sync();

    doc2.update((root) => {
      delete root['2'];
    }, 'removes 2');
    assert.equal(doc1.getGarbageLen(), 0);
    assert.equal(doc2.getGarbageLen(), 4);

    // (1, 1) -> (1, 2): syncedseqs:(0, 1)
    await client2.sync();
    assert.equal(doc1.getGarbageLen(), 0);
    assert.equal(doc2.getGarbageLen(), 4);

    // (1, 2) -> (2, 2): syncedseqs:(1, 1)
    await client1.sync();
    assert.equal(doc1.getGarbageLen(), 4);
    assert.equal(doc2.getGarbageLen(), 4);

    // (2, 2) -> (2, 2): syncedseqs:(1, 2)
    await client2.sync();
    assert.equal(doc1.getGarbageLen(), 4);
    assert.equal(doc2.getGarbageLen(), 4);

    // (2, 2) -> (2, 2): syncedseqs:(2, 2): meet GC condition
    await client1.sync();
    assert.equal(doc1.getGarbageLen(), 0);
    assert.equal(doc2.getGarbageLen(), 4);

    // (2, 2) -> (2, 2): syncedseqs:(2, 2): meet GC condition
    await client2.sync();
    assert.equal(doc1.getGarbageLen(), 0);
    assert.equal(doc2.getGarbageLen(), 0);

    await client1.detach(doc1);
    await client2.detach(doc2);

    await client1.deactivate();
    await client2.deactivate();
  });

  it('Can handle garbage collection for text type', async function ({ task }) {
    type TestDoc = { text: Text; textWithAttr: Text };
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const doc1 = new yorkie.Document<TestDoc>(docKey);
    const doc2 = new yorkie.Document<TestDoc>(docKey);

    const client1 = new yorkie.Client(testRPCAddr);
    const client2 = new yorkie.Client(testRPCAddr);

    await client1.activate();
    await client2.activate();

    await client1.attach(doc1, { syncMode: SyncMode.Manual });
    await client2.attach(doc2, { syncMode: SyncMode.Manual });

    doc1.update((root) => {
      root.text = new Text();
      root.text.edit(0, 0, 'Hello World');
      root.textWithAttr = new Text();
      root.textWithAttr.edit(0, 0, 'Hello World');
    }, 'sets text');

    assert.equal(doc1.getGarbageLen(), 0);
    assert.equal(doc2.getGarbageLen(), 0);

    // (0, 0) -> (1, 0): syncedseqs:(0, 0)
    await client1.sync();

    // (1, 0) -> (1, 1): syncedseqs:(0, 0)
    await client2.sync();

    doc2.update((root) => {
      root.text.edit(0, 1, 'a');
      root.text.edit(1, 2, 'b');
      root.textWithAttr.edit(0, 1, 'a', { b: '1' });
    }, 'edit text type elements');
    assert.equal(doc1.getGarbageLen(), 0);
    assert.equal(doc2.getGarbageLen(), 3);

    // (1, 1) -> (1, 2): syncedseqs:(0, 1)
    await client2.sync();
    assert.equal(doc1.getGarbageLen(), 0);
    assert.equal(doc2.getGarbageLen(), 3);

    // (1, 2) -> (2, 2): syncedseqs:(1, 1)
    await client1.sync();
    assert.equal(doc1.getGarbageLen(), 3);
    assert.equal(doc2.getGarbageLen(), 3);

    // (2, 2) -> (2, 2): syncedseqs:(1, 2)
    await client2.sync();
    assert.equal(doc1.getGarbageLen(), 3);
    assert.equal(doc2.getGarbageLen(), 3);

    // (2, 2) -> (2, 2): syncedseqs:(2, 2): meet GC condition
    await client1.sync();
    assert.equal(doc1.getGarbageLen(), 0);
    assert.equal(doc2.getGarbageLen(), 3);

    // (2, 2) -> (2, 2): syncedseqs:(2, 2): meet GC condition
    await client2.sync();
    assert.equal(doc1.getGarbageLen(), 0);
    assert.equal(doc2.getGarbageLen(), 0);

    await client1.detach(doc1);
    await client2.detach(doc2);

    await client1.deactivate();
    await client2.deactivate();
  });

  it('Can handle garbage collection with detached document test', async function ({
    task,
  }) {
    type TestDoc = {
      1: number;
      2?: Array<number>;
      3: number;
      4: Text;
      5: Text;
    };
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const doc1 = new yorkie.Document<TestDoc>(docKey);
    const doc2 = new yorkie.Document<TestDoc>(docKey);

    const client1 = new yorkie.Client(testRPCAddr);
    const client2 = new yorkie.Client(testRPCAddr);

    await client1.activate();
    await client2.activate();

    await client1.attach(doc1, { syncMode: SyncMode.Manual });
    await client2.attach(doc2, { syncMode: SyncMode.Manual });

    doc1.update((root) => {
      root['1'] = 1;
      root['2'] = [1, 2, 3];
      root['3'] = 3;
      root['4'] = new Text();
      root['4'].edit(0, 0, 'hi');
      root['5'] = new Text();
      root['5'].edit(0, 0, 'hi');
    }, 'sets 1, 2, 3, 4, 5');

    assert.equal(doc1.getGarbageLen(), 0);
    assert.equal(doc2.getGarbageLen(), 0);

    // (0, 0) -> (1, 0): syncedseqs:(0, 0)
    await client1.sync();

    // (1, 0) -> (1, 1): syncedseqs:(0, 0)
    await client2.sync();

    doc1.update((root) => {
      delete root['2'];
      root['4'].edit(0, 1, 'h');
      root['5'].edit(0, 1, 'h', { b: '1' });
    }, 'removes 2 and edit text type elements');
    assert.equal(doc1.getGarbageLen(), 6);
    assert.equal(doc2.getGarbageLen(), 0);

    // (1, 1) -> (2, 1): syncedseqs:(1, 0)
    await client1.sync();
    assert.equal(doc1.getGarbageLen(), 6);
    assert.equal(doc2.getGarbageLen(), 0);

    await client2.detach(doc2);

    // (2, 1) -> (2, 2): syncedseqs:(1, x)
    await client2.sync();
    assert.equal(doc1.getGarbageLen(), 6);
    assert.equal(doc2.getGarbageLen(), 6);

    // (2, 2) -> (2, 2): syncedseqs:(2, x): meet GC condition
    await client1.sync();
    assert.equal(doc1.getGarbageLen(), 0);
    assert.equal(doc2.getGarbageLen(), 6);

    await client1.detach(doc1);

    await client1.deactivate();
    await client2.deactivate();
  });

  it('Can collect removed elements from both root and clone', async function ({
    task,
  }) {
    type TestDoc = { point: { x: number; y: number } };
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const doc = new yorkie.Document<TestDoc>(docKey);
    const cli = new yorkie.Client(testRPCAddr);
    await cli.activate();

    await cli.attach(doc, { syncMode: SyncMode.Manual });
    doc.update((root) => {
      root.point = { x: 0, y: 0 };
    });
    doc.update((root) => {
      root.point = { x: 1, y: 1 };
    });
    doc.update((root) => {
      root.point = { x: 2, y: 2 };
    });
    assert.equal(doc.getGarbageLen(), 6);
    assert.equal(doc.getGarbageLenFromClone(), 6);
  });

  it('Can collect removed elements from both root and clone for nested array', async function ({
    task,
  }) {
    type TestDoc = { list: Array<number | Array<number>> };
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const doc = new yorkie.Document<TestDoc>(docKey);
    const cli = new yorkie.Client(testRPCAddr);
    await cli.activate();

    await cli.attach(doc, { syncMode: SyncMode.Manual });
    doc.update((root) => {
      root.list = [0, 1, 2];
      root.list.push([3, 4, 5]);
    });
    assert.equal('{"list":[0,1,2,[3,4,5]]}', doc.toJSON());
    doc.update((root) => {
      delete root.list[1];
    });
    assert.equal('{"list":[0,2,[3,4,5]]}', doc.toJSON());
    doc.update((root) => {
      delete (root.list[2] as Array<number>)[1];
    });
    assert.equal('{"list":[0,2,[3,5]]}', doc.toJSON());

    assert.equal(doc.getGarbageLen(), 2);
    assert.equal(doc.getGarbageLenFromClone(), 2);
  });

  it('Can purges removed elements after peers can not access them', async function ({
    task,
  }) {
    type TestDoc = { point: { x: number; y: number } };
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const doc1 = new yorkie.Document<TestDoc>(docKey);
    const doc2 = new yorkie.Document<TestDoc>(docKey);

    const client1 = new yorkie.Client(testRPCAddr);
    const client2 = new yorkie.Client(testRPCAddr);

    await client1.activate();
    await client2.activate();

    await client1.attach(doc1, { syncMode: SyncMode.Manual });
    doc1.update((root) => (root.point = { x: 0, y: 0 }));
    doc1.update((root) => (root.point.x = 1));
    assert.equal(doc1.getGarbageLen(), 1);
    await client1.sync();

    await client2.attach(doc2, { syncMode: SyncMode.Manual });
    assert.equal(doc2.getGarbageLen(), 1);
    doc2.update((root) => (root.point.x = 2));
    assert.equal(doc2.getGarbageLen(), 2);

    doc1.update((root) => (root.point = { x: 3, y: 3 }));
    assert.equal(doc1.getGarbageLen(), 4);
    await client1.sync();
    assert.equal(doc1.getGarbageLen(), 4);

    await client1.sync();
    assert.equal(doc1.getGarbageLen(), 4);

    await client2.sync();
    assert.equal(doc1.getGarbageLen(), 4);
    await client1.sync();
    assert.equal(doc1.getGarbageLen(), 5);
    await client2.sync();
    assert.equal(doc1.getGarbageLen(), 5);
    await client1.sync();
    assert.equal(doc1.getGarbageLen(), 0);

    await client1.deactivate();
    await client2.deactivate();
  });

  it('garbage collection test for nested object', async function ({ task }) {
    type TestDoc = { shape?: { point?: { x?: number; y?: number } } };
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const doc = new yorkie.Document<TestDoc>(docKey);

    doc.update((root) => {
      root.shape = { point: { x: 0, y: 0 } };
      delete root.shape;
    });
    assert.equal(doc.getGarbageLen(), 4); // shape, point, x, y
    assert.equal(doc.garbageCollect(MaxTimeTicket), 4); // The number of GC nodes must also be 4.
  });

  it('Should work properly when there are multiple nodes to be collected in text type', async function ({
    task,
  }) {
    type TestDoc = { t: Text };
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const doc1 = new yorkie.Document<TestDoc>(docKey);
    const doc2 = new yorkie.Document<TestDoc>(docKey);
    const client1 = new yorkie.Client(testRPCAddr);
    const client2 = new yorkie.Client(testRPCAddr);
    await client1.activate();
    await client2.activate();
    await client1.attach(doc1, { syncMode: SyncMode.Manual });
    await client2.attach(doc2, { syncMode: SyncMode.Manual });

    doc1.update((root) => {
      root.t = new yorkie.Text();
      root.t.edit(0, 0, 'z');
    });
    doc1.update((root) => {
      root.t.edit(0, 1, 'a');
    });
    doc1.update((root) => {
      root.t.edit(1, 1, 'b');
    });
    doc1.update((root) => {
      root.t.edit(2, 2, 'd');
    });
    await client1.sync();
    await client2.sync();
    assert.equal(doc1.getRoot().t.toString(), 'abd');
    assert.equal(doc2.getRoot().t.toString(), 'abd');
    assert.equal(doc1.getGarbageLen(), 1); // z

    doc1.update((root) => {
      root.t.edit(2, 2, 'c');
    });
    await client1.sync();
    await client2.sync();
    await client2.sync();
    assert.equal(doc1.getRoot().t.toString(), 'abcd');
    assert.equal(doc2.getRoot().t.toString(), 'abcd');

    doc1.update((root) => {
      root.t.edit(1, 3, '');
    });
    await client1.sync();
    assert.equal(doc1.getRoot().t.toString(), 'ad');
    assert.equal(doc1.getGarbageLen(), 2); // b,c

    await client2.sync();
    await client2.sync();
    await client1.sync();
    assert.equal(doc2.getRoot().t.toString(), 'ad');
    assert.equal(doc1.getGarbageLen(), 0);

    await client1.deactivate();
    await client2.deactivate();
  });

  it('Should work properly when there are multiple nodes to be collected in tree type', async function ({
    task,
  }) {
    type TestDoc = { t: Tree };
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const doc1 = new yorkie.Document<TestDoc>(docKey);
    const doc2 = new yorkie.Document<TestDoc>(docKey);
    const client1 = new yorkie.Client(testRPCAddr);
    const client2 = new yorkie.Client(testRPCAddr);
    await client1.activate();
    await client2.activate();
    await client1.attach(doc1, { syncMode: SyncMode.Manual });
    await client2.attach(doc2, { syncMode: SyncMode.Manual });

    doc1.update((root) => {
      root.t = new yorkie.Tree({
        type: 'r',
        children: [
          {
            type: 'text',
            value: 'z',
          },
        ],
      });
    });
    doc1.update((root) => {
      root.t.editByPath([0], [1], {
        type: 'text',
        value: 'a',
      });
    });
    doc1.update((root) => {
      root.t.editByPath([1], [1], {
        type: 'text',
        value: 'b',
      });
    });
    doc1.update((root) => {
      root.t.editByPath([2], [2], {
        type: 'text',
        value: 'd',
      });
    });
    await client1.sync();
    await client2.sync();
    assert.equal(doc1.getRoot().t.toXML(), '<r>abd</r>');
    assert.equal(doc2.getRoot().t.toXML(), '<r>abd</r>');
    assert.equal(doc1.getGarbageLen(), 1); // z

    doc1.update((root) => {
      root.t.editByPath([2], [2], {
        type: 'text',
        value: 'c',
      });
    });
    await client1.sync();
    await client2.sync();
    await client2.sync();
    assert.equal(doc1.getRoot().t.toXML(), '<r>abcd</r>');
    assert.equal(doc2.getRoot().t.toXML(), '<r>abcd</r>');

    doc1.update((root) => {
      root.t.editByPath([1], [3]);
    });
    await client1.sync();
    assert.equal(doc1.getRoot().t.toXML(), '<r>ad</r>');
    assert.equal(doc1.getGarbageLen(), 2); // b,c

    await client2.sync();
    await client2.sync();
    await client1.sync();
    assert.equal(doc2.getRoot().t.toXML(), '<r>ad</r>');
    assert.equal(doc1.getGarbageLen(), 0);

    await client1.deactivate();
    await client2.deactivate();
  });
  describe('garbage collection for tree', () => {
    enum OpCode {
      NoOp,
      Style,
      RemoveStyle,
      DeleteNode,
      GC,
    }

    interface Operation {
      code: OpCode;
      key: string;
      val: string;
    }

    interface Step {
      op: Operation;
      garbageLen: number;
      expectXML: string;
    }

    interface TestCase {
      desc: string;
      steps: Array<Step>;
    }

    describe('TreeGC', () => {
      const tests: Array<TestCase> = [
        {
          desc: 'style-style test',
          steps: [
            {
              op: { code: OpCode.Style, key: 'b', val: 't' },
              garbageLen: 0,
              expectXML: '<r><p b="t"></p></r>',
            },
            {
              op: { code: OpCode.Style, key: 'b', val: 'f' },
              garbageLen: 0,
              expectXML: '<r><p b="f"></p></r>',
            },
          ],
        },
        {
          desc: 'style-remove test',
          steps: [
            {
              op: { code: OpCode.Style, key: 'b', val: 't' },
              garbageLen: 0,
              expectXML: '<r><p b="t"></p></r>',
            },
            {
              op: { code: OpCode.RemoveStyle, key: 'b', val: '' },
              garbageLen: 1,
              expectXML: '<r><p></p></r>',
            },
          ],
        },
        {
          desc: 'remove-style test',
          steps: [
            {
              op: { code: OpCode.RemoveStyle, key: 'b', val: '' },
              garbageLen: 1,
              expectXML: '<r><p></p></r>',
            },
            {
              op: { code: OpCode.Style, key: 'b', val: 't' },
              garbageLen: 0,
              expectXML: '<r><p b="t"></p></r>',
            },
          ],
        },
        {
          desc: 'remove-remove test',
          steps: [
            {
              op: { code: OpCode.RemoveStyle, key: 'b', val: '' },
              garbageLen: 1,
              expectXML: '<r><p></p></r>',
            },
            {
              op: { code: OpCode.RemoveStyle, key: 'b', val: '' },
              garbageLen: 1,
              expectXML: '<r><p></p></r>',
            },
          ],
        },
        {
          desc: 'style-delete test',
          steps: [
            {
              op: { code: OpCode.Style, key: 'b', val: 't' },
              garbageLen: 0,
              expectXML: '<r><p b="t"></p></r>',
            },
            {
              op: { code: OpCode.DeleteNode, key: '', val: '' },
              garbageLen: 1,
              expectXML: '<r></r>',
            },
          ],
        },
        {
          desc: 'remove-delete test',
          steps: [
            {
              op: { code: OpCode.RemoveStyle, key: 'b', val: '' },
              garbageLen: 1,
              expectXML: '<r><p></p></r>',
            },
            {
              op: { code: OpCode.DeleteNode, key: 'b', val: 't' },
              garbageLen: 2,
              expectXML: '<r></r>',
            },
          ],
        },
        {
          desc: 'remove-gc-delete test',
          steps: [
            {
              op: { code: OpCode.RemoveStyle, key: 'b', val: '' },
              garbageLen: 1,
              expectXML: '<r><p></p></r>',
            },
            {
              op: { code: OpCode.GC, key: '', val: '' },
              garbageLen: 0,
              expectXML: '<r><p></p></r>',
            },
            {
              op: { code: OpCode.DeleteNode, key: 'b', val: 't' },
              garbageLen: 1,
              expectXML: '<r></r>',
            },
          ],
        },
      ];

      for (let i = 0; i < tests.length; i++) {
        const tc = tests[i];
        it(`${i + 1}. ${tc.desc}`, () => {
          const doc = new yorkie.Document<{ t: Tree }>(`test-doc${i}`);
          assert.equal(doc.toSortedJSON(), '{}');

          doc.update((root) => {
            root.t = new Tree({
              type: 'r',
              children: [{ type: 'p', children: [] }],
            });
          });
          assert.equal(doc.getRoot().t.toXML(), '<r><p></p></r>');

          for (let j = 0; j < tc.steps.length; j++) {
            const s = tc.steps[j];
            doc.update((root) => {
              if (s.op.code === OpCode.RemoveStyle) {
                root.t.removeStyle(0, 1, [s.op.key]);
              } else if (s.op.code === OpCode.Style) {
                root.t.style(0, 1, { [s.op.key]: s.op.val });
              } else if (s.op.code === OpCode.DeleteNode) {
                root.t.edit(0, 2, undefined, 0);
              } else if (s.op.code === OpCode.GC) {
                doc.garbageCollect(MaxTimeTicket);
              }
            });
            assert.equal(doc.getRoot().t.toXML(), s.expectXML);
            assert.equal(doc.getGarbageLen(), s.garbageLen);
          }

          doc.garbageCollect(MaxTimeTicket);
          assert.equal(doc.getGarbageLen(), 0);
        });
      }
    });
  });
});
