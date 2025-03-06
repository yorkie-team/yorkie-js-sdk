import { describe, it, assert } from 'vitest';
import yorkie, { Text, Tree, SyncMode } from '@yorkie-js/sdk/src/yorkie';
import {
  testRPCAddr,
  toDocKey,
} from '@yorkie-js/sdk/test/integration/integration_helper';
import {
  MaxVersionVector,
  versionVectorHelper,
  DefaultSnapshotThreshold,
} from '../helper/helper';

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
    assert.equal(
      doc1.garbageCollect(
        MaxVersionVector([client1.getID()!, client2.getID()!]),
      ),
      gcNodeLen,
    );
    assert.equal(
      doc2.garbageCollect(
        MaxVersionVector([client1.getID()!, client2.getID()!]),
      ),
      gcNodeLen,
    );

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
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(1) },
      ]),
      true,
    );
    await client2.attach(doc2, { syncMode: SyncMode.Manual });
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(1) },
        { actor: client2.getID()!, lamport: BigInt(2) },
      ]),
      true,
    );

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
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(2) },
      ]),
      true,
    );

    assert.equal(doc1.getGarbageLen(), 0);
    assert.equal(doc2.getGarbageLen(), 0);

    await client1.sync();
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(3) },
        { actor: client2.getID()!, lamport: BigInt(1) },
      ]),
      true,
    );

    await client2.sync();
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(2) },
        { actor: client2.getID()!, lamport: BigInt(3) },
      ]),
      true,
    );

    doc2.update((root) => {
      root.t.editByPath([0, 0, 0], [0, 0, 2], { type: 'text', value: 'gh' });
    }, 'removes 2');
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(2) },
        { actor: client2.getID()!, lamport: BigInt(4) },
      ]),
      true,
    );
    assert.equal(doc1.getGarbageLen(), 0);
    assert.equal(doc2.getGarbageLen(), 2);

    // (1, 1) -> (1, 2): syncedseqs:(0, 1)
    await client2.sync();
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(2) },
        { actor: client2.getID()!, lamport: BigInt(4) },
      ]),
      true,
    );
    assert.equal(doc1.getGarbageLen(), 0);
    assert.equal(doc2.getGarbageLen(), 2);

    await client1.sync();
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(5) },
        { actor: client2.getID()!, lamport: BigInt(4) },
      ]),
      true,
    );
    assert.equal(doc1.getGarbageLen(), 2);
    assert.equal(doc2.getGarbageLen(), 2);

    await client2.sync();
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(2) },
        { actor: client2.getID()!, lamport: BigInt(4) },
      ]),
      true,
    );
    assert.equal(doc1.getGarbageLen(), 2);
    assert.equal(doc2.getGarbageLen(), 2);

    await client1.sync();
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(5) },
        { actor: client2.getID()!, lamport: BigInt(4) },
      ]),
      true,
    );
    assert.equal(doc1.getGarbageLen(), 0);
    assert.equal(doc2.getGarbageLen(), 2);

    await client2.sync();
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(2) },
        { actor: client2.getID()!, lamport: BigInt(4) },
      ]),
      true,
    );
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
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(1) },
      ]),
      true,
    );
    await client2.attach(doc2, { syncMode: SyncMode.Manual });
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(1) },
        { actor: client2.getID()!, lamport: BigInt(2) },
      ]),
      true,
    );

    doc1.update((root) => {
      root['1'] = 1;
      root['2'] = [1, 2, 3];
      root['3'] = 3;
    }, 'sets 1, 2, 3');
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(2) },
      ]),
      true,
    );

    assert.equal(doc1.getGarbageLen(), 0);
    assert.equal(doc2.getGarbageLen(), 0);

    await client1.sync();
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(3) },
        { actor: client2.getID()!, lamport: BigInt(1) },
      ]),
      true,
    );

    await client2.sync();
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(2) },
        { actor: client2.getID()!, lamport: BigInt(3) },
      ]),
      true,
    );

    doc2.update((root) => {
      delete root['2'];
    }, 'removes 2');
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(2) },
        { actor: client2.getID()!, lamport: BigInt(4) },
      ]),
      true,
    );
    assert.equal(doc1.getGarbageLen(), 0);
    assert.equal(doc2.getGarbageLen(), 4);

    await client2.sync();
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(2) },
        { actor: client2.getID()!, lamport: BigInt(4) },
      ]),
      true,
    );
    assert.equal(doc1.getGarbageLen(), 0);
    assert.equal(doc2.getGarbageLen(), 4);

    await client1.sync();
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(5) },
        { actor: client2.getID()!, lamport: BigInt(4) },
      ]),
      true,
    );
    assert.equal(doc1.getGarbageLen(), 4);
    assert.equal(doc2.getGarbageLen(), 4);

    await client2.sync();
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(2) },
        { actor: client2.getID()!, lamport: BigInt(4) },
      ]),
      true,
    );
    assert.equal(doc1.getGarbageLen(), 4);
    assert.equal(doc2.getGarbageLen(), 4);

    await client1.sync();
    await client1.sync();
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(5) },
        { actor: client2.getID()!, lamport: BigInt(4) },
      ]),
      true,
    );
    assert.equal(doc1.getGarbageLen(), 0);
    assert.equal(doc2.getGarbageLen(), 4);

    await client2.sync();
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(2) },
        { actor: client2.getID()!, lamport: BigInt(4) },
      ]),
      true,
    );
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
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(1) },
      ]),
      true,
    );
    await client2.attach(doc2, { syncMode: SyncMode.Manual });
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(1) },
        { actor: client2.getID()!, lamport: BigInt(2) },
      ]),
      true,
    );

    doc1.update((root) => {
      root.text = new Text();
      root.text.edit(0, 0, 'Hello World');
      root.textWithAttr = new Text();
      root.textWithAttr.edit(0, 0, 'Hello World');
    }, 'sets text');
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(2) },
      ]),
      true,
    );
    assert.equal(doc1.getGarbageLen(), 0);
    assert.equal(doc2.getGarbageLen(), 0);

    await client1.sync();
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(3) },
        { actor: client2.getID()!, lamport: BigInt(1) },
      ]),
      true,
    );

    await client2.sync();
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(2) },
        { actor: client2.getID()!, lamport: BigInt(3) },
      ]),
      true,
    );

    doc2.update((root) => {
      root.text.edit(0, 1, 'a');
      root.text.edit(1, 2, 'b');
      root.textWithAttr.edit(0, 1, 'a', { b: '1' });
    }, 'edit text type elements');
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(2) },
        { actor: client2.getID()!, lamport: BigInt(4) },
      ]),
      true,
    );
    assert.equal(doc1.getGarbageLen(), 0);
    assert.equal(doc2.getGarbageLen(), 3);

    await client2.sync();
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(2) },
        { actor: client2.getID()!, lamport: BigInt(4) },
      ]),
      true,
    );
    assert.equal(doc1.getGarbageLen(), 0);
    assert.equal(doc2.getGarbageLen(), 3);

    await client1.sync();
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(5) },
        { actor: client2.getID()!, lamport: BigInt(4) },
      ]),
      true,
    );
    assert.equal(doc1.getGarbageLen(), 3);
    assert.equal(doc2.getGarbageLen(), 3);

    await client2.sync();
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(2) },
        { actor: client2.getID()!, lamport: BigInt(4) },
      ]),
      true,
    );
    assert.equal(doc1.getGarbageLen(), 3);
    assert.equal(doc2.getGarbageLen(), 3);

    await client1.sync();
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(5) },
        { actor: client2.getID()!, lamport: BigInt(4) },
      ]),
      true,
    );
    assert.equal(doc1.getGarbageLen(), 0);
    assert.equal(doc2.getGarbageLen(), 3);

    await client2.sync();
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(2) },
        { actor: client2.getID()!, lamport: BigInt(4) },
      ]),
      true,
    );
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
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(1) },
      ]),
      true,
    );
    await client2.attach(doc2, { syncMode: SyncMode.Manual });
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(1) },
        { actor: client2.getID()!, lamport: BigInt(2) },
      ]),
      true,
    );

    doc1.update((root) => {
      root['1'] = 1;
      root['2'] = [1, 2, 3];
      root['3'] = 3;
      root['4'] = new Text();
      root['4'].edit(0, 0, 'hi');
      root['5'] = new Text();
      root['5'].edit(0, 0, 'hi');
    }, 'sets 1, 2, 3, 4, 5');
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(2) },
      ]),
      true,
    );

    assert.equal(doc1.getGarbageLen(), 0);
    assert.equal(doc2.getGarbageLen(), 0);

    await client1.sync();
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(3) },
        { actor: client2.getID()!, lamport: BigInt(1) },
      ]),
      true,
    );

    await client2.sync();
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(2) },
        { actor: client2.getID()!, lamport: BigInt(3) },
      ]),
      true,
    );

    doc1.update((root) => {
      delete root['2'];
      root['4'].edit(0, 1, 'h');
      root['5'].edit(0, 1, 'h', { b: '1' });
    }, 'removes 2 and edit text type elements');
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(4) },
        { actor: client2.getID()!, lamport: BigInt(1) },
      ]),
      true,
    );
    assert.equal(doc1.getGarbageLen(), 6);
    assert.equal(doc2.getGarbageLen(), 0);

    await client1.sync();
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(4) },
        { actor: client2.getID()!, lamport: BigInt(1) },
      ]),
      true,
    );
    assert.equal(doc1.getGarbageLen(), 6);
    assert.equal(doc2.getGarbageLen(), 0);

    await client2.detach(doc2);

    await client2.sync();
    assert.equal(doc1.getGarbageLen(), 6);
    assert.equal(doc2.getGarbageLen(), 6);

    await client1.sync();
    // TODO(JOOHOJANG): we have to consider removing detached client's lamport from version vector
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(5) },
        { actor: client2.getID()!, lamport: BigInt(4) },
      ]),
      true,
    );
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
    assert.equal(
      versionVectorHelper(doc.getVersionVector(), [
        { actor: cli.getID()!, lamport: BigInt(1) },
      ]),
      true,
    );
    doc.update((root) => {
      root.point = { x: 0, y: 0 };
    });
    assert.equal(
      versionVectorHelper(doc.getVersionVector(), [
        { actor: cli.getID()!, lamport: BigInt(2) },
      ]),
      true,
    );
    doc.update((root) => {
      root.point = { x: 1, y: 1 };
    });
    assert.equal(
      versionVectorHelper(doc.getVersionVector(), [
        { actor: cli.getID()!, lamport: BigInt(3) },
      ]),
      true,
    );
    doc.update((root) => {
      root.point = { x: 2, y: 2 };
    });
    assert.equal(
      versionVectorHelper(doc.getVersionVector(), [
        { actor: cli.getID()!, lamport: BigInt(4) },
      ]),
      true,
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
    const cli = new yorkie.Client(testRPCAddr);

    await cli.activate();
    await cli.attach(doc, { syncMode: SyncMode.Manual });
    assert.equal(
      versionVectorHelper(doc.getVersionVector(), [
        { actor: cli.getID()!, lamport: BigInt(1) },
      ]),
      true,
    );
    doc.update((root) => {
      root.list = [0, 1, 2];
      root.list.push([3, 4, 5]);
    });
    assert.equal(
      versionVectorHelper(doc.getVersionVector(), [
        { actor: cli.getID()!, lamport: BigInt(2) },
      ]),
      true,
    );
    assert.equal('{"list":[0,1,2,[3,4,5]]}', doc.toJSON());
    doc.update((root) => {
      delete root.list[1];
    });
    assert.equal(
      versionVectorHelper(doc.getVersionVector(), [
        { actor: cli.getID()!, lamport: BigInt(3) },
      ]),
      true,
    );
    assert.equal('{"list":[0,2,[3,4,5]]}', doc.toJSON());
    doc.update((root) => {
      delete (root.list[2] as Array<number>)[1];
    });
    assert.equal(
      versionVectorHelper(doc.getVersionVector(), [
        { actor: cli.getID()!, lamport: BigInt(4) },
      ]),
      true,
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
    const doc1 = new yorkie.Document<TestDoc>(docKey);
    const doc2 = new yorkie.Document<TestDoc>(docKey);

    const client1 = new yorkie.Client(testRPCAddr);
    const client2 = new yorkie.Client(testRPCAddr);

    await client1.activate();
    await client2.activate();

    await client1.attach(doc1, { syncMode: SyncMode.Manual });
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(1) },
      ]),
      true,
    );
    doc1.update((root) => (root.point = { x: 0, y: 0 }));
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(2) },
      ]),
      true,
    );
    doc1.update((root) => (root.point.x = 1));
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(3) },
      ]),
      true,
    );
    assert.equal(doc1.getGarbageLen(), 1);
    await client1.sync();
    assert.equal(doc1.getGarbageLen(), 0);
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(3) },
      ]),
      true,
    );

    await client2.attach(doc2, { syncMode: SyncMode.Manual });
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(3) },
        { actor: client2.getID()!, lamport: BigInt(4) },
      ]),
      true,
    );
    assert.equal(doc2.getGarbageLen(), 1);
    doc2.update((root) => (root.point.x = 2));
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(3) },
        { actor: client2.getID()!, lamport: BigInt(5) },
      ]),
      true,
    );
    assert.equal(doc2.getGarbageLen(), 2);

    doc1.update((root) => (root.point = { x: 3, y: 3 }));
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(4) },
      ]),
      true,
    );
    assert.equal(doc1.getGarbageLen(), 3);
    await client1.sync();
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(5) },
        { actor: client2.getID()!, lamport: BigInt(1) },
      ]),
      true,
    );
    assert.equal(doc1.getGarbageLen(), 3);

    await client1.sync();
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(5) },
        { actor: client2.getID()!, lamport: BigInt(1) },
      ]),
      true,
    );
    assert.equal(doc1.getGarbageLen(), 3);

    await client2.sync();
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(4) },
        { actor: client2.getID()!, lamport: BigInt(6) },
      ]),
      true,
    );
    assert.equal(doc1.getGarbageLen(), 3);
    await client1.sync();
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(6) },
        { actor: client2.getID()!, lamport: BigInt(5) },
      ]),
      true,
    );
    assert.equal(doc1.getGarbageLen(), 4);
    await client2.sync();
    assert.equal(doc1.getGarbageLen(), 4);
    await client1.sync();
    assert.equal(doc1.getGarbageLen(), 0);
    await client2.sync();
    assert.equal(doc2.getGarbageLen(), 0);

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
      doc.garbageCollect(MaxVersionVector([doc.getChangeID().getActorID()])),
      4,
    ); // The number of GC nodes must also be 4.
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
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(1) },
      ]),
      true,
    );
    await client2.attach(doc2, { syncMode: SyncMode.Manual });
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(1) },
        { actor: client2.getID()!, lamport: BigInt(2) },
      ]),
      true,
    );

    doc1.update((root) => {
      root.t = new yorkie.Text();
      root.t.edit(0, 0, 'z');
    });
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(2) },
      ]),
      true,
    );
    doc1.update((root) => {
      root.t.edit(0, 1, 'a');
    });
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(3) },
      ]),
      true,
    );
    doc1.update((root) => {
      root.t.edit(1, 1, 'b');
    });
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(4) },
      ]),
      true,
    );
    doc1.update((root) => {
      root.t.edit(2, 2, 'd');
    });
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(5) },
      ]),
      true,
    );
    await client1.sync();
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(6) },
        { actor: client2.getID()!, lamport: BigInt(1) },
      ]),
      true,
    );
    await client2.sync();
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(5) },
        { actor: client2.getID()!, lamport: BigInt(6) },
      ]),
      true,
    );
    assert.equal(doc1.getRoot().t.toString(), 'abd');
    assert.equal(doc2.getRoot().t.toString(), 'abd');
    assert.equal(doc1.getGarbageLen(), 1); // z

    doc1.update((root) => {
      root.t.edit(2, 2, 'c');
    });
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(7) },
        { actor: client2.getID()!, lamport: BigInt(1) },
      ]),
      true,
    );
    await client1.sync();
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(7) },
        { actor: client2.getID()!, lamport: BigInt(1) },
      ]),
      true,
    );
    await client2.sync();
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(7) },
        { actor: client2.getID()!, lamport: BigInt(8) },
      ]),
      true,
    );
    await client1.sync();
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(7) },
        { actor: client2.getID()!, lamport: BigInt(1) },
      ]),
      true,
    );

    assert.equal(doc1.getRoot().t.toString(), 'abcd');
    assert.equal(doc2.getRoot().t.toString(), 'abcd');

    doc1.update((root) => {
      root.t.edit(1, 3, '');
    });
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(8) },
        { actor: client2.getID()!, lamport: BigInt(1) },
      ]),
      true,
    );
    await client1.sync();
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(8) },
        { actor: client2.getID()!, lamport: BigInt(1) },
      ]),
      true,
    );
    assert.equal(doc1.getRoot().t.toString(), 'ad');
    assert.equal(doc1.getGarbageLen(), 2); // b,c

    await client2.sync();
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(8) },
        { actor: client2.getID()!, lamport: BigInt(9) },
      ]),
      true,
    );
    await client1.sync();
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(8) },
        { actor: client2.getID()!, lamport: BigInt(1) },
      ]),
      true,
    );
    await client2.sync();
    assert.equal(doc2.getGarbageLen(), 0);
    assert.equal(doc2.getRoot().t.toString(), 'ad');
    await client1.sync();
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
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(1) },
      ]),
      true,
    );
    await client2.attach(doc2, { syncMode: SyncMode.Manual });
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(1) },
        { actor: client2.getID()!, lamport: BigInt(2) },
      ]),
      true,
    );

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
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(2) },
      ]),
      true,
    );
    doc1.update((root) => {
      root.t.editByPath([0], [1], {
        type: 'text',
        value: 'a',
      });
    });
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(3) },
      ]),
      true,
    );
    doc1.update((root) => {
      root.t.editByPath([1], [1], {
        type: 'text',
        value: 'b',
      });
    });
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(4) },
      ]),
      true,
    );
    doc1.update((root) => {
      root.t.editByPath([2], [2], {
        type: 'text',
        value: 'd',
      });
    });
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(5) },
      ]),
      true,
    );
    await client1.sync();
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(6) },
        { actor: client2.getID()!, lamport: BigInt(1) },
      ]),
      true,
    );
    await client2.sync();
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(5) },
        { actor: client2.getID()!, lamport: BigInt(6) },
      ]),
      true,
    );
    assert.equal(doc1.getRoot().t.toXML(), '<r>abd</r>');
    assert.equal(doc2.getRoot().t.toXML(), '<r>abd</r>');
    assert.equal(doc1.getGarbageLen(), 1); // z

    doc1.update((root) => {
      root.t.editByPath([2], [2], {
        type: 'text',
        value: 'c',
      });
    });
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(7) },
        { actor: client2.getID()!, lamport: BigInt(1) },
      ]),
      true,
    );
    await client1.sync();
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(7) },
        { actor: client2.getID()!, lamport: BigInt(1) },
      ]),
      true,
    );
    await client2.sync();
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(7) },
        { actor: client2.getID()!, lamport: BigInt(8) },
      ]),
      true,
    );
    assert.equal(doc1.getRoot().t.toXML(), '<r>abcd</r>');
    assert.equal(doc2.getRoot().t.toXML(), '<r>abcd</r>');

    doc1.update((root) => {
      root.t.editByPath([1], [3]);
    });
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(8) },
        { actor: client2.getID()!, lamport: BigInt(1) },
      ]),
      true,
    );
    await client1.sync();
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(8) },
        { actor: client2.getID()!, lamport: BigInt(1) },
      ]),
      true,
    );
    assert.equal(doc1.getRoot().t.toXML(), '<r>ad</r>');
    assert.equal(doc1.getGarbageLen(), 2); // b,c

    await client2.sync();
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(8) },
        { actor: client2.getID()!, lamport: BigInt(9) },
      ]),
      true,
    );
    await client1.sync();
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(8) },
        { actor: client2.getID()!, lamport: BigInt(1) },
      ]),
      true,
    );
    assert.equal(doc2.getRoot().t.toXML(), '<r>ad</r>');
    assert.equal(doc1.getGarbageLen(), 2);

    await client2.sync();
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(8) },
        { actor: client2.getID()!, lamport: BigInt(9) },
      ]),
      true,
    );
    assert.equal(doc2.getRoot().t.toXML(), '<r>ad</r>');
    assert.equal(doc2.getGarbageLen(), 0);

    await client1.sync();
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(8) },
        { actor: client2.getID()!, lamport: BigInt(1) },
      ]),
      true,
    );
    assert.equal(doc1.getRoot().t.toXML(), '<r>ad</r>');
    assert.equal(doc1.getGarbageLen(), 0);

    await client1.deactivate();
    await client2.deactivate();
  });

  it('concurrent garbage collection test', async function ({ task }) {
    type TestDoc = { t: Text };
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const doc1 = new yorkie.Document<TestDoc>(docKey);
    const doc2 = new yorkie.Document<TestDoc>(docKey);
    const client1 = new yorkie.Client(testRPCAddr);
    const client2 = new yorkie.Client(testRPCAddr);
    await client1.activate();
    await client2.activate();

    await client1.attach(doc1, { syncMode: SyncMode.Manual });
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(1) },
      ]),
      true,
    );

    await client2.attach(doc2, { syncMode: SyncMode.Manual });
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(1) },
        { actor: client2.getID()!, lamport: BigInt(2) },
      ]),
      true,
    );

    doc1.update((root) => {
      root.t = new Text();
      root.t.edit(0, 0, 'a');
      root.t.edit(1, 1, 'b');
      root.t.edit(2, 2, 'c');
    }, 'sets text');
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(2) },
      ]),
      true,
    );

    await client1.sync();
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(3) },
        { actor: client2.getID()!, lamport: BigInt(1) },
      ]),
      true,
    );

    await client2.sync();
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(2) },
        { actor: client2.getID()!, lamport: BigInt(3) },
      ]),
      true,
    );

    doc2.update((root) => {
      root.t.edit(2, 2, 'c');
    }, 'insert c');
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(2) },
        { actor: client2.getID()!, lamport: BigInt(4) },
      ]),
      true,
    );

    doc1.update((root) => {
      root.t.edit(1, 3, '');
    }, 'delete bd');
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(4) },
        { actor: client2.getID()!, lamport: BigInt(1) },
      ]),
      true,
    );

    assert.equal(doc1.getGarbageLen(), 2);
    assert.equal(doc2.getGarbageLen(), 0);

    await client1.sync();
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(4) },
        { actor: client2.getID()!, lamport: BigInt(1) },
      ]),
      true,
    );

    await client2.sync();
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(4) },
        { actor: client2.getID()!, lamport: BigInt(5) },
      ]),
      true,
    );

    assert.equal(doc1.getGarbageLen(), 2);
    assert.equal(doc2.getGarbageLen(), 2);

    doc2.update((root) => {
      root.t.edit(2, 2, '1');
    }, 'insert 1');
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(4) },
        { actor: client2.getID()!, lamport: BigInt(6) },
      ]),
      true,
    );

    await client2.sync();
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(4) },
        { actor: client2.getID()!, lamport: BigInt(6) },
      ]),
      true,
    );

    assert.equal(doc1.getGarbageLen(), 2);
    assert.equal(doc2.getGarbageLen(), 0);

    await client1.sync();
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(7) },
        { actor: client2.getID()!, lamport: BigInt(6) },
      ]),
      true,
    );

    assert.equal(doc1.getGarbageLen(), 0);
    assert.equal(doc2.getGarbageLen(), 0);

    await client1.deactivate();
    await client2.deactivate();
  });

  it('concurrent garbage collection test(with pushonly)', async function ({
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
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(1) },
      ]),
      true,
    );

    await client2.attach(doc2, { syncMode: SyncMode.Manual });
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(1) },
        { actor: client2.getID()!, lamport: BigInt(2) },
      ]),
      true,
    );

    // d1/vv = [c1:2]
    doc1.update((root) => {
      root.t = new Text();
      root.t.edit(0, 0, 'a');
      root.t.edit(1, 1, 'b');
    }, 'insert ab');
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(2) },
      ]),
      true,
    );

    await client1.sync();
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(3) },
        { actor: client2.getID()!, lamport: BigInt(1) },
      ]),
      true,
    );

    await client2.sync();
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(2) },
        { actor: client2.getID()!, lamport: BigInt(3) },
      ]),
      true,
    );

    // d2/vv = [c1:2, c2:4]
    doc2.update((root) => {
      root.t.edit(2, 2, 'd');
    }, 'insert d');
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(2) },
        { actor: client2.getID()!, lamport: BigInt(4) },
      ]),
      true,
    );

    await client2.sync();
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(2) },
        { actor: client2.getID()!, lamport: BigInt(4) },
      ]),
      true,
    );

    await client1.sync();
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(5) },
        { actor: client2.getID()!, lamport: BigInt(4) },
      ]),
      true,
    );

    // d2/vv = [c1:2, c2:5]
    doc2.update((root) => {
      root.t.edit(2, 2, 'c');
    }, 'insert c');
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(2) },
        { actor: client2.getID()!, lamport: BigInt(5) },
      ]),
      true,
    );

    // c1/vv = [c1:6, c2:4]
    doc1.update((root) => {
      root.t.edit(1, 3, '');
    }, 'remove ac');
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(6) },
        { actor: client2.getID()!, lamport: BigInt(4) },
      ]),
      true,
    );

    // Sync with PushOnly
    await client2.changeSyncMode(doc2, SyncMode.RealtimePushOnly);
    await client2.sync();
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(2) },
        { actor: client2.getID()!, lamport: BigInt(5) },
      ]),
      true,
    );

    await client1.sync();
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(7) },
        { actor: client2.getID()!, lamport: BigInt(5) },
      ]),
      true,
    );

    // d2/vv = [c1:2, c2:6]
    doc2.update((root) => {
      root.t.edit(2, 2, '1');
    }, 'insert 1 (pushonly)');
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(2) },
        { actor: client2.getID()!, lamport: BigInt(6) },
      ]),
      true,
    );

    await client2.sync();
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(2) },
        { actor: client2.getID()!, lamport: BigInt(6) },
      ]),
      true,
    );

    await client1.sync();
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(8) },
        { actor: client2.getID()!, lamport: BigInt(6) },
      ]),
      true,
    );

    assert.equal(doc1.getGarbageLen(), 2);
    assert.equal(doc2.getGarbageLen(), 0);

    // c2/vv = [c1:2, c2:7]
    doc2.update((root) => {
      root.t.edit(2, 2, '2');
    }, 'insert 2 (pushonly)');
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(2) },
        { actor: client2.getID()!, lamport: BigInt(7) },
      ]),
      true,
    );

    await client2.sync();
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(2) },
        { actor: client2.getID()!, lamport: BigInt(7) },
      ]),
      true,
    );

    await client2.changeSyncMode(doc2, SyncMode.Manual);
    await client2.sync();
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(6) },
        { actor: client2.getID()!, lamport: BigInt(8) },
      ]),
      true,
    );

    await client1.sync();
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(9) },
        { actor: client2.getID()!, lamport: BigInt(7) },
      ]),
      true,
    );

    assert.equal(doc1.getGarbageLen(), 2);
    assert.equal(doc2.getGarbageLen(), 2);

    await client2.sync();
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(6) },
        { actor: client2.getID()!, lamport: BigInt(8) },
      ]),
      true,
    );

    assert.equal(doc1.getGarbageLen(), 2);
    assert.equal(doc2.getGarbageLen(), 0);

    await client1.sync();
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(9) },
        { actor: client2.getID()!, lamport: BigInt(7) },
      ]),
      true,
    );

    assert.equal(doc1.getGarbageLen(), 0);
    assert.equal(doc2.getGarbageLen(), 0);

    await client1.deactivate();
    await client2.deactivate();
  });

  it('gc targeting nodes made by deactivated client', async function ({
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
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(1) },
      ]),
      true,
    );

    await client2.attach(doc2, { syncMode: SyncMode.Manual });
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(1) },
        { actor: client2.getID()!, lamport: BigInt(2) },
      ]),
      true,
    );

    doc1.update((root) => {
      root.t = new Text();
      root.t.edit(0, 0, 'a');
      root.t.edit(1, 1, 'b');
      root.t.edit(2, 2, 'c');
    }, 'sets text');
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(2) },
      ]),
      true,
    );

    await client1.sync();
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(3) },
        { actor: client2.getID()!, lamport: BigInt(1) },
      ]),
      true,
    );

    await client2.sync();
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(2) },
        { actor: client2.getID()!, lamport: BigInt(3) },
      ]),
      true,
    );

    doc2.update((root) => {
      root.t.edit(2, 2, 'c');
    }, 'insert c');
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(2) },
        { actor: client2.getID()!, lamport: BigInt(4) },
      ]),
      true,
    );

    doc1.update((root) => {
      root.t.edit(1, 3, '');
    }, 'delete bd');
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(4) },
        { actor: client2.getID()!, lamport: BigInt(1) },
      ]),
      true,
    );

    await client1.sync();
    await client2.sync();

    await client1.deactivate();
    assert.equal(doc2.getGarbageLen(), 2);
    assert.equal(doc2.getVersionVector().size(), 2);

    await client2.sync();
    assert.equal(doc2.getGarbageLen(), 0);
    // TODO(JOOHOJANG): we have to consider removing detached client's lamport from version vector
    assert.equal(doc2.getVersionVector().size(), 2);
  });

  it('attach > pushpull > detach lifecycle version vector test (run gc at last client detaches document, but no tombstone exsits)', async function ({
    task,
  }) {
    type TestDoc = { t: Text };
    const docKey = toDocKey(`${new Date().getTime()}-${task.name}`);
    const doc1 = new yorkie.Document<TestDoc>(docKey);
    const doc2 = new yorkie.Document<TestDoc>(docKey);
    const client1 = new yorkie.Client(testRPCAddr);
    const client2 = new yorkie.Client(testRPCAddr);
    await client1.activate();
    await client2.activate();

    await client1.attach(doc1, { syncMode: SyncMode.Manual });
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(1) },
      ]),
      true,
    );

    await client2.attach(doc2, { syncMode: SyncMode.Manual });
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(1) },
        { actor: client2.getID()!, lamport: BigInt(2) },
      ]),
      true,
    );

    doc1.update((root) => {
      root.t = new Text();
      root.t.edit(0, 0, 'a');
      root.t.edit(1, 1, 'b');
      root.t.edit(2, 2, 'c');
    }, 'sets text');
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(2) },
      ]),
      true,
    );

    await client1.sync();
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(3) },
        { actor: client2.getID()!, lamport: BigInt(1) },
      ]),
      true,
    );

    await client2.sync();
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(2) },
        { actor: client2.getID()!, lamport: BigInt(3) },
      ]),
      true,
    );

    doc2.update((root) => {
      root.t.edit(2, 2, 'c');
    }, 'insert c');
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(2) },
        { actor: client2.getID()!, lamport: BigInt(4) },
      ]),
      true,
    );

    doc1.update((root) => {
      root.t.edit(1, 3, '');
    }, 'delete bd');
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(4) },
        { actor: client2.getID()!, lamport: BigInt(1) },
      ]),
      true,
    );

    assert.equal(doc1.getGarbageLen(), 2);
    assert.equal(doc2.getGarbageLen(), 0);

    await client1.sync();
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(4) },
        { actor: client2.getID()!, lamport: BigInt(1) },
      ]),
      true,
    );

    await client2.sync();
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(4) },
        { actor: client2.getID()!, lamport: BigInt(5) },
      ]),
      true,
    );

    assert.equal(doc1.getGarbageLen(), 2);
    assert.equal(doc2.getGarbageLen(), 2);

    doc2.update((root) => {
      root.t.edit(2, 2, '1');
    }, 'insert 1');
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(4) },
        { actor: client2.getID()!, lamport: BigInt(6) },
      ]),
      true,
    );

    await client2.sync();
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(4) },
        { actor: client2.getID()!, lamport: BigInt(6) },
      ]),
      true,
    );

    assert.equal(doc1.getGarbageLen(), 2);
    assert.equal(doc2.getGarbageLen(), 0);

    await client1.sync();
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(7) },
        { actor: client2.getID()!, lamport: BigInt(6) },
      ]),
      true,
    );

    await client1.detach(doc1);
    await client2.sync();
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(8) },
        { actor: client2.getID()!, lamport: BigInt(9) },
      ]),
      true,
    );

    doc2.update((root) => {
      root.t.edit(0, 3, '');
    }, 'delete all');
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(8) },
        { actor: client2.getID()!, lamport: BigInt(10) },
      ]),
      true,
    );
    assert.equal(doc2.getGarbageLen(), 3);
    await client2.sync();
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(8) },
        { actor: client2.getID()!, lamport: BigInt(10) },
      ]),
      true,
    );
    assert.equal(doc2.getGarbageLen(), 0);
    await client2.detach(doc2);

    await client1.deactivate();
    await client2.deactivate();
  });

  it('attach > pushpull > detach lifecycle version vector test (run gc at last client detaches document)', async function ({
    task,
  }) {
    type TestDoc = { t: Text };
    const docKey = toDocKey(`${new Date().getTime()}-${task.name}`);
    const doc1 = new yorkie.Document<TestDoc>(docKey);
    const doc2 = new yorkie.Document<TestDoc>(docKey);
    const client1 = new yorkie.Client(testRPCAddr);
    const client2 = new yorkie.Client(testRPCAddr);
    await client1.activate();
    await client2.activate();

    await client1.attach(doc1, { syncMode: SyncMode.Manual });
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(1) },
      ]),
      true,
    );

    await client2.attach(doc2, { syncMode: SyncMode.Manual });
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(1) },
        { actor: client2.getID()!, lamport: BigInt(2) },
      ]),
      true,
    );

    doc1.update((root) => {
      root.t = new Text();
      root.t.edit(0, 0, 'a');
      root.t.edit(1, 1, 'b');
      root.t.edit(2, 2, 'c');
    }, 'sets text');
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(2) },
      ]),
      true,
    );

    await client1.sync();
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(3) },
        { actor: client2.getID()!, lamport: BigInt(1) },
      ]),
      true,
    );

    await client2.sync();
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(2) },
        { actor: client2.getID()!, lamport: BigInt(3) },
      ]),
      true,
    );

    doc2.update((root) => {
      root.t.edit(2, 2, 'c');
    }, 'insert c');
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(2) },
        { actor: client2.getID()!, lamport: BigInt(4) },
      ]),
      true,
    );

    doc1.update((root) => {
      root.t.edit(1, 3, '');
    }, 'delete bd');
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(4) },
        { actor: client2.getID()!, lamport: BigInt(1) },
      ]),
      true,
    );

    assert.equal(doc1.getGarbageLen(), 2);
    assert.equal(doc2.getGarbageLen(), 0);

    await client1.sync();
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(4) },
        { actor: client2.getID()!, lamport: BigInt(1) },
      ]),
      true,
    );

    await client2.sync();
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(4) },
        { actor: client2.getID()!, lamport: BigInt(5) },
      ]),
      true,
    );

    assert.equal(doc1.getGarbageLen(), 2);
    assert.equal(doc2.getGarbageLen(), 2);

    doc2.update((root) => {
      root.t.edit(2, 2, '1');
    }, 'insert 1');
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(4) },
        { actor: client2.getID()!, lamport: BigInt(6) },
      ]),
      true,
    );

    await client2.sync();
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(4) },
        { actor: client2.getID()!, lamport: BigInt(6) },
      ]),
      true,
    );

    assert.equal(doc1.getGarbageLen(), 2);
    assert.equal(doc2.getGarbageLen(), 0);

    await client1.sync();
    // TODO(JOOHOJANG): we have to consider removing detached client's lamport from version vector
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(7) },
        { actor: client2.getID()!, lamport: BigInt(6) },
      ]),
      true,
    );

    await client1.detach(doc1);
    await client2.sync();
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(8) },
        { actor: client2.getID()!, lamport: BigInt(9) },
      ]),
      true,
    );

    doc2.update((root) => {
      root.t.edit(0, 3, '');
    }, 'delete all');
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(8) },
        { actor: client2.getID()!, lamport: BigInt(10) },
      ]),
      true,
    );
    assert.equal(doc2.getGarbageLen(), 3);
    await client2.detach(doc2);
    assert.equal(doc2.getGarbageLen(), 0);

    await client1.deactivate();
    await client2.deactivate();
  });

  it('detach gc test', async function ({ task }) {
    type TestDoc = { t: Text };
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const doc1 = new yorkie.Document<TestDoc>(docKey);
    const doc2 = new yorkie.Document<TestDoc>(docKey);
    const doc3 = new yorkie.Document<TestDoc>(docKey);
    const client1 = new yorkie.Client(testRPCAddr);
    const client2 = new yorkie.Client(testRPCAddr);
    const client3 = new yorkie.Client(testRPCAddr);
    await client1.activate();
    await client2.activate();
    await client3.activate();

    await client1.attach(doc1, { syncMode: SyncMode.Manual });
    await client2.attach(doc2, { syncMode: SyncMode.Manual });
    await client3.attach(doc3, { syncMode: SyncMode.Manual });

    await client1.sync();
    await client2.sync();
    await client3.sync();

    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(3) },
        { actor: client2.getID()!, lamport: BigInt(1) },
        { actor: client3.getID()!, lamport: BigInt(1) },
      ]),
      true,
    );
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(1) },
        { actor: client2.getID()!, lamport: BigInt(3) },
        { actor: client3.getID()!, lamport: BigInt(1) },
      ]),
      true,
    );
    assert.equal(
      versionVectorHelper(doc3.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(1) },
        { actor: client2.getID()!, lamport: BigInt(1) },
        { actor: client3.getID()!, lamport: BigInt(3) },
      ]),
      true,
    );

    doc1.update((root) => {
      root.t = new Text();
      root.t.edit(0, 0, 'a');
      root.t.edit(1, 1, 'b');
      root.t.edit(2, 2, 'c');
    }, 'sets text');

    await client1.sync();
    await client2.sync();
    await client3.sync();

    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(4) },
        { actor: client2.getID()!, lamport: BigInt(1) },
        { actor: client3.getID()!, lamport: BigInt(1) },
      ]),
      true,
    );
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(4) },
        { actor: client2.getID()!, lamport: BigInt(5) },
        { actor: client3.getID()!, lamport: BigInt(1) },
      ]),
      true,
    );
    assert.equal(
      versionVectorHelper(doc3.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(4) },
        { actor: client2.getID()!, lamport: BigInt(1) },
        { actor: client3.getID()!, lamport: BigInt(5) },
      ]),
      true,
    );

    doc3.update((root) => {
      root.t.edit(1, 3, '');
    });

    doc1.update((root) => {
      root.t.edit(0, 0, '1');
    });
    doc1.update((root) => {
      root.t.edit(0, 0, '2');
    });
    doc1.update((root) => {
      root.t.edit(0, 0, '3');
    });
    doc2.update((root) => {
      root.t.edit(3, 3, 'x');
    });
    doc2.update((root) => {
      root.t.edit(4, 4, 'y');
    });

    await client1.sync();
    await client2.sync();
    await client1.sync();
    assert.equal(
      doc1.toJSON(),
      '{"t":[{"val":"3"},{"val":"2"},{"val":"1"},{"val":"a"},{"val":"b"},{"val":"c"},{"val":"x"},{"val":"y"}]}',
    );
    assert.equal(
      doc2.toJSON(),
      '{"t":[{"val":"3"},{"val":"2"},{"val":"1"},{"val":"a"},{"val":"b"},{"val":"c"},{"val":"x"},{"val":"y"}]}',
    );

    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(9) },
        { actor: client2.getID()!, lamport: BigInt(7) },
        { actor: client3.getID()!, lamport: BigInt(1) },
      ]),
      true,
    );
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(7) },
        { actor: client2.getID()!, lamport: BigInt(10) },
        { actor: client3.getID()!, lamport: BigInt(1) },
      ]),
      true,
    );
    assert.equal(
      versionVectorHelper(doc3.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(4) },
        { actor: client2.getID()!, lamport: BigInt(1) },
        { actor: client3.getID()!, lamport: BigInt(6) },
      ]),
      true,
    );

    await client3.detach(doc3);
    doc2.update((root) => {
      root.t.edit(5, 5, 'z');
    });

    await client1.sync();
    assert.equal(doc1.getGarbageLen(), 2);
    await client1.sync();
    assert.equal(doc1.getGarbageLen(), 2);

    await client2.sync();
    await client1.sync();

    // TODO(JOOHOJANG): we have to consider removing detached client's lamport from version vector
    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(12) },
        { actor: client2.getID()!, lamport: BigInt(11) },
        { actor: client3.getID()!, lamport: BigInt(7) },
      ]),
      true,
    );
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(7) },
        { actor: client2.getID()!, lamport: BigInt(13) },
        { actor: client3.getID()!, lamport: BigInt(7) },
      ]),
      true,
    );
    assert.equal(
      doc1.toJSON(),
      '{"t":[{"val":"3"},{"val":"2"},{"val":"1"},{"val":"a"},{"val":"z"},{"val":"x"},{"val":"y"}]}',
    );
    assert.equal(
      doc2.toJSON(),
      '{"t":[{"val":"3"},{"val":"2"},{"val":"1"},{"val":"a"},{"val":"z"},{"val":"x"},{"val":"y"}]}',
    );
    assert.equal(doc1.getGarbageLen(), 2);
    assert.equal(doc2.getGarbageLen(), 2);
    await client2.sync();
    await client1.sync();
    assert.equal(doc1.getGarbageLen(), 0);
    assert.equal(doc2.getGarbageLen(), 0);

    await client1.deactivate();
    await client2.deactivate();
    await client3.deactivate();
  });

  it('snapshot version vector test', async function ({ task }) {
    type TestDoc = { t: Text };
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const doc1 = new yorkie.Document<TestDoc>(docKey);
    const doc2 = new yorkie.Document<TestDoc>(docKey);
    const doc3 = new yorkie.Document<TestDoc>(docKey);
    const client1 = new yorkie.Client(testRPCAddr);
    const client2 = new yorkie.Client(testRPCAddr);
    const client3 = new yorkie.Client(testRPCAddr);
    await client1.activate();
    await client2.activate();
    await client3.activate();

    await client1.attach(doc1, { syncMode: SyncMode.Manual });
    await client2.attach(doc2, { syncMode: SyncMode.Manual });
    await client3.attach(doc3, { syncMode: SyncMode.Manual });

    doc1.update((root) => {
      root.t = new Text();
      root.t.edit(0, 0, 'a');
    }, 'sets text');

    await client1.sync();
    await client2.sync();
    await client3.sync();

    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(4) },
        { actor: client2.getID()!, lamport: BigInt(1) },
        { actor: client3.getID()!, lamport: BigInt(1) },
      ]),
      true,
    );
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(2) },
        { actor: client2.getID()!, lamport: BigInt(4) },
        { actor: client3.getID()!, lamport: BigInt(1) },
      ]),
      true,
    );
    assert.equal(
      versionVectorHelper(doc3.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(2) },
        { actor: client2.getID()!, lamport: BigInt(1) },
        { actor: client3.getID()!, lamport: BigInt(4) },
      ]),
      true,
    );

    // 01. Updates changes over snapshot threshold.
    for (let idx = 0; idx < DefaultSnapshotThreshold / 2; idx++) {
      doc1.update((root) => {
        root.t.edit(0, 0, `${idx % 10}`);
      });
      await client1.sync();
      await client2.sync();

      doc2.update((root) => {
        root.t.edit(0, 0, `${idx % 10}`);
      });
      await client2.sync();
      await client1.sync();
    }

    assert.equal(
      versionVectorHelper(doc1.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(2004) },
        { actor: client2.getID()!, lamport: BigInt(2003) },
        { actor: client3.getID()!, lamport: BigInt(1) },
      ]),
      true,
    );
    assert.equal(
      versionVectorHelper(doc2.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(2001) },
        { actor: client2.getID()!, lamport: BigInt(2003) },
        { actor: client3.getID()!, lamport: BigInt(1) },
      ]),
      true,
    );
    assert.equal(
      versionVectorHelper(doc3.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(2) },
        { actor: client2.getID()!, lamport: BigInt(1) },
        { actor: client3.getID()!, lamport: BigInt(4) },
      ]),
      true,
    );

    // 02. Makes local changes then pull a snapshot from the server.
    doc3.update((root) => {
      root.t.edit(0, 0, 'c');
    });
    await client3.sync();
    assert.equal(
      versionVectorHelper(doc3.getVersionVector(), [
        { actor: client1.getID()!, lamport: BigInt(2001) },
        { actor: client2.getID()!, lamport: BigInt(2003) },
        { actor: client3.getID()!, lamport: BigInt(2006) },
      ]),
      true,
    );
    assert.equal(
      DefaultSnapshotThreshold + 2,
      doc3.getRoot().t.toString().length,
    );

    // 03. Delete text after receiving the snapshot.
    doc3.update((root) => {
      root.t.edit(1, 3, '');
    });
    assert.equal(DefaultSnapshotThreshold, doc3.getRoot().t.toString().length);
    await client3.sync();
    await client2.sync();
    await client1.sync();
    assert.equal(DefaultSnapshotThreshold, doc2.getRoot().t.toString().length);
    assert.equal(DefaultSnapshotThreshold, doc1.getRoot().t.toString().length);

    await client1.deactivate();
    await client2.deactivate();
    await client3.deactivate();
  }, 50000);
});
