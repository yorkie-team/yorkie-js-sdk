import { assert } from 'chai';
import * as sinon from 'sinon';
import yorkie, { DocEventType } from '@yorkie-js-sdk/src/yorkie';
import {
  testRPCAddr,
  toDocKey,
} from '@yorkie-js-sdk/test/integration/integration_helper';
import { waitStubCallCount, deepSort } from '@yorkie-js-sdk/test/helper/helper';

describe('Presence', function () {
  it('Can be built from a snapshot', async function () {
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

  it('Can be set initial value in attach and be removed in detach', async function () {
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

    assert.deepEqual(doc1.getPresence(c1.getID()!), { key: 'key1' });
    assert.deepEqual(doc1.getPresence(c2.getID()!), undefined);
    assert.deepEqual(doc2.getPresence(c2.getID()!), { key: 'key2' });
    assert.deepEqual(doc2.getPresence(c1.getID()!), { key: 'key1' });

    await c1.sync();
    assert.deepEqual(doc1.getPresence(c2.getID()!), { key: 'key2' });

    await c2.detach(doc2);
    await c1.sync();
    assert.isFalse(doc1.hasPresence(c2.getID()!));
  });

  it('Should be initialized as an empty object if no initial value is set during attach', async function () {
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

    const emptyObject = {} as PresenceType;
    assert.deepEqual(doc1.getPresence(c1.getID()!), emptyObject);
    assert.deepEqual(doc1.getPresence(c2.getID()!), undefined);
    assert.deepEqual(doc2.getPresence(c2.getID()!), emptyObject);
    assert.deepEqual(doc2.getPresence(c1.getID()!), emptyObject);

    await c1.sync();
    assert.deepEqual(doc1.getPresence(c2.getID()!), emptyObject);
  });

  it(`Should be synced eventually`, async function () {
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
    const unsub1 = doc1.subscribe('presence', stub1);

    const doc2 = new yorkie.Document<{}, PresenceType>(docKey);
    await c2.attach(doc2, {
      initialPresence: {
        name: 'b',
      },
    });
    const stub2 = sinon.stub();
    const unsub2 = doc2.subscribe('presence', stub2);

    doc1.update((root, p) => p.set({ name: 'A' }));
    doc2.update((root, p) => p.set({ name: 'B' }));

    await waitStubCallCount(stub1, 3);
    await waitStubCallCount(stub2, 2);
    assert.deepEqual(stub1.args, [
      [
        {
          type: DocEventType.PresenceChanged,
          value: { clientID: c1ID, presence: { name: 'A' } },
        },
      ],
      [
        {
          type: DocEventType.Watched,
          value: { clientID: c2ID, presence: { name: 'b' } },
        },
      ],
      [
        {
          type: DocEventType.PresenceChanged,
          value: { clientID: c2ID, presence: { name: 'B' } },
        },
      ],
    ]);
    assert.deepEqual(stub2.args, [
      [
        {
          type: DocEventType.PresenceChanged,
          value: { clientID: c2ID, presence: { name: 'B' } },
        },
      ],
      [
        {
          type: DocEventType.PresenceChanged,
          value: { clientID: c1ID, presence: { name: 'A' } },
        },
      ],
    ]);
    assert.deepEqual(
      deepSort(doc2.getPresences()),
      deepSort([
        { clientID: c2ID, presence: { name: 'B' } },
        { clientID: c1ID, presence: { name: 'A' } },
      ]),
    );
    assert.deepEqual(
      deepSort(doc1.getPresences()),
      deepSort(doc2.getPresences()),
    );

    await c1.deactivate();
    await c2.deactivate();

    unsub1();
    unsub2();
  });

  it('Can be updated partially by doc.update function', async function () {
    const c1 = new yorkie.Client(testRPCAddr);
    const c2 = new yorkie.Client(testRPCAddr);
    await c1.activate();
    await c2.activate();

    const docKey = toDocKey(`${this.test!.title}-${new Date().getTime()}`);
    type PresenceType = { key: string; cursor: { x: number; y: number } };
    const doc1 = new yorkie.Document<{}, PresenceType>(docKey);
    await c1.attach(doc1, {
      initialPresence: { key: 'key1', cursor: { x: 0, y: 0 } },
      isRealtimeSync: false,
    });

    const doc2 = new yorkie.Document<{}, PresenceType>(docKey);
    await c2.attach(doc2, {
      initialPresence: { key: 'key2', cursor: { x: 0, y: 0 } },
      isRealtimeSync: false,
    });

    doc1.update((root, p) => p.set({ cursor: { x: 1, y: 1 } }));
    assert.deepEqual(doc1.getPresence(c1.getID()!), {
      key: 'key1',
      cursor: { x: 1, y: 1 },
    });

    await c1.sync();
    await c2.sync();
    assert.deepEqual(doc2.getPresence(c1.getID()!), {
      key: 'key1',
      cursor: { x: 1, y: 1 },
    });
  });
});

describe(`Document.Subscribe('presence')`, function () {
  it(`Should receive presence-changed event for final presence if there are multiple presence changes within doc.update`, async function () {
    const c1 = new yorkie.Client(testRPCAddr);
    const c2 = new yorkie.Client(testRPCAddr);
    await c1.activate();
    await c2.activate();
    const c1ID = c1.getID()!;
    const c2ID = c2.getID()!;

    const docKey = toDocKey(`${this.test!.title}-${new Date().getTime()}`);
    type PresenceType = { name: string; cursor: { x: number; y: number } };
    const doc1 = new yorkie.Document<{}, PresenceType>(docKey);
    await c1.attach(doc1, {
      initialPresence: { name: 'a', cursor: { x: 0, y: 0 } },
    });
    const stub1 = sinon.stub();
    const unsub1 = doc1.subscribe('presence', stub1);

    const doc2 = new yorkie.Document<{}, PresenceType>(docKey);
    await c2.attach(doc2, {
      initialPresence: { name: 'b', cursor: { x: 0, y: 0 } },
    });
    const stub2 = sinon.stub();
    const unsub2 = doc2.subscribe('presence', stub2);

    doc1.update((root, p) => {
      p.set({ name: 'A' });
      p.set({ cursor: { x: 1, y: 1 } });
      p.set({ name: 'X' });
    });

    await waitStubCallCount(stub1, 2);
    await waitStubCallCount(stub2, 1);
    assert.deepEqual(stub1.args, [
      [
        {
          type: DocEventType.PresenceChanged,
          value: {
            clientID: c1ID,
            presence: { name: 'X', cursor: { x: 1, y: 1 } },
          },
        },
      ],
      [
        {
          type: DocEventType.Watched,
          value: {
            clientID: c2ID,
            presence: { name: 'b', cursor: { x: 0, y: 0 } },
          },
        },
      ],
    ]);
    assert.deepEqual(stub2.args, [
      [
        {
          type: DocEventType.PresenceChanged,
          value: {
            clientID: c1ID,
            presence: { name: 'X', cursor: { x: 1, y: 1 } },
          },
        },
      ],
    ]);

    await c1.deactivate();
    await c2.deactivate();

    unsub1();
    unsub2();
  });

  it(`Can receive 'unwatched' event when a client detaches`, async function () {
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
    const unsub1 = doc1.subscribe('presence', stub1);

    const doc2 = new yorkie.Document<{}, PresenceType>(docKey);
    await c2.attach(doc2, {
      initialPresence: {
        name: 'b',
      },
    });
    await waitStubCallCount(stub1, 1);

    await c2.detach(doc2);
    await waitStubCallCount(stub1, 2);

    assert.deepEqual(stub1.args, [
      [
        {
          type: DocEventType.Watched,
          value: { clientID: c2ID, presence: { name: 'b' } },
        },
      ],
      [
        {
          type: DocEventType.Unwatched,
          value: { clientID: c2ID },
        },
      ],
    ]);
    assert.deepEqual(
      deepSort(doc1.getPresences()),
      deepSort([{ clientID: c1ID, presence: { name: 'a' } }]),
    );
    assert.deepEqual(
      deepSort(doc1.getPresences()),
      deepSort(doc2.getPresences()),
    );

    await c1.deactivate();
    await c2.deactivate();

    unsub1();
  });
});
