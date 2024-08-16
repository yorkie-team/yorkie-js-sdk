import { describe, it, assert } from 'vitest';
import { MaxTimeTicket } from '@yorkie-js-sdk/src/document/time/ticket';
import yorkie, { Text, Tree, SyncMode } from '@yorkie-js-sdk/src/yorkie';
import {
  testRPCAddr,
  toDocKey,
} from '@yorkie-js-sdk/test/integration/integration_helper';

describe('Garbage Collection', function () {
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
});
