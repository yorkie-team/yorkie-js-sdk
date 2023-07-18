import { assert } from 'chai';
import * as sinon from 'sinon';
import yorkie from '@yorkie-js-sdk/src/yorkie';
import {
  testRPCAddr,
  toDocKey,
} from '@yorkie-js-sdk/test/integration/integration_helper';
import { waitStubCallCount, deepSort } from '@yorkie-js-sdk/test/helper/helper';

describe('Presence', function () {
  it('presence with attach and detach test', async function () {
    const c1 = new yorkie.Client(testRPCAddr);
    const c2 = new yorkie.Client(testRPCAddr);
    await c1.activate();
    await c2.activate();

    const docKey = toDocKey(`${this.test!.title}-${new Date().getTime()}`);
    type PresenceType = { key: string };
    const doc1 = new yorkie.Document<{}, PresenceType>(docKey);
    await c1.attach(doc1, {
      initialPresence: { key: 'key1' },
      isRealtimeSync: false,
    });

    const doc2 = new yorkie.Document<{}, PresenceType>(docKey);
    await c2.attach(doc2, {
      initialPresence: { key: 'key2' },
      isRealtimeSync: false,
    });

    await c1.sync();
    assert.deepEqual(doc1.getPresence(c1.getID()!), { key: 'key1' });
    assert.deepEqual(doc1.getPresence(c2.getID()!), { key: 'key2' });
    assert.deepEqual(doc2.getPresence(c1.getID()!), { key: 'key1' });
    assert.deepEqual(doc2.getPresence(c2.getID()!), { key: 'key2' });

    await c1.detach(doc1);
    await c2.sync();
    assert.isFalse(doc2.hasPresence(c1.getID()!));
  });

  it('presence with snapshot test', async function () {
    const c1 = new yorkie.Client(testRPCAddr);
    const c2 = new yorkie.Client(testRPCAddr);
    await c1.activate();
    await c2.activate();

    const docKey = toDocKey(`${this.test!.title}-${new Date().getTime()}`);
    type PresenceType = { key: string };
    const doc1 = new yorkie.Document<{}, PresenceType>(docKey);
    await c1.attach(doc1, {
      isRealtimeSync: false,
    });

    const doc2 = new yorkie.Document<{}, PresenceType>(docKey);
    await c2.attach(doc2, {
      isRealtimeSync: false,
    });

    const snapshotThreshold = 500;
    for (let i = 0; i < snapshotThreshold; i++) {
      doc1.update((root, p) => p.set({ key: `${i}` }));
    }
    assert.deepEqual(doc1.getPresence(c1.getID()!), {
      key: `${snapshotThreshold - 1}`,
    });

    await c1.sync();
    await c2.sync();
    assert.deepEqual(doc2.getPresence(c1.getID()!), {
      key: `${snapshotThreshold - 1}`,
    });
  });

  it('Eventually sync presences with its peers', async function () {
    const c1 = new yorkie.Client(testRPCAddr);
    const c2 = new yorkie.Client(testRPCAddr);
    await c1.activate();
    await c2.activate();
    const c1ID = c1.getID()!;
    const c2ID = c2.getID()!;

    const docKey = toDocKey(`${this.test!.title}-${new Date().getTime()}`);
    type PresenceType = { name: string };
    const doc1 = new yorkie.Document<{}, PresenceType>(docKey);
    await c1.attach(doc1, {
      initialPresence: {
        name: 'a',
      },
    });
    const stub1 = sinon.stub();
    const unsub1 = doc1.subscribe('peers', stub1);

    const doc2 = new yorkie.Document<{}, PresenceType>(docKey);
    await c2.attach(doc2, {
      initialPresence: {
        name: 'b',
      },
    });
    const stub2 = sinon.stub();
    const unsub2 = doc2.subscribe('peers', stub2);

    doc1.update((root, p) => p.set({ name: 'A' }));
    doc2.update((root, p) => p.set({ name: 'B' }));

    await waitStubCallCount(stub1, 3);
    await waitStubCallCount(stub2, 2);
    assert.deepEqual(stub1.args, [
      [
        {
          type: 'presence-changed',
          peer: { clientID: c1ID, presence: { name: 'A' } },
        },
      ],
      [
        {
          type: 'watched',
          peer: { clientID: c2ID, presence: { name: 'b' } },
        },
      ],
      [
        {
          type: 'presence-changed',
          peer: { clientID: c2ID, presence: { name: 'B' } },
        },
      ],
    ]);
    assert.deepEqual(stub2.args, [
      [
        {
          type: 'presence-changed',
          peer: { clientID: c2ID, presence: { name: 'B' } },
        },
      ],
      [
        {
          type: 'presence-changed',
          peer: { clientID: c1ID, presence: { name: 'A' } },
        },
      ],
    ]);
    assert.deepEqual(
      deepSort(doc1.getPresences()),
      deepSort(doc2.getPresences()),
    );

    await c1.deactivate();
    await c2.deactivate();

    unsub1();
    unsub2();
  });
});
