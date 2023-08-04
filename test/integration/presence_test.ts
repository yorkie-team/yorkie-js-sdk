import { assert } from 'chai';
import * as sinon from 'sinon';
import yorkie, { DocEventType } from '@yorkie-js-sdk/src/yorkie';
import {
  testRPCAddr,
  toDocKey,
} from '@yorkie-js-sdk/test/integration/integration_helper';
import {
  waitStubCallCount,
  sleep,
  deepSort,
} from '@yorkie-js-sdk/test/helper/helper';

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
    assert.deepEqual(doc1.getPresenceForTest(c1.getID()!), {
      key: `${snapshotThreshold - 1}`,
    });

    await c1.sync();
    await c2.sync();
    assert.deepEqual(doc2.getPresenceForTest(c1.getID()!), {
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

    assert.deepEqual(doc1.getPresenceForTest(c1.getID()!), { key: 'key1' });
    assert.deepEqual(doc1.getPresenceForTest(c2.getID()!), undefined);
    assert.deepEqual(doc2.getPresenceForTest(c2.getID()!), { key: 'key2' });
    assert.deepEqual(doc2.getPresenceForTest(c1.getID()!), { key: 'key1' });

    await c1.sync();
    assert.deepEqual(doc1.getPresenceForTest(c2.getID()!), { key: 'key2' });

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
    assert.deepEqual(doc1.getPresenceForTest(c1.getID()!), emptyObject);
    assert.deepEqual(doc1.getPresenceForTest(c2.getID()!), undefined);
    assert.deepEqual(doc2.getPresenceForTest(c2.getID()!), emptyObject);
    assert.deepEqual(doc2.getPresenceForTest(c1.getID()!), emptyObject);

    await c1.sync();
    assert.deepEqual(doc1.getPresenceForTest(c2.getID()!), emptyObject);
  });

  // TODO(hackerwins): This test case is not stable. It should be fixed.
  // To occur the problem, we need to run this test case in for loop with 50 or 100 iteration.
  it.skip('Should be synced eventually', async function () {
    const c1 = new yorkie.Client(testRPCAddr);
    const c2 = new yorkie.Client(testRPCAddr);
    await c1.activate();
    await c2.activate();
    const c1ID = c1.getID()!;
    const c2ID = c2.getID()!;

    const docKey = toDocKey(`${this.test!.title}-${new Date().getTime()}`);
    type PresenceType = { name: string };
    const doc1 = new yorkie.Document<{}, PresenceType>(docKey);
    await c1.attach(doc1, { initialPresence: { name: 'a' } });
    const stub1 = sinon.stub();
    const unsub1 = doc1.subscribe('presence', stub1);

    const doc2 = new yorkie.Document<{}, PresenceType>(docKey);
    await c2.attach(doc2, { initialPresence: { name: 'b' } });
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
    assert.deepEqual(doc1.getPresenceForTest(c1.getID()!), {
      key: 'key1',
      cursor: { x: 1, y: 1 },
    });

    await c1.sync();
    await c2.sync();
    assert.deepEqual(doc2.getPresenceForTest(c1.getID()!), {
      key: 'key1',
      cursor: { x: 1, y: 1 },
    });
  });

  it(`Should return only online clients`, async function () {
    const c1 = new yorkie.Client(testRPCAddr);
    const c2 = new yorkie.Client(testRPCAddr);
    const c3 = new yorkie.Client(testRPCAddr);
    await c1.activate();
    await c2.activate();
    await c3.activate();
    const c1ID = c1.getID()!;
    const c2ID = c2.getID()!;
    const c3ID = c3.getID()!;

    const docKey = toDocKey(`${this.test!.title}-${new Date().getTime()}`);
    type PresenceType = { name: string; cursor: { x: number; y: number } };
    const doc1 = new yorkie.Document<{}, PresenceType>(docKey);
    await c1.attach(doc1, {
      initialPresence: { name: 'a1', cursor: { x: 0, y: 0 } },
    });
    const stub1 = sinon.stub();
    const unsub1 = doc1.subscribe('presence', stub1);

    // 01. c2 attaches doc in realtime sync, and c3 attached doc in manual sync.
    const doc2 = new yorkie.Document<{}, PresenceType>(docKey);
    await c2.attach(doc2, {
      initialPresence: { name: 'b1', cursor: { x: 0, y: 0 } },
    });
    const doc3 = new yorkie.Document<{}, PresenceType>(docKey);
    await c3.attach(doc3, {
      initialPresence: { name: 'c1', cursor: { x: 0, y: 0 } },
      isRealtimeSync: false,
    });
    await waitStubCallCount(stub1, 1); // c2 watched

    assert.deepEqual(doc1.getPresences(), [
      { clientID: c1ID, presence: doc1.getMyPresence() },
      { clientID: c2ID, presence: doc2.getMyPresence() },
    ]);
    assert.deepEqual(doc1.getPresence(c3ID), undefined);

    // 02. c2 pauses the document (in manual sync), c3 resumes the document (in realtime sync).
    await c2.pause(doc2);
    await waitStubCallCount(stub1, 2); // c2 unwatched
    await c3.resume(doc3);
    await waitStubCallCount(stub1, 3); // c3 watched

    assert.deepEqual(doc1.getPresences(), [
      { clientID: c1ID, presence: doc1.getMyPresence() },
      { clientID: c3ID, presence: doc3.getMyPresence() },
    ]);
    assert.deepEqual(doc1.getPresence(c2ID), undefined);

    unsub1();
    await c1.deactivate();
    await c2.deactivate();
    await c3.deactivate();
  });

  it('Can get presence value using p.get() within doc.update function', async function () {
    const c1 = new yorkie.Client(testRPCAddr);
    const c2 = new yorkie.Client(testRPCAddr);
    await c1.activate();
    await c2.activate();

    const docKey = toDocKey(`${this.test!.title}-${new Date().getTime()}`);
    type PresenceType = { counter: number };
    const doc1 = new yorkie.Document<{}, PresenceType>(docKey);
    await c1.attach(doc1, {
      initialPresence: { counter: 0 },
      isRealtimeSync: false,
    });

    const doc2 = new yorkie.Document<{}, PresenceType>(docKey);
    await c2.attach(doc2, {
      initialPresence: { counter: 0 },
      isRealtimeSync: false,
    });

    doc1.update((root, p) => {
      const counter = p.get('counter');
      p.set({ counter: counter + 1 });
    });
    assert.deepEqual(doc1.getPresenceForTest(c1.getID()!), { counter: 1 });

    await c1.sync();
    await c2.sync();
    assert.deepEqual(doc2.getPresenceForTest(c1.getID()!), { counter: 1 });
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
          value: { clientID: c2ID, presence: { name: 'b' } },
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

  it(`Can receive presence-related event only when using realtime sync`, async function () {
    const c1 = new yorkie.Client(testRPCAddr);
    const c2 = new yorkie.Client(testRPCAddr);
    const c3 = new yorkie.Client(testRPCAddr);
    await c1.activate();
    await c2.activate();
    await c3.activate();
    const c2ID = c2.getID()!;
    const c3ID = c3.getID()!;

    const docKey = toDocKey(`${this.test!.title}-${new Date().getTime()}`);
    type PresenceType = { name: string; cursor: { x: number; y: number } };
    const doc1 = new yorkie.Document<{}, PresenceType>(docKey);
    await c1.attach(doc1, {
      initialPresence: { name: 'a1', cursor: { x: 0, y: 0 } },
    });
    const stub1 = sinon.stub();
    const unsub1 = doc1.subscribe('presence', stub1);

    // 01. c2 attaches doc in realtime sync, and c3 attached doc in manual sync.
    //     c1 receives the watched event from c2.
    const doc2 = new yorkie.Document<{}, PresenceType>(docKey);
    await c2.attach(doc2, {
      initialPresence: { name: 'b1', cursor: { x: 0, y: 0 } },
    });
    const doc3 = new yorkie.Document<{}, PresenceType>(docKey);
    await c3.attach(doc3, {
      initialPresence: { name: 'c1', cursor: { x: 0, y: 0 } },
      isRealtimeSync: false,
    });
    await waitStubCallCount(stub1, 1); // c2 watched

    // 02. c2 and c3 update the presence.
    //     c1 receives the presence-changed event from c2.
    doc2.update((_, presence) => {
      presence.set({ name: 'b2' });
    });
    doc3.update((_, presence) => {
      presence.set({ name: 'c2' });
    });
    await waitStubCallCount(stub1, 2); // c2 presence-changed

    // 03. c2 pauses the document (in manual sync), c3 resumes the document (in realtime sync).
    //     c1 receives an unwatched event from c2 and a watched event from c3.
    await c2.pause(doc2);
    await waitStubCallCount(stub1, 3); // c2 unwatched
    await c3.resume(doc3);
    await waitStubCallCount(stub1, 5); // c3 watched, c3 presence-changed

    // 04. c2 and c3 update the presence.
    //     c1 receives the presence-changed event from c3.
    doc2.update((_, presence) => {
      presence.set({ name: 'b3' });
    });
    doc3.update((_, presence) => {
      presence.set({ name: 'c3' });
    });
    await waitStubCallCount(stub1, 6); // c3 presence-changed

    // 05. c3 pauses the document (in manual sync),
    //     c1 receives an unwatched event from c3.
    await c3.pause(doc3);
    await waitStubCallCount(stub1, 7); // c3 unwatched

    // 06. c2 performs manual sync and then resumes(switches to realtime sync).
    //     After applying all changes, only the watched event is triggered.

    // TODO(hackerwins): This is workaround for some non-deterministic behavior.
    // We need to fix this issue.
    await sleep();
    await c2.sync();
    await sleep();
    await c2.resume(doc2);
    await sleep();
    await waitStubCallCount(stub1, 8); // c2 watched

    assert.deepEqual(stub1.args, [
      [
        {
          type: DocEventType.Watched,
          value: {
            clientID: c2ID,
            presence: { cursor: { x: 0, y: 0 }, name: 'b1' },
          },
        },
      ],
      [
        {
          type: DocEventType.PresenceChanged,
          value: {
            clientID: c2ID,
            presence: { cursor: { x: 0, y: 0 }, name: 'b2' },
          },
        },
      ],
      [
        {
          type: DocEventType.Unwatched,
          value: {
            clientID: c2ID,
            presence: { cursor: { x: 0, y: 0 }, name: 'b2' },
          },
        },
      ],
      [
        {
          type: DocEventType.Watched,
          value: {
            clientID: c3ID,
            presence: { cursor: { x: 0, y: 0 }, name: 'c1' },
          },
        },
      ],
      [
        {
          type: DocEventType.PresenceChanged,
          value: {
            clientID: c3ID,
            presence: { cursor: { x: 0, y: 0 }, name: 'c2' },
          },
        },
      ],
      [
        {
          type: DocEventType.PresenceChanged,
          value: {
            clientID: c3ID,
            presence: { cursor: { x: 0, y: 0 }, name: 'c3' },
          },
        },
      ],
      [
        {
          type: DocEventType.Unwatched,
          value: {
            clientID: c3ID,
            presence: { cursor: { x: 0, y: 0 }, name: 'c3' },
          },
        },
      ],
      [
        {
          type: DocEventType.Watched,
          value: {
            clientID: c2ID,
            presence: { cursor: { x: 0, y: 0 }, name: 'b3' },
          },
        },
      ],
    ]);
    unsub1();
    await c1.deactivate();
    await c2.deactivate();
    await c3.deactivate();
  });
});
