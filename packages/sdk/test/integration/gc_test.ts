import { describe, it, assert } from 'vitest';
import yorkie, { Text, Tree, SyncMode } from '@yorkie-js/sdk/src/yorkie';
import {
  testRPCAddr,
  toDocKey,
} from '@yorkie-js/sdk/test/integration/integration_helper';
import {
  maxVectorOf,
  vectorOf,
  DefaultSnapshotThreshold,
} from '../helper/helper';

describe('Garbage Collection', function () {
  it('getGarbageLen should return the actual number of elements garbage-collected', async function ({
    task,
  }) {
    type TestDoc = { point?: { x?: number; y?: number } };
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const d1 = new yorkie.Document<TestDoc>(docKey);
    const d2 = new yorkie.Document<TestDoc>(docKey);

    const c1 = new yorkie.Client({ rpcAddr: testRPCAddr });
    const c2 = new yorkie.Client({ rpcAddr: testRPCAddr });

    await c1.activate();
    await c2.activate();

    // 1. initial state
    await c1.attach(d1, { syncMode: SyncMode.Manual });
    d1.update((root) => (root.point = { x: 0, y: 0 }));
    await c1.sync();
    await c2.attach(d2, { syncMode: SyncMode.Manual });

    // 2. client1 updates doc
    d1.update((root) => {
      delete root.point;
    });
    assert.equal(d1.getGarbageLen(), 3); // point, x, y

    // 3. client2 updates doc
    d2.update((root) => {
      delete root.point?.x;
    });
    assert.equal(d2.getGarbageLen(), 1); // x

    await c1.sync();
    await c2.sync();
    await c1.sync();

    const gcNodeLen = 3; // point, x, y
    assert.equal(d1.getGarbageLen(), gcNodeLen);
    assert.equal(d2.getGarbageLen(), gcNodeLen);

    // Actual garbage-collected nodes
    assert.equal(
      d1.garbageCollect(maxVectorOf([c1.getID()!, c2.getID()!])),
      gcNodeLen,
    );
    assert.equal(
      d2.garbageCollect(maxVectorOf([c1.getID()!, c2.getID()!])),
      gcNodeLen,
    );

    await c1.deactivate();
    await c2.deactivate();
  });

  it('Can handle tree garbage collection for multi client', async function ({
    task,
  }) {
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const d1 = new yorkie.Document<{ t: Tree }>(docKey);
    const d2 = new yorkie.Document<{ t: Tree }>(docKey);

    const c1 = new yorkie.Client({ rpcAddr: testRPCAddr });
    const c2 = new yorkie.Client({ rpcAddr: testRPCAddr });

    await c1.activate();
    await c2.activate();

    await c1.attach(d1, { syncMode: SyncMode.Manual });
    assert.deepEqual(vectorOf([]), d1.getVersionVector());
    await c2.attach(d2, { syncMode: SyncMode.Manual });
    assert.deepEqual(vectorOf([]), d2.getVersionVector());

    d1.update((root) => {
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
    assert.deepEqual(
      vectorOf([{ c: c1.getID()!, l: 1n }]),
      d1.getVersionVector(),
    );

    assert.equal(d1.getGarbageLen(), 0);
    assert.equal(d2.getGarbageLen(), 0);

    await c1.sync();
    assert.deepEqual(
      vectorOf([{ c: c1.getID()!, l: 1n }]),
      d1.getVersionVector(),
    );

    await c2.sync();
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 1n },
        { c: c2.getID()!, l: 2n },
      ]),
      d2.getVersionVector(),
    );

    d2.update((root) => {
      root.t.editByPath([0, 0, 0], [0, 0, 2], { type: 'text', value: 'gh' });
    }, 'removes 2');
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 1n },
        { c: c2.getID()!, l: 3n },
      ]),
      d2.getVersionVector(),
    );
    assert.equal(d1.getGarbageLen(), 0);
    assert.equal(d2.getGarbageLen(), 2);

    // (1, 1) -> (1, 2): syncedseqs:(0, 1)
    await c2.sync();
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 1n },
        { c: c2.getID()!, l: 3n },
      ]),
      d2.getVersionVector(),
    );
    assert.equal(d1.getGarbageLen(), 0);
    assert.equal(d2.getGarbageLen(), 2);

    await c1.sync();
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 4n },
        { c: c2.getID()!, l: 3n },
      ]),
      d1.getVersionVector(),
    );
    assert.equal(d1.getGarbageLen(), 2);
    assert.equal(d2.getGarbageLen(), 2);

    await c2.sync();
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 1n },
        { c: c2.getID()!, l: 3n },
      ]),
      d2.getVersionVector(),
    );
    assert.equal(d1.getGarbageLen(), 2);
    assert.equal(d2.getGarbageLen(), 2);

    await c1.sync();
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 4n },
        { c: c2.getID()!, l: 3n },
      ]),
      d1.getVersionVector(),
    );
    assert.equal(d1.getGarbageLen(), 0);
    assert.equal(d2.getGarbageLen(), 2);

    await c2.sync();
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 1n },
        { c: c2.getID()!, l: 3n },
      ]),
      d2.getVersionVector(),
    );
    assert.equal(d1.getGarbageLen(), 0);
    assert.equal(d2.getGarbageLen(), 0);

    await c1.detach(d1);
    await c2.detach(d2);

    await c1.deactivate();
    await c2.deactivate();
  });

  it('Can handle garbage collection for container type', async function ({
    task,
  }) {
    type TestDoc = { 1: number; 2?: Array<number>; 3: number };
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const d1 = new yorkie.Document<TestDoc>(docKey);
    const d2 = new yorkie.Document<TestDoc>(docKey);

    const c1 = new yorkie.Client({ rpcAddr: testRPCAddr });
    const c2 = new yorkie.Client({ rpcAddr: testRPCAddr });

    await c1.activate();
    await c2.activate();

    await c1.attach(d1, { syncMode: SyncMode.Manual });
    assert.deepEqual(vectorOf([]), d1.getVersionVector());
    await c2.attach(d2, { syncMode: SyncMode.Manual });
    assert.deepEqual(vectorOf([]), d2.getVersionVector());

    d1.update((root) => {
      root['1'] = 1;
      root['2'] = [1, 2, 3];
      root['3'] = 3;
    }, 'sets 1, 2, 3');
    assert.deepEqual(
      vectorOf([{ c: c1.getID()!, l: 1n }]),
      d1.getVersionVector(),
    );

    assert.equal(d1.getGarbageLen(), 0);
    assert.equal(d2.getGarbageLen(), 0);

    await c1.sync();
    assert.deepEqual(
      vectorOf([{ c: c1.getID()!, l: 1n }]),
      d1.getVersionVector(),
    );

    await c2.sync();
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 1n },
        { c: c2.getID()!, l: 2n },
      ]),
      d2.getVersionVector(),
    );

    d2.update((root) => {
      delete root['2'];
    }, 'removes 2');
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 1n },
        { c: c2.getID()!, l: 3n },
      ]),
      d2.getVersionVector(),
    );
    assert.equal(d1.getGarbageLen(), 0);
    assert.equal(d2.getGarbageLen(), 4);

    await c2.sync();
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 1n },
        { c: c2.getID()!, l: 3n },
      ]),
      d2.getVersionVector(),
    );
    assert.equal(d1.getGarbageLen(), 0);
    assert.equal(d2.getGarbageLen(), 4);

    await c1.sync();
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 4n },
        { c: c2.getID()!, l: 3n },
      ]),
      d1.getVersionVector(),
    );
    assert.equal(d1.getGarbageLen(), 4);
    assert.equal(d2.getGarbageLen(), 4);

    await c2.sync();
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 1n },
        { c: c2.getID()!, l: 3n },
      ]),
      d2.getVersionVector(),
    );
    assert.equal(d1.getGarbageLen(), 4);
    assert.equal(d2.getGarbageLen(), 4);

    await c1.sync();
    await c1.sync();
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 4n },
        { c: c2.getID()!, l: 3n },
      ]),
      d1.getVersionVector(),
    );
    assert.equal(d1.getGarbageLen(), 0);
    assert.equal(d2.getGarbageLen(), 4);

    await c2.sync();
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 1n },
        { c: c2.getID()!, l: 3n },
      ]),
      d2.getVersionVector(),
    );
    assert.equal(d1.getGarbageLen(), 0);
    assert.equal(d2.getGarbageLen(), 0);

    await c1.detach(d1);
    await c2.detach(d2);

    await c1.deactivate();
    await c2.deactivate();
  });

  it('Can handle garbage collection for text type', async function ({ task }) {
    type TestDoc = { text: Text; textWithAttr: Text };
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const d1 = new yorkie.Document<TestDoc>(docKey);
    const d2 = new yorkie.Document<TestDoc>(docKey);

    const c1 = new yorkie.Client({ rpcAddr: testRPCAddr });
    const c2 = new yorkie.Client({ rpcAddr: testRPCAddr });

    await c1.activate();
    await c2.activate();

    await c1.attach(d1, { syncMode: SyncMode.Manual });
    assert.deepEqual(vectorOf([]), d1.getVersionVector());
    await c2.attach(d2, { syncMode: SyncMode.Manual });
    assert.deepEqual(vectorOf([]), d2.getVersionVector());

    d1.update((root) => {
      root.text = new Text();
      root.text.edit(0, 0, 'Hello World');
      root.textWithAttr = new Text();
      root.textWithAttr.edit(0, 0, 'Hello World');
    }, 'sets text');
    assert.deepEqual(
      vectorOf([{ c: c1.getID()!, l: 1n }]),
      d1.getVersionVector(),
    );
    assert.equal(d1.getGarbageLen(), 0);
    assert.equal(d2.getGarbageLen(), 0);

    await c1.sync();
    assert.deepEqual(
      vectorOf([{ c: c1.getID()!, l: 1n }]),
      d1.getVersionVector(),
    );

    await c2.sync();
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 1n },
        { c: c2.getID()!, l: 2n },
      ]),
      d2.getVersionVector(),
    );

    d2.update((root) => {
      root.text.edit(0, 1, 'a');
      root.text.edit(1, 2, 'b');
      root.textWithAttr.edit(0, 1, 'a', { b: '1' });
    }, 'edit text type elements');
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 1n },
        { c: c2.getID()!, l: 3n },
      ]),
      d2.getVersionVector(),
    );
    assert.equal(d1.getGarbageLen(), 0);
    assert.equal(d2.getGarbageLen(), 3);

    await c2.sync();
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 1n },
        { c: c2.getID()!, l: 3n },
      ]),
      d2.getVersionVector(),
    );
    assert.equal(d1.getGarbageLen(), 0);
    assert.equal(d2.getGarbageLen(), 3);

    await c1.sync();
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 4n },
        { c: c2.getID()!, l: 3n },
      ]),
      d1.getVersionVector(),
    );
    assert.equal(d1.getGarbageLen(), 3);
    assert.equal(d2.getGarbageLen(), 3);

    await c2.sync();
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 1n },
        { c: c2.getID()!, l: 3n },
      ]),
      d2.getVersionVector(),
    );
    assert.equal(d1.getGarbageLen(), 3);
    assert.equal(d2.getGarbageLen(), 3);

    await c1.sync();
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 4n },
        { c: c2.getID()!, l: 3n },
      ]),
      d1.getVersionVector(),
    );
    assert.equal(d1.getGarbageLen(), 0);
    assert.equal(d2.getGarbageLen(), 3);

    await c2.sync();
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 1n },
        { c: c2.getID()!, l: 3n },
      ]),
      d2.getVersionVector(),
    );
    assert.equal(d1.getGarbageLen(), 0);
    assert.equal(d2.getGarbageLen(), 0);

    await c1.detach(d1);
    await c2.detach(d2);

    await c1.deactivate();
    await c2.deactivate();
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
    const d1 = new yorkie.Document<TestDoc>(docKey);
    const d2 = new yorkie.Document<TestDoc>(docKey);

    const c1 = new yorkie.Client({ rpcAddr: testRPCAddr });
    const c2 = new yorkie.Client({ rpcAddr: testRPCAddr });

    await c1.activate();
    await c2.activate();

    await c1.attach(d1, { syncMode: SyncMode.Manual });
    assert.deepEqual(vectorOf([]), d1.getVersionVector());
    await c2.attach(d2, { syncMode: SyncMode.Manual });
    assert.deepEqual(vectorOf([]), d2.getVersionVector());

    d1.update((root) => {
      root['1'] = 1;
      root['2'] = [1, 2, 3];
      root['3'] = 3;
      root['4'] = new Text();
      root['4'].edit(0, 0, 'hi');
      root['5'] = new Text();
      root['5'].edit(0, 0, 'hi');
    }, 'sets 1, 2, 3, 4, 5');
    assert.deepEqual(
      vectorOf([{ c: c1.getID()!, l: 1n }]),
      d1.getVersionVector(),
    );

    assert.equal(d1.getGarbageLen(), 0);
    assert.equal(d2.getGarbageLen(), 0);

    await c1.sync();
    assert.deepEqual(
      d1.getVersionVector(),
      vectorOf([{ c: c1.getID()!, l: 1n }]),
    );

    await c2.sync();
    assert.deepEqual(
      d2.getVersionVector(),
      vectorOf([
        { c: c1.getID()!, l: 1n },
        { c: c2.getID()!, l: 2n },
      ]),
    );

    d1.update((root) => {
      delete root['2'];
      root['4'].edit(0, 1, 'h');
      root['5'].edit(0, 1, 'h', { b: '1' });
    }, 'removes 2 and edit text type elements');
    assert.deepEqual(
      vectorOf([{ c: c1.getID()!, l: 2n }]),
      d1.getVersionVector(),
    );
    assert.equal(d1.getGarbageLen(), 6);
    assert.equal(d2.getGarbageLen(), 0);

    await c1.sync();
    assert.deepEqual(
      vectorOf([{ c: c1.getID()!, l: 2n }]),
      d1.getVersionVector(),
    );
    assert.equal(d1.getGarbageLen(), 6);
    assert.equal(d2.getGarbageLen(), 0);

    await c2.detach(d2);

    await c2.sync();
    assert.equal(d1.getGarbageLen(), 6);
    assert.equal(d2.getGarbageLen(), 6);

    await c1.sync();
    // TODO(JOOHOJANG): we have to consider removing detached client's lamport from version vector
    assert.deepEqual(
      vectorOf([{ c: c1.getID()!, l: 2n }]),
      d1.getVersionVector(),
    );
    assert.equal(d1.getGarbageLen(), 0);
    assert.equal(d2.getGarbageLen(), 6);

    await c1.detach(d1);

    await c1.deactivate();
    await c2.deactivate();
  });

  it('Can collect removed elements from both root and clone', async function ({
    task,
  }) {
    type TestDoc = { point: { x: number; y: number } };
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const doc = new yorkie.Document<TestDoc>(docKey);
    const cli = new yorkie.Client({ rpcAddr: testRPCAddr });
    await cli.activate();

    await cli.attach(doc, { syncMode: SyncMode.Manual });
    assert.deepEqual(vectorOf([]), doc.getVersionVector());
    doc.update((root) => {
      root.point = { x: 0, y: 0 };
    });
    assert.deepEqual(
      vectorOf([{ c: cli.getID()!, l: 1n }]),
      doc.getVersionVector(),
    );
    doc.update((root) => {
      root.point = { x: 1, y: 1 };
    });
    assert.deepEqual(
      vectorOf([{ c: cli.getID()!, l: 2n }]),
      doc.getVersionVector(),
    );
    doc.update((root) => {
      root.point = { x: 2, y: 2 };
    });
    assert.deepEqual(
      vectorOf([{ c: cli.getID()!, l: 3n }]),
      doc.getVersionVector(),
    );
    assert.equal(doc.getGarbageLen(), 6);
    assert.equal(doc.getGarbageLenFromClone(), 6);
  });

  it('Can collect removed elements from both root and clone for nested array', async function ({
    task,
  }) {
    type TestDoc = { list: Array<number | Array<number>> };
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const doc = new yorkie.Document<TestDoc>(docKey);
    const cli = new yorkie.Client({ rpcAddr: testRPCAddr });

    await cli.activate();
    await cli.attach(doc, { syncMode: SyncMode.Manual });
    assert.deepEqual(vectorOf([]), doc.getVersionVector());
    doc.update((root) => {
      root.list = [0, 1, 2];
      root.list.push([3, 4, 5]);
    });
    assert.deepEqual(
      vectorOf([{ c: cli.getID()!, l: 1n }]),
      doc.getVersionVector(),
    );
    assert.equal('{"list":[0,1,2,[3,4,5]]}', doc.toJSON());
    doc.update((root) => {
      delete root.list[1];
    });
    assert.deepEqual(
      vectorOf([{ c: cli.getID()!, l: 2n }]),
      doc.getVersionVector(),
    );
    assert.equal('{"list":[0,2,[3,4,5]]}', doc.toJSON());
    doc.update((root) => {
      delete (root.list[2] as Array<number>)[1];
    });
    assert.deepEqual(
      vectorOf([{ c: cli.getID()!, l: 3n }]),
      doc.getVersionVector(),
    );
    assert.equal('{"list":[0,2,[3,5]]}', doc.toJSON());

    assert.equal(doc.getGarbageLen(), 2);
    assert.equal(doc.getGarbageLenFromClone(), 2);
  });

  it('Can purges removed elements after peers can not access them', async function ({
    task,
  }) {
    type TestDoc = { point: { x: number; y: number } };
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const d1 = new yorkie.Document<TestDoc>(docKey);
    const d2 = new yorkie.Document<TestDoc>(docKey);

    const client1 = new yorkie.Client({ rpcAddr: testRPCAddr });
    const client2 = new yorkie.Client({ rpcAddr: testRPCAddr });

    await client1.activate();
    await client2.activate();

    await client1.attach(d1, { syncMode: SyncMode.Manual });
    assert.deepEqual(vectorOf([]), d1.getVersionVector());
    d1.update((root) => (root.point = { x: 0, y: 0 }));
    assert.deepEqual(
      vectorOf([{ c: client1.getID()!, l: 1n }]),
      d1.getVersionVector(),
    );
    d1.update((root) => (root.point.x = 1));
    assert.deepEqual(
      vectorOf([{ c: client1.getID()!, l: 2n }]),
      d1.getVersionVector(),
    );
    assert.equal(d1.getGarbageLen(), 1);
    await client1.sync();
    assert.equal(d1.getGarbageLen(), 0);
    assert.deepEqual(
      vectorOf([{ c: client1.getID()!, l: 2n }]),
      d1.getVersionVector(),
    );

    await client2.attach(d2, { syncMode: SyncMode.Manual });
    assert.deepEqual(
      vectorOf([
        { c: client1.getID()!, l: 2n },
        { c: client2.getID()!, l: 3n },
      ]),
      d2.getVersionVector(),
    );
    assert.equal(d2.getGarbageLen(), 1);
    d2.update((root) => (root.point.x = 2));
    assert.deepEqual(
      vectorOf([
        { c: client1.getID()!, l: 2n },
        { c: client2.getID()!, l: 4n },
      ]),
      d2.getVersionVector(),
    );
    assert.equal(d2.getGarbageLen(), 2);

    d1.update((root) => (root.point = { x: 3, y: 3 }));
    assert.deepEqual(
      vectorOf([{ c: client1.getID()!, l: 3n }]),
      d1.getVersionVector(),
    );
    assert.equal(d1.getGarbageLen(), 3);
    await client1.sync();
    assert.deepEqual(
      vectorOf([{ c: client1.getID()!, l: 3n }]),
      d1.getVersionVector(),
    );
    assert.equal(d1.getGarbageLen(), 3);

    await client1.sync();
    assert.deepEqual(
      vectorOf([{ c: client1.getID()!, l: 3n }]),
      d1.getVersionVector(),
    );
    assert.equal(d1.getGarbageLen(), 3);

    await client2.sync();
    assert.deepEqual(
      vectorOf([
        { c: client1.getID()!, l: 3n },
        { c: client2.getID()!, l: 5n },
      ]),
      d2.getVersionVector(),
    );
    assert.equal(d1.getGarbageLen(), 3);
    await client1.sync();
    assert.deepEqual(
      vectorOf([
        { c: client1.getID()!, l: 5n },
        { c: client2.getID()!, l: 4n },
      ]),
      d1.getVersionVector(),
    );
    assert.equal(d1.getGarbageLen(), 4);
    await client2.sync();
    assert.equal(d1.getGarbageLen(), 4);
    await client1.sync();
    assert.equal(d1.getGarbageLen(), 0);
    await client2.sync();
    assert.equal(d2.getGarbageLen(), 0);

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
    assert.equal(
      doc.garbageCollect(maxVectorOf([doc.getChangeID().getActorID()])),
      4,
    ); // The number of GC nodes must also be 4.
  });

  it('Should work properly when there are multiple nodes to be collected in text type', async function ({
    task,
  }) {
    type TestDoc = { t: Text };
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const d1 = new yorkie.Document<TestDoc>(docKey);
    const d2 = new yorkie.Document<TestDoc>(docKey);
    const client1 = new yorkie.Client({ rpcAddr: testRPCAddr });
    const client2 = new yorkie.Client({ rpcAddr: testRPCAddr });
    await client1.activate();
    await client2.activate();
    await client1.attach(d1, { syncMode: SyncMode.Manual });
    assert.deepEqual(vectorOf([]), d1.getVersionVector());
    await client2.attach(d2, { syncMode: SyncMode.Manual });
    assert.deepEqual(vectorOf([]), d2.getVersionVector());

    d1.update((root) => {
      root.t = new yorkie.Text();
      root.t.edit(0, 0, 'z');
    });
    assert.deepEqual(
      vectorOf([{ c: client1.getID()!, l: 1n }]),
      d1.getVersionVector(),
    );
    d1.update((root) => {
      root.t.edit(0, 1, 'a');
    });
    assert.deepEqual(
      vectorOf([{ c: client1.getID()!, l: 2n }]),
      d1.getVersionVector(),
    );
    d1.update((root) => {
      root.t.edit(1, 1, 'b');
    });
    assert.deepEqual(
      vectorOf([{ c: client1.getID()!, l: 3n }]),
      d1.getVersionVector(),
    );
    d1.update((root) => {
      root.t.edit(2, 2, 'd');
    });
    assert.deepEqual(
      vectorOf([{ c: client1.getID()!, l: 4n }]),
      d1.getVersionVector(),
    );
    await client1.sync();
    assert.deepEqual(
      vectorOf([{ c: client1.getID()!, l: 4n }]),
      d1.getVersionVector(),
    );
    await client2.sync();
    assert.deepEqual(
      vectorOf([
        { c: client1.getID()!, l: 4n },
        { c: client2.getID()!, l: 5n },
      ]),
      d2.getVersionVector(),
    );
    assert.equal(d1.getRoot().t.toString(), 'abd');
    assert.equal(d2.getRoot().t.toString(), 'abd');
    assert.equal(d1.getGarbageLen(), 1); // z

    d1.update((root) => {
      root.t.edit(2, 2, 'c');
    });
    assert.deepEqual(
      vectorOf([{ c: client1.getID()!, l: 5n }]),
      d1.getVersionVector(),
    );
    await client1.sync();
    assert.deepEqual(
      vectorOf([{ c: client1.getID()!, l: 5n }]),
      d1.getVersionVector(),
    );
    await client2.sync();
    assert.deepEqual(
      vectorOf([
        { c: client1.getID()!, l: 5n },
        { c: client2.getID()!, l: 6n },
      ]),
      d2.getVersionVector(),
    );
    await client1.sync();
    assert.deepEqual(
      vectorOf([{ c: client1.getID()!, l: 5n }]),
      d1.getVersionVector(),
    );

    assert.equal(d1.getRoot().t.toString(), 'abcd');
    assert.equal(d2.getRoot().t.toString(), 'abcd');

    d1.update((root) => {
      root.t.edit(1, 3, '');
    });
    assert.deepEqual(
      vectorOf([{ c: client1.getID()!, l: 6n }]),
      d1.getVersionVector(),
    );
    await client1.sync();
    assert.deepEqual(
      vectorOf([{ c: client1.getID()!, l: 6n }]),
      d1.getVersionVector(),
    );
    assert.equal(d1.getRoot().t.toString(), 'ad');
    assert.equal(d1.getGarbageLen(), 2); // b,c

    await client2.sync();
    assert.deepEqual(
      vectorOf([
        { c: client1.getID()!, l: 6n },
        { c: client2.getID()!, l: 7n },
      ]),
      d2.getVersionVector(),
    );
    await client1.sync();
    assert.deepEqual(
      vectorOf([{ c: client1.getID()!, l: 6n }]),
      d1.getVersionVector(),
    );
    await client2.sync();
    assert.equal(d2.getGarbageLen(), 0);
    assert.equal(d2.getRoot().t.toString(), 'ad');
    await client1.sync();
    assert.equal(d1.getGarbageLen(), 0);

    await client1.deactivate();
    await client2.deactivate();
  });

  it('Should work properly when there are multiple nodes to be collected in tree type', async function ({
    task,
  }) {
    type TestDoc = { t: Tree };
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const d1 = new yorkie.Document<TestDoc>(docKey);
    const d2 = new yorkie.Document<TestDoc>(docKey);
    const client1 = new yorkie.Client({ rpcAddr: testRPCAddr });
    const client2 = new yorkie.Client({ rpcAddr: testRPCAddr });
    await client1.activate();
    await client2.activate();
    await client1.attach(d1, { syncMode: SyncMode.Manual });
    assert.deepEqual(vectorOf([]), d1.getVersionVector());
    await client2.attach(d2, { syncMode: SyncMode.Manual });
    assert.deepEqual(vectorOf([]), d2.getVersionVector());

    d1.update((root) => {
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
    assert.deepEqual(
      vectorOf([{ c: client1.getID()!, l: 1n }]),
      d1.getVersionVector(),
    );
    d1.update((root) => {
      root.t.editByPath([0], [1], {
        type: 'text',
        value: 'a',
      });
    });
    assert.deepEqual(
      vectorOf([{ c: client1.getID()!, l: 2n }]),
      d1.getVersionVector(),
    );
    d1.update((root) => {
      root.t.editByPath([1], [1], {
        type: 'text',
        value: 'b',
      });
    });
    assert.deepEqual(
      vectorOf([{ c: client1.getID()!, l: 3n }]),
      d1.getVersionVector(),
    );
    d1.update((root) => {
      root.t.editByPath([2], [2], {
        type: 'text',
        value: 'd',
      });
    });
    assert.deepEqual(
      vectorOf([{ c: client1.getID()!, l: 4n }]),
      d1.getVersionVector(),
    );
    await client1.sync();
    assert.deepEqual(
      vectorOf([{ c: client1.getID()!, l: 4n }]),
      d1.getVersionVector(),
    );
    await client2.sync();
    assert.deepEqual(
      vectorOf([
        { c: client1.getID()!, l: 4n },
        { c: client2.getID()!, l: 5n },
      ]),
      d2.getVersionVector(),
    );
    assert.equal(d1.getRoot().t.toXML(), '<r>abd</r>');
    assert.equal(d2.getRoot().t.toXML(), '<r>abd</r>');
    assert.equal(d1.getGarbageLen(), 1); // z

    d1.update((root) => {
      root.t.editByPath([2], [2], {
        type: 'text',
        value: 'c',
      });
    });
    assert.deepEqual(
      vectorOf([{ c: client1.getID()!, l: 5n }]),
      d1.getVersionVector(),
    );
    await client1.sync();
    assert.deepEqual(
      vectorOf([{ c: client1.getID()!, l: 5n }]),
      d1.getVersionVector(),
    );
    await client2.sync();
    assert.deepEqual(
      vectorOf([
        { c: client1.getID()!, l: 5n },
        { c: client2.getID()!, l: 6n },
      ]),
      d2.getVersionVector(),
    );
    assert.equal(d1.getRoot().t.toXML(), '<r>abcd</r>');
    assert.equal(d2.getRoot().t.toXML(), '<r>abcd</r>');

    d1.update((root) => {
      root.t.editByPath([1], [3]);
    });
    assert.deepEqual(
      vectorOf([{ c: client1.getID()!, l: 6n }]),
      d1.getVersionVector(),
    );
    await client1.sync();
    assert.deepEqual(
      vectorOf([{ c: client1.getID()!, l: 6n }]),
      d1.getVersionVector(),
    );
    assert.equal(d1.getRoot().t.toXML(), '<r>ad</r>');
    assert.equal(d1.getGarbageLen(), 2); // b,c

    await client2.sync();
    assert.deepEqual(
      vectorOf([
        { c: client1.getID()!, l: 6n },
        { c: client2.getID()!, l: 7n },
      ]),
      d2.getVersionVector(),
    );
    await client1.sync();
    assert.deepEqual(
      vectorOf([{ c: client1.getID()!, l: 6n }]),
      d1.getVersionVector(),
    );
    assert.equal(d2.getRoot().t.toXML(), '<r>ad</r>');
    assert.equal(d1.getGarbageLen(), 2);

    await client2.sync();
    assert.deepEqual(
      vectorOf([
        { c: client1.getID()!, l: 6n },
        { c: client2.getID()!, l: 7n },
      ]),
      d2.getVersionVector(),
    );
    assert.equal(d2.getRoot().t.toXML(), '<r>ad</r>');
    assert.equal(d2.getGarbageLen(), 0);

    await client1.sync();
    assert.deepEqual(
      vectorOf([{ c: client1.getID()!, l: 6n }]),
      d1.getVersionVector(),
    );
    assert.equal(d1.getRoot().t.toXML(), '<r>ad</r>');
    assert.equal(d1.getGarbageLen(), 0);

    await client1.deactivate();
    await client2.deactivate();
  });

  it('concurrent garbage collection test', async function ({ task }) {
    type TestDoc = { t: Text };
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const d1 = new yorkie.Document<TestDoc>(docKey);
    const d2 = new yorkie.Document<TestDoc>(docKey);
    const client1 = new yorkie.Client({ rpcAddr: testRPCAddr });
    const client2 = new yorkie.Client({ rpcAddr: testRPCAddr });
    await client1.activate();
    await client2.activate();

    await client1.attach(d1, { syncMode: SyncMode.Manual });
    assert.deepEqual(vectorOf([]), d1.getVersionVector());

    await client2.attach(d2, { syncMode: SyncMode.Manual });
    assert.deepEqual(vectorOf([]), d2.getVersionVector());

    d1.update((root) => {
      root.t = new Text();
      root.t.edit(0, 0, 'a');
      root.t.edit(1, 1, 'b');
      root.t.edit(2, 2, 'c');
    }, 'sets text');
    assert.deepEqual(
      vectorOf([{ c: client1.getID()!, l: 1n }]),
      d1.getVersionVector(),
    );

    await client1.sync();
    assert.deepEqual(
      vectorOf([{ c: client1.getID()!, l: 1n }]),
      d1.getVersionVector(),
    );

    await client2.sync();
    assert.deepEqual(
      vectorOf([
        { c: client1.getID()!, l: 1n },
        { c: client2.getID()!, l: 2n },
      ]),
      d2.getVersionVector(),
    );

    d2.update((root) => {
      root.t.edit(2, 2, 'c');
    }, 'insert c');
    assert.deepEqual(
      vectorOf([
        { c: client1.getID()!, l: 1n },
        { c: client2.getID()!, l: 3n },
      ]),
      d2.getVersionVector(),
    );

    d1.update((root) => {
      root.t.edit(1, 3, '');
    }, 'delete bd');
    assert.deepEqual(
      vectorOf([{ c: client1.getID()!, l: 2n }]),
      d1.getVersionVector(),
    );

    assert.equal(d1.getGarbageLen(), 2);
    assert.equal(d2.getGarbageLen(), 0);

    await client1.sync();
    assert.deepEqual(
      vectorOf([{ c: client1.getID()!, l: 2n }]),
      d1.getVersionVector(),
    );

    await client2.sync();
    assert.deepEqual(
      vectorOf([
        { c: client1.getID()!, l: 2n },
        { c: client2.getID()!, l: 4n },
      ]),
      d2.getVersionVector(),
    );

    assert.equal(d1.getGarbageLen(), 2);
    assert.equal(d2.getGarbageLen(), 2);

    d2.update((root) => {
      root.t.edit(2, 2, '1');
    }, 'insert 1');
    assert.deepEqual(
      vectorOf([
        { c: client1.getID()!, l: 2n },
        { c: client2.getID()!, l: 5n },
      ]),
      d2.getVersionVector(),
    );

    await client2.sync();
    assert.deepEqual(
      vectorOf([
        { c: client1.getID()!, l: 2n },
        { c: client2.getID()!, l: 5n },
      ]),
      d2.getVersionVector(),
    );

    assert.equal(d1.getGarbageLen(), 2);
    assert.equal(d2.getGarbageLen(), 0);

    await client1.sync();
    assert.deepEqual(
      vectorOf([
        { c: client1.getID()!, l: 6n },
        { c: client2.getID()!, l: 5n },
      ]),
      d1.getVersionVector(),
    );

    assert.equal(d1.getGarbageLen(), 0);
    assert.equal(d2.getGarbageLen(), 0);

    await client1.deactivate();
    await client2.deactivate();
  });

  it('concurrent garbage collection test(with pushonly)', async function ({
    task,
  }) {
    type TestDoc = { t: Text };
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const d1 = new yorkie.Document<TestDoc>(docKey);
    const d2 = new yorkie.Document<TestDoc>(docKey);
    const c1 = new yorkie.Client({ rpcAddr: testRPCAddr });
    const c2 = new yorkie.Client({ rpcAddr: testRPCAddr });
    await c1.activate();
    await c2.activate();

    await c1.attach(d1, { syncMode: SyncMode.Manual });
    assert.deepEqual(vectorOf([]), d1.getVersionVector());

    await c2.attach(d2, { syncMode: SyncMode.Manual });
    assert.deepEqual(vectorOf([]), d2.getVersionVector());

    // d1/vv = [c1:1]
    d1.update((root) => {
      root.t = new Text();
      root.t.edit(0, 0, 'a');
      root.t.edit(1, 1, 'b');
    }, 'insert ab');
    assert.deepEqual(
      vectorOf([{ c: c1.getID()!, l: 1n }]),
      d1.getVersionVector(),
    );

    await c1.sync();
    assert.deepEqual(
      vectorOf([{ c: c1.getID()!, l: 1n }]),
      d1.getVersionVector(),
    );

    await c2.sync();
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 1n },
        { c: c2.getID()!, l: 2n },
      ]),
      d2.getVersionVector(),
    );

    // d2/vv = [c1:1, c2:3]
    d2.update((root) => {
      root.t.edit(2, 2, 'd');
    }, 'insert d');
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 1n },
        { c: c2.getID()!, l: 3n },
      ]),
      d2.getVersionVector(),
    );

    await c2.sync();
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 1n },
        { c: c2.getID()!, l: 3n },
      ]),
      d2.getVersionVector(),
    );

    await c1.sync();
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 4n },
        { c: c2.getID()!, l: 3n },
      ]),
      d1.getVersionVector(),
    );

    // d2/vv = [c1:1, c2:4]
    d2.update((root) => {
      root.t.edit(2, 2, 'c');
    }, 'insert c');
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 1n },
        { c: c2.getID()!, l: 4n },
      ]),
      d2.getVersionVector(),
    );

    // c1/vv = [c1:5, c2:3]
    d1.update((root) => {
      root.t.edit(1, 3, '');
    }, 'remove ac');
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 5n },
        { c: c2.getID()!, l: 3n },
      ]),
      d1.getVersionVector(),
    );

    // Sync with PushOnly
    await c2.changeSyncMode(d2, SyncMode.RealtimePushOnly);
    await c2.sync();
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 1n },
        { c: c2.getID()!, l: 4n },
      ]),
      d2.getVersionVector(),
    );

    await c1.sync();
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 6n },
        { c: c2.getID()!, l: 4n },
      ]),
      d1.getVersionVector(),
    );

    // d2/vv = [c1:1, c2:5]
    d2.update((root) => {
      root.t.edit(2, 2, '1');
    }, 'insert 1 (pushonly)');
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 1n },
        { c: c2.getID()!, l: 5n },
      ]),
      d2.getVersionVector(),
    );

    await c2.sync();
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 1n },
        { c: c2.getID()!, l: 5n },
      ]),
      d2.getVersionVector(),
    );

    await c1.sync();
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 7n },
        { c: c2.getID()!, l: 5n },
      ]),
      d1.getVersionVector(),
    );

    assert.equal(d1.getGarbageLen(), 2);
    assert.equal(d2.getGarbageLen(), 0);

    // c2/vv = [c1:1, c2:6]
    d2.update((root) => {
      root.t.edit(2, 2, '2');
    }, 'insert 2 (pushonly)');
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 1n },
        { c: c2.getID()!, l: 6n },
      ]),
      d2.getVersionVector(),
    );

    await c2.sync();
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 1n },
        { c: c2.getID()!, l: 6n },
      ]),
      d2.getVersionVector(),
    );

    await c2.changeSyncMode(d2, SyncMode.Manual);
    await c2.sync();
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 5n },
        { c: c2.getID()!, l: 7n },
      ]),
      d2.getVersionVector(),
    );

    await c1.sync();
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 8n },
        { c: c2.getID()!, l: 6n },
      ]),
      d1.getVersionVector(),
    );

    assert.equal(d1.getGarbageLen(), 2);
    assert.equal(d2.getGarbageLen(), 2);

    await c2.sync();
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 5n },
        { c: c2.getID()!, l: 7n },
      ]),
      d2.getVersionVector(),
    );

    assert.equal(d1.getGarbageLen(), 2);
    assert.equal(d2.getGarbageLen(), 0);

    await c1.sync();
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 8n },
        { c: c2.getID()!, l: 6n },
      ]),
      d1.getVersionVector(),
    );

    assert.equal(d1.getGarbageLen(), 0);
    assert.equal(d2.getGarbageLen(), 0);

    await c1.deactivate();
    await c2.deactivate();
  });

  it('gc targeting nodes made by deactivated client', async function ({
    task,
  }) {
    type TestDoc = { t: Text };
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const d1 = new yorkie.Document<TestDoc>(docKey);
    const d2 = new yorkie.Document<TestDoc>(docKey);
    const c1 = new yorkie.Client({ rpcAddr: testRPCAddr });
    const c2 = new yorkie.Client({ rpcAddr: testRPCAddr });
    await c1.activate();
    await c2.activate();

    await c1.attach(d1, { syncMode: SyncMode.Manual });
    assert.deepEqual(vectorOf([]), d1.getVersionVector());

    await c2.attach(d2, { syncMode: SyncMode.Manual });
    assert.deepEqual(vectorOf([]), d2.getVersionVector());

    d1.update((root) => {
      root.t = new Text();
      root.t.edit(0, 0, 'a');
      root.t.edit(1, 1, 'b');
      root.t.edit(2, 2, 'c');
    }, 'sets text');
    assert.deepEqual(
      vectorOf([{ c: c1.getID()!, l: 1n }]),
      d1.getVersionVector(),
    );

    await c1.sync();
    assert.deepEqual(
      vectorOf([{ c: c1.getID()!, l: 1n }]),
      d1.getVersionVector(),
    );

    await c2.sync();
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 1n },
        { c: c2.getID()!, l: 2n },
      ]),
      d2.getVersionVector(),
    );

    d2.update((root) => {
      root.t.edit(2, 2, 'c');
    }, 'insert c');
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 1n },
        { c: c2.getID()!, l: 3n },
      ]),
      d2.getVersionVector(),
    );

    d1.update((root) => {
      root.t.edit(1, 3, '');
    }, 'delete bd');
    assert.deepEqual(
      vectorOf([{ c: c1.getID()!, l: 2n }]),
      d1.getVersionVector(),
    );

    await c1.sync();
    await c2.sync();

    await c1.deactivate();
    assert.equal(d2.getGarbageLen(), 2);
    assert.equal(d2.getVersionVector().size(), 2);

    await c2.sync();
    assert.equal(d2.getGarbageLen(), 0);
    // TODO(JOOHOJANG): we have to consider removing detached client's lamport from version vector
    assert.equal(d2.getVersionVector().size(), 2);
  });

  it('attach > pushpull > detach lifecycle version vector test (run gc at last client detaches document, but no tombstone exsits)', async function ({
    task,
  }) {
    type TestDoc = { t: Text };
    const docKey = toDocKey(`${new Date().getTime()}-${task.name}`);
    const d1 = new yorkie.Document<TestDoc>(docKey);
    const d2 = new yorkie.Document<TestDoc>(docKey);
    const c1 = new yorkie.Client({ rpcAddr: testRPCAddr });
    const c2 = new yorkie.Client({ rpcAddr: testRPCAddr });
    await c1.activate();
    await c2.activate();

    await c1.attach(d1, { syncMode: SyncMode.Manual });
    assert.deepEqual(vectorOf([]), d1.getVersionVector());

    await c2.attach(d2, { syncMode: SyncMode.Manual });
    assert.deepEqual(vectorOf([]), d2.getVersionVector());

    d1.update((root) => {
      root.t = new Text();
      root.t.edit(0, 0, 'a');
      root.t.edit(1, 1, 'b');
      root.t.edit(2, 2, 'c');
    }, 'sets text');
    assert.deepEqual(
      vectorOf([{ c: c1.getID()!, l: 1n }]),
      d1.getVersionVector(),
    );

    await c1.sync();
    assert.deepEqual(
      vectorOf([{ c: c1.getID()!, l: 1n }]),
      d1.getVersionVector(),
    );

    await c2.sync();
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 1n },
        { c: c2.getID()!, l: 2n },
      ]),
      d2.getVersionVector(),
    );

    d2.update((root) => {
      root.t.edit(2, 2, 'c');
    }, 'insert c');
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 1n },
        { c: c2.getID()!, l: 3n },
      ]),
      d2.getVersionVector(),
    );

    d1.update((root) => {
      root.t.edit(1, 3, '');
    }, 'delete bd');
    assert.deepEqual(
      vectorOf([{ c: c1.getID()!, l: 2n }]),
      d1.getVersionVector(),
    );

    assert.equal(d1.getGarbageLen(), 2);
    assert.equal(d2.getGarbageLen(), 0);

    await c1.sync();
    assert.deepEqual(
      vectorOf([{ c: c1.getID()!, l: 2n }]),
      d1.getVersionVector(),
    );

    await c2.sync();
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 2n },
        { c: c2.getID()!, l: 4n },
      ]),
      d2.getVersionVector(),
    );

    assert.equal(d1.getGarbageLen(), 2);
    assert.equal(d2.getGarbageLen(), 2);

    d2.update((root) => {
      root.t.edit(2, 2, '1');
    }, 'insert 1');
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 2n },
        { c: c2.getID()!, l: 5n },
      ]),
      d2.getVersionVector(),
    );

    await c2.sync();
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 2n },
        { c: c2.getID()!, l: 5n },
      ]),
      d2.getVersionVector(),
    );

    assert.equal(d1.getGarbageLen(), 2);
    assert.equal(d2.getGarbageLen(), 0);

    await c1.sync();
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 6n },
        { c: c2.getID()!, l: 5n },
      ]),
      d1.getVersionVector(),
    );

    await c1.detach(d1);
    await c2.sync();
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 2n },
        { c: c2.getID()!, l: 5n },
      ]),
      d2.getVersionVector(),
    );

    d2.update((root) => {
      root.t.edit(0, 3, '');
    }, 'delete all');
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 2n },
        { c: c2.getID()!, l: 6n },
      ]),
      d2.getVersionVector(),
    );
    assert.equal(d2.getGarbageLen(), 3);
    await c2.sync();
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 2n },
        { c: c2.getID()!, l: 6n },
      ]),
      d2.getVersionVector(),
    );
    assert.equal(d2.getGarbageLen(), 0);
    await c2.detach(d2);

    await c1.deactivate();
    await c2.deactivate();
  });

  it('attach > pushpull > detach lifecycle version vector test (run gc at last client detaches document)', async function ({
    task,
  }) {
    type TestDoc = { t: Text };
    const docKey = toDocKey(`${new Date().getTime()}-${task.name}`);
    const d1 = new yorkie.Document<TestDoc>(docKey);
    const d2 = new yorkie.Document<TestDoc>(docKey);
    const c1 = new yorkie.Client({ rpcAddr: testRPCAddr });
    const client2 = new yorkie.Client({ rpcAddr: testRPCAddr });
    await c1.activate();
    await client2.activate();

    await c1.attach(d1, { syncMode: SyncMode.Manual });
    assert.deepEqual(vectorOf([]), d1.getVersionVector());

    await client2.attach(d2, { syncMode: SyncMode.Manual });
    assert.deepEqual(vectorOf([]), d2.getVersionVector());

    d1.update((root) => {
      root.t = new Text();
      root.t.edit(0, 0, 'a');
      root.t.edit(1, 1, 'b');
      root.t.edit(2, 2, 'c');
    }, 'sets text');
    assert.deepEqual(
      vectorOf([{ c: c1.getID()!, l: 1n }]),
      d1.getVersionVector(),
    );

    await c1.sync();
    assert.deepEqual(
      vectorOf([{ c: c1.getID()!, l: 1n }]),
      d1.getVersionVector(),
    );

    await client2.sync();
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 1n },
        { c: client2.getID()!, l: 2n },
      ]),
      d2.getVersionVector(),
    );

    d2.update((root) => {
      root.t.edit(2, 2, 'c');
    }, 'insert c');
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 1n },
        { c: client2.getID()!, l: 3n },
      ]),
      d2.getVersionVector(),
    );

    d1.update((root) => {
      root.t.edit(1, 3, '');
    }, 'delete bd');
    assert.deepEqual(
      vectorOf([{ c: c1.getID()!, l: 2n }]),
      d1.getVersionVector(),
    );

    assert.equal(d1.getGarbageLen(), 2);
    assert.equal(d2.getGarbageLen(), 0);

    await c1.sync();
    assert.deepEqual(
      vectorOf([{ c: c1.getID()!, l: 2n }]),
      d1.getVersionVector(),
    );

    await client2.sync();
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 2n },
        { c: client2.getID()!, l: 4n },
      ]),
      d2.getVersionVector(),
    );

    assert.equal(d1.getGarbageLen(), 2);
    assert.equal(d2.getGarbageLen(), 2);

    d2.update((root) => {
      root.t.edit(2, 2, '1');
    }, 'insert 1');
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 2n },
        { c: client2.getID()!, l: 5n },
      ]),
      d2.getVersionVector(),
    );

    await client2.sync();
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 2n },
        { c: client2.getID()!, l: 5n },
      ]),
      d2.getVersionVector(),
    );

    assert.equal(d1.getGarbageLen(), 2);
    assert.equal(d2.getGarbageLen(), 0);

    await c1.sync();
    // TODO(JOOHOJANG): we have to consider removing detached client's lamport from version vector
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 6n },
        { c: client2.getID()!, l: 5n },
      ]),
      d1.getVersionVector(),
    );

    await c1.detach(d1);
    await client2.sync();
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 2n },
        { c: client2.getID()!, l: 5n },
      ]),
      d2.getVersionVector(),
    );

    d2.update((root) => {
      root.t.edit(0, 3, '');
    }, 'delete all');
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 2n },
        { c: client2.getID()!, l: 6n },
      ]),
      d2.getVersionVector(),
    );
    assert.equal(d2.getGarbageLen(), 3);
    await client2.detach(d2);
    assert.equal(d2.getGarbageLen(), 0);

    await c1.deactivate();
    await client2.deactivate();
  });

  it('detach gc test', async function ({ task }) {
    type TestDoc = { t: Text };
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const d1 = new yorkie.Document<TestDoc>(docKey);
    const d2 = new yorkie.Document<TestDoc>(docKey);
    const d3 = new yorkie.Document<TestDoc>(docKey);
    const c1 = new yorkie.Client({ rpcAddr: testRPCAddr });
    const c2 = new yorkie.Client({ rpcAddr: testRPCAddr });
    const c3 = new yorkie.Client({ rpcAddr: testRPCAddr });
    await c1.activate();
    await c2.activate();
    await c3.activate();

    await c1.attach(d1, { syncMode: SyncMode.Manual });
    await c2.attach(d2, { syncMode: SyncMode.Manual });
    await c3.attach(d3, { syncMode: SyncMode.Manual });

    await c1.sync();
    await c2.sync();
    await c3.sync();

    assert.deepEqual(vectorOf([]), d1.getVersionVector());
    assert.deepEqual(vectorOf([]), d2.getVersionVector());
    assert.deepEqual(vectorOf([]), d3.getVersionVector());

    d1.update((root) => {
      root.t = new Text();
      root.t.edit(0, 0, 'a');
      root.t.edit(1, 1, 'b');
      root.t.edit(2, 2, 'c');
    }, 'sets text');

    await c1.sync();
    await c2.sync();
    await c3.sync();

    assert.deepEqual(
      vectorOf([{ c: c1.getID()!, l: 1n }]),
      d1.getVersionVector(),
    );
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 1n },
        { c: c2.getID()!, l: 2n },
      ]),
      d2.getVersionVector(),
    );
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 1n },
        { c: c3.getID()!, l: 2n },
      ]),
      d3.getVersionVector(),
    );

    d3.update((root) => {
      root.t.edit(1, 3, '');
    });

    d1.update((root) => {
      root.t.edit(0, 0, '1');
    });
    d1.update((root) => {
      root.t.edit(0, 0, '2');
    });
    d1.update((root) => {
      root.t.edit(0, 0, '3');
    });
    d2.update((root) => {
      root.t.edit(3, 3, 'x');
    });
    d2.update((root) => {
      root.t.edit(4, 4, 'y');
    });

    await c1.sync();
    await c2.sync();
    await c1.sync();
    assert.equal(
      d1.toJSON(),
      '{"t":[{"val":"3"},{"val":"2"},{"val":"1"},{"val":"a"},{"val":"b"},{"val":"c"},{"val":"x"},{"val":"y"}]}',
    );
    assert.equal(
      d2.toJSON(),
      '{"t":[{"val":"3"},{"val":"2"},{"val":"1"},{"val":"a"},{"val":"b"},{"val":"c"},{"val":"x"},{"val":"y"}]}',
    );

    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 6n },
        { c: c2.getID()!, l: 4n },
      ]),
      d1.getVersionVector(),
    );
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 4n },
        { c: c2.getID()!, l: 7n },
      ]),
      d2.getVersionVector(),
    );
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 1n },
        { c: c3.getID()!, l: 3n },
      ]),
      d3.getVersionVector(),
    );

    await c3.detach(d3);
    d2.update((root) => {
      root.t.edit(5, 5, 'z');
    });

    await c1.sync();
    assert.equal(d1.getGarbageLen(), 2);
    await c1.sync();
    assert.equal(d1.getGarbageLen(), 2);

    await c2.sync();
    await c1.sync();

    // TODO(JOOHOJANG): we have to consider removing detached client's lamport from version vector
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 9n },
        { c: c2.getID()!, l: 8n },
        { c: c3.getID()!, l: 3n },
      ]),
      d1.getVersionVector(),
    );
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 4n },
        { c: c2.getID()!, l: 9n },
        { c: c3.getID()!, l: 3n },
      ]),
      d2.getVersionVector(),
    );
    assert.equal(
      d1.toJSON(),
      '{"t":[{"val":"3"},{"val":"2"},{"val":"1"},{"val":"a"},{"val":"z"},{"val":"x"},{"val":"y"}]}',
    );
    assert.equal(
      d2.toJSON(),
      '{"t":[{"val":"3"},{"val":"2"},{"val":"1"},{"val":"a"},{"val":"z"},{"val":"x"},{"val":"y"}]}',
    );
    assert.equal(d1.getGarbageLen(), 2);
    assert.equal(d2.getGarbageLen(), 2);
    await c2.sync();
    await c1.sync();
    assert.equal(d1.getGarbageLen(), 0);
    assert.equal(d2.getGarbageLen(), 0);

    await c1.deactivate();
    await c2.deactivate();
    await c3.deactivate();
  });

  it('snapshot version vector test', async function ({ task }) {
    type TestDoc = { t: Text };
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const d1 = new yorkie.Document<TestDoc>(docKey);
    const d2 = new yorkie.Document<TestDoc>(docKey);
    const d3 = new yorkie.Document<TestDoc>(docKey);
    const c1 = new yorkie.Client({ rpcAddr: testRPCAddr });
    const c2 = new yorkie.Client({ rpcAddr: testRPCAddr });
    const c3 = new yorkie.Client({ rpcAddr: testRPCAddr });
    await c1.activate();
    await c2.activate();
    await c3.activate();

    await c1.attach(d1, { syncMode: SyncMode.Manual });
    await c2.attach(d2, { syncMode: SyncMode.Manual });
    await c3.attach(d3, { syncMode: SyncMode.Manual });

    d1.update((root) => {
      root.t = new Text();
      root.t.edit(0, 0, 'a');
    }, 'sets text');

    await c1.sync();
    await c2.sync();
    await c3.sync();

    assert.deepEqual(
      vectorOf([{ c: c1.getID()!, l: 1n }]),
      d1.getVersionVector(),
    );
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 1n },
        { c: c2.getID()!, l: 2n },
      ]),
      d2.getVersionVector(),
    );
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 1n },
        { c: c3.getID()!, l: 2n },
      ]),
      d3.getVersionVector(),
    );

    // 01. Updates changes over snapshot threshold.
    for (let idx = 0; idx < DefaultSnapshotThreshold / 2; idx++) {
      d1.update((root) => {
        root.t.edit(0, 0, `${idx % 10}`);
      });
      await c1.sync();
      await c2.sync();

      d2.update((root) => {
        root.t.edit(0, 0, `${idx % 10}`);
      });
      await c2.sync();
      await c1.sync();
    }

    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 1001n },
        { c: c2.getID()!, l: 1000n },
      ]),
      d1.getVersionVector(),
    );
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 998n },
        { c: c2.getID()!, l: 1000n },
      ]),
      d2.getVersionVector(),
    );
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 1n },
        { c: c3.getID()!, l: 2n },
      ]),
      d3.getVersionVector(),
    );

    // 02. Makes local changes then pull a snapshot from the server.
    d3.update((root) => {
      root.t.edit(0, 0, 'c');
    });
    await c3.sync();
    assert.deepEqual(
      vectorOf([
        { c: c1.getID()!, l: 998n },
        { c: c2.getID()!, l: 1000n },
        { c: c3.getID()!, l: 1003n },
      ]),
      d3.getVersionVector(),
    );
    assert.equal(
      DefaultSnapshotThreshold + 2,
      d3.getRoot().t.toString().length,
    );

    // 03. Delete text after receiving the snapshot.
    d3.update((root) => {
      root.t.edit(1, 3, '');
    });
    assert.equal(DefaultSnapshotThreshold, d3.getRoot().t.toString().length);
    await c3.sync();
    await c2.sync();
    await c1.sync();
    assert.equal(DefaultSnapshotThreshold, d2.getRoot().t.toString().length);
    assert.equal(DefaultSnapshotThreshold, d1.getRoot().t.toString().length);

    await c1.deactivate();
    await c2.deactivate();
    await c3.deactivate();
  }, 50000);
});
