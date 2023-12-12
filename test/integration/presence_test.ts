import { describe, it, assert, vi, afterEach } from 'vitest';
import yorkie, {
  DocEvent,
  DocEventType,
  Counter,
} from '@yorkie-js-sdk/src/yorkie';
import {
  testRPCAddr,
  toDocKey,
} from '@yorkie-js-sdk/test/integration/integration_helper';
import { EventCollector, deepSort } from '@yorkie-js-sdk/test/helper/helper';

describe.skip('Presence', function () {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Can be built from a snapshot', async function ({ task }) {
    const c1 = new yorkie.Client(testRPCAddr);
    const c2 = new yorkie.Client(testRPCAddr);
    await c1.activate();
    await c2.activate();

    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    type PresenceType = { key: string };
    const doc1 = new yorkie.Document<{}, PresenceType>(docKey);
    await c1.attach(doc1, { isRealtimeSync: false });

    const doc2 = new yorkie.Document<{}, PresenceType>(docKey);
    await c2.attach(doc2, { isRealtimeSync: false });

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

  it('Can be set initial value in attach and be removed in detach', async function ({
    task,
  }) {
    const c1 = new yorkie.Client(testRPCAddr);
    const c2 = new yorkie.Client(testRPCAddr);
    await c1.activate();
    await c2.activate();

    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
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

  it('Should be initialized as an empty object if no initial value is set during attach', async function ({
    task,
  }) {
    const c1 = new yorkie.Client(testRPCAddr);
    const c2 = new yorkie.Client(testRPCAddr);
    await c1.activate();
    await c2.activate();

    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    type PresenceType = { key: string };
    const doc1 = new yorkie.Document<{}, PresenceType>(docKey);
    await c1.attach(doc1, { isRealtimeSync: false });

    const doc2 = new yorkie.Document<{}, PresenceType>(docKey);
    await c2.attach(doc2, { isRealtimeSync: false });

    const emptyObject = {} as PresenceType;
    assert.deepEqual(doc1.getPresenceForTest(c1.getID()!), emptyObject);
    assert.deepEqual(doc1.getPresenceForTest(c2.getID()!), undefined);
    assert.deepEqual(doc2.getPresenceForTest(c2.getID()!), emptyObject);
    assert.deepEqual(doc2.getPresenceForTest(c1.getID()!), emptyObject);

    await c1.sync();
    assert.deepEqual(doc1.getPresenceForTest(c2.getID()!), emptyObject);
  });

  it('Should be synced eventually', async function ({ task }) {
    const c1 = new yorkie.Client(testRPCAddr);
    const c2 = new yorkie.Client(testRPCAddr);
    await c1.activate();
    await c2.activate();
    const c1ID = c1.getID()!;
    const c2ID = c2.getID()!;

    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const eventCollectorP1 = new EventCollector<DocEvent>();
    const eventCollectorP2 = new EventCollector<DocEvent>();
    type PresenceType = { name: string };
    const doc1 = new yorkie.Document<{}, PresenceType>(docKey);
    await c1.attach(doc1, { initialPresence: { name: 'a' } });
    const stub1 = vi.fn().mockImplementation((event) => {
      eventCollectorP1.add(event);
    });
    const unsub1 = doc1.subscribe('presence', stub1);

    const doc2 = new yorkie.Document<{}, PresenceType>(docKey);
    await c2.attach(doc2, { initialPresence: { name: 'b' } });
    const stub2 = vi.fn().mockImplementation((event) => {
      eventCollectorP2.add(event);
    });
    const unsub2 = doc2.subscribe('presence', stub2);
    await eventCollectorP1.waitAndVerifyNthEvent(1, {
      type: DocEventType.Watched,
      value: { clientID: c2ID, presence: { name: 'b' } },
    });

    doc1.update((root, p) => p.set({ name: 'A' }));
    doc2.update((root, p) => p.set({ name: 'B' }));

    await eventCollectorP1.waitAndVerifyNthEvent(2, {
      type: DocEventType.PresenceChanged,
      value: { clientID: c1ID, presence: { name: 'A' } },
    });
    await eventCollectorP1.waitAndVerifyNthEvent(3, {
      type: DocEventType.PresenceChanged,
      value: { clientID: c2ID, presence: { name: 'B' } },
    });
    await eventCollectorP2.waitAndVerifyNthEvent(1, {
      type: DocEventType.PresenceChanged,
      value: { clientID: c2ID, presence: { name: 'B' } },
    });
    await eventCollectorP2.waitAndVerifyNthEvent(2, {
      type: DocEventType.PresenceChanged,
      value: { clientID: c1ID, presence: { name: 'A' } },
    });
    assert.deepEqual(
      deepSort(doc2.getPresences()),
      deepSort([
        { clientID: c2ID, presence: { name: 'B' } },
        { clientID: c1ID, presence: { name: 'A' } },
      ]),
    );
    assert.deepEqual(
      deepSort(doc1.getPresences()),
      deepSort([
        { clientID: c2ID, presence: { name: 'B' } },
        { clientID: c1ID, presence: { name: 'A' } },
      ]),
    );

    await c1.deactivate();
    await c2.deactivate();

    unsub1();
    unsub2();
  });

  it('Can be updated partially by doc.update function', async function ({
    task,
  }) {
    const c1 = new yorkie.Client(testRPCAddr);
    const c2 = new yorkie.Client(testRPCAddr);
    await c1.activate();
    await c2.activate();

    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
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

  it(`Should return only online clients`, async function ({ task }) {
    const c1 = new yorkie.Client(testRPCAddr);
    const c2 = new yorkie.Client(testRPCAddr);
    const c3 = new yorkie.Client(testRPCAddr);
    await c1.activate();
    await c2.activate();
    await c3.activate();
    const c1ID = c1.getID()!;
    const c2ID = c2.getID()!;
    const c3ID = c3.getID()!;

    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    type PresenceType = { name: string; cursor: { x: number; y: number } };
    const doc1 = new yorkie.Document<{}, PresenceType>(docKey);
    await c1.attach(doc1, {
      initialPresence: { name: 'a1', cursor: { x: 0, y: 0 } },
    });

    const eventCollector = new EventCollector<DocEvent>();
    const stub = vi.fn().mockImplementation((event) => {
      eventCollector.add(event);
    });
    const unsub = doc1.subscribe('presence', stub);

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
    await eventCollector.waitAndVerifyNthEvent(1, {
      type: DocEventType.Watched,
      value: { clientID: c2ID, presence: doc2.getMyPresence() },
    });
    assert.deepEqual(doc1.getPresences(), [
      { clientID: c1ID, presence: doc1.getMyPresence() },
      { clientID: c2ID, presence: doc2.getMyPresence() },
    ]);
    assert.deepEqual(doc1.getPresence(c3ID), undefined);

    // 02. c2 pauses the document (in manual sync), c3 resumes the document (in realtime sync).
    await c2.pause(doc2);
    await eventCollector.waitAndVerifyNthEvent(2, {
      type: DocEventType.Unwatched,
      value: { clientID: c2ID, presence: doc2.getMyPresence() },
    });
    await c3.resume(doc3);
    await eventCollector.waitAndVerifyNthEvent(3, {
      type: DocEventType.Watched,
      value: { clientID: c3ID, presence: doc3.getMyPresence() },
    });
    assert.deepEqual(doc1.getPresences(), [
      { clientID: c1ID, presence: doc1.getMyPresence() },
      { clientID: c3ID, presence: doc3.getMyPresence() },
    ]);
    assert.deepEqual(doc1.getPresence(c2ID), undefined);

    unsub();
    await c1.deactivate();
    await c2.deactivate();
    await c3.deactivate();
  });

  it('Can get presence value using p.get() within doc.update function', async function ({
    task,
  }) {
    const c1 = new yorkie.Client(testRPCAddr);
    const c2 = new yorkie.Client(testRPCAddr);
    await c1.activate();
    await c2.activate();

    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
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

describe.skip(`Document.Subscribe('presence')`, function () {
  it(`Should receive presence-changed event for final presence if there are multiple presence changes within doc.update`, async function ({
    task,
  }) {
    const c1 = new yorkie.Client(testRPCAddr);
    const c2 = new yorkie.Client(testRPCAddr);
    await c1.activate();
    await c2.activate();
    const c1ID = c1.getID()!;
    const c2ID = c2.getID()!;

    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const eventCollectorP1 = new EventCollector<DocEvent>();
    const eventCollectorP2 = new EventCollector<DocEvent>();
    type PresenceType = { name: string; cursor: { x: number; y: number } };
    const doc1 = new yorkie.Document<{}, PresenceType>(docKey);
    await c1.attach(doc1, {
      initialPresence: { name: 'a', cursor: { x: 0, y: 0 } },
    });
    const stub1 = vi.fn().mockImplementation((event) => {
      eventCollectorP1.add(event);
    });
    const unsub1 = doc1.subscribe('presence', stub1);

    const doc2 = new yorkie.Document<{}, PresenceType>(docKey);
    await c2.attach(doc2, {
      initialPresence: { name: 'b', cursor: { x: 0, y: 0 } },
    });
    const stub2 = vi.fn().mockImplementation((event) => {
      eventCollectorP2.add(event);
    });
    const unsub2 = doc2.subscribe('presence', stub2);
    await eventCollectorP1.waitAndVerifyNthEvent(1, {
      type: DocEventType.Watched,
      value: { clientID: c2ID, presence: doc2.getMyPresence() },
    });

    doc1.update((root, p) => {
      p.set({ name: 'A' });
      p.set({ cursor: { x: 1, y: 1 } });
      p.set({ name: 'X' });
    });

    await eventCollectorP1.waitAndVerifyNthEvent(2, {
      type: DocEventType.PresenceChanged,
      value: { clientID: c1ID, presence: doc1.getMyPresence() },
    });
    await eventCollectorP2.waitAndVerifyNthEvent(1, {
      type: DocEventType.PresenceChanged,
      value: { clientID: c1ID, presence: doc1.getMyPresence() },
    });

    await c1.deactivate();
    await c2.deactivate();

    unsub1();
    unsub2();
  });

  it(`Can receive 'unwatched' event when a client detaches`, async function ({
    task,
  }) {
    const c1 = new yorkie.Client(testRPCAddr);
    const c2 = new yorkie.Client(testRPCAddr);
    await c1.activate();
    await c2.activate();
    const c1ID = c1.getID()!;
    const c2ID = c2.getID()!;

    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    type PresenceType = { name: string };
    const eventCollector = new EventCollector<DocEvent>();
    const doc1 = new yorkie.Document<{}, PresenceType>(docKey);
    await c1.attach(doc1, { initialPresence: { name: 'a' } });
    const stub1 = vi.fn().mockImplementation((event) => {
      eventCollector.add(event);
    });
    const unsub1 = doc1.subscribe('presence', stub1);

    const doc2 = new yorkie.Document<{}, PresenceType>(docKey);
    await c2.attach(doc2, { initialPresence: { name: 'b' } });
    await eventCollector.waitAndVerifyNthEvent(1, {
      type: DocEventType.Watched,
      value: { clientID: c2ID, presence: { name: 'b' } },
    });

    await c2.detach(doc2);
    await eventCollector.waitAndVerifyNthEvent(2, {
      type: DocEventType.Unwatched,
      value: { clientID: c2ID, presence: { name: 'b' } },
    });

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

  it(`Can receive presence-related event only when using realtime sync`, async function ({
    task,
  }) {
    const c1 = new yorkie.Client(testRPCAddr);
    const c2 = new yorkie.Client(testRPCAddr);
    const c3 = new yorkie.Client(testRPCAddr);
    await c1.activate();
    await c2.activate();
    await c3.activate();
    const c2ID = c2.getID()!;
    const c3ID = c3.getID()!;

    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    type PresenceType = { name: string; cursor: { x: number; y: number } };
    const doc1 = new yorkie.Document<{}, PresenceType>(docKey);
    await c1.attach(doc1, {
      initialPresence: { name: 'a1', cursor: { x: 0, y: 0 } },
    });
    const eventCollector = new EventCollector<DocEvent>();
    const stub = vi.fn().mockImplementation((event) => {
      eventCollector.add(event);
    });
    const unsub = doc1.subscribe('presence', stub);

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
    await eventCollector.waitAndVerifyNthEvent(1, {
      type: DocEventType.Watched,
      value: {
        clientID: c2ID,
        presence: { cursor: { x: 0, y: 0 }, name: 'b1' },
      },
    });

    // 02. c2 and c3 update the presence.
    //     c1 receives the presence-changed event from c2.
    doc2.update((_, presence) => {
      presence.set({ name: 'b2' });
    });
    doc3.update((_, presence) => {
      presence.set({ name: 'c2' });
    });
    await eventCollector.waitAndVerifyNthEvent(2, {
      type: DocEventType.PresenceChanged,
      value: {
        clientID: c2ID,
        presence: { cursor: { x: 0, y: 0 }, name: 'b2' },
      },
    });

    // 03-1. c2 pauses the document, c1 receives an unwatched event from c2.
    await c2.pause(doc2);
    await eventCollector.waitAndVerifyNthEvent(3, {
      type: DocEventType.Unwatched,
      value: {
        clientID: c2ID,
        presence: { cursor: { x: 0, y: 0 }, name: 'b2' },
      },
    });
    // 03-2. c3 resumes the document, c1 receives a watched event from c3.
    // NOTE(chacha912): The events are influenced by the timing of realtime sync
    // and watch stream resolution. For deterministic testing, the resume is performed
    // after the sync. Since the sync updates c1 with all previous presence changes
    // from c3, only the watched event is triggered.
    await c3.sync();
    await c1.sync();
    await c3.resume(doc3);
    await eventCollector.waitAndVerifyNthEvent(4, {
      type: DocEventType.Watched,
      value: {
        clientID: c3ID,
        presence: { cursor: { x: 0, y: 0 }, name: 'c2' },
      },
    });

    // 04. c2 and c3 update the presence.
    //     c1 receives the presence-changed event from c3.
    doc2.update((_, presence) => {
      presence.set({ name: 'b3' });
    });
    doc3.update((_, presence) => {
      presence.set({ name: 'c3' });
    });
    await eventCollector.waitAndVerifyNthEvent(5, {
      type: DocEventType.PresenceChanged,
      value: {
        clientID: c3ID,
        presence: { cursor: { x: 0, y: 0 }, name: 'c3' },
      },
    });

    // 05-1. c3 pauses the document, c1 receives an unwatched event from c3.
    await c3.pause(doc3);
    await eventCollector.waitAndVerifyNthEvent(6, {
      type: DocEventType.Unwatched,
      value: {
        clientID: c3ID,
        presence: { cursor: { x: 0, y: 0 }, name: 'c3' },
      },
    });

    // 05-2. c2 resumes the document, c1 receives a watched event from c2.
    await c2.sync();
    await c1.sync();
    await c2.resume(doc2);
    await eventCollector.waitAndVerifyNthEvent(7, {
      type: DocEventType.Watched,
      value: {
        clientID: c2ID,
        presence: { cursor: { x: 0, y: 0 }, name: 'b3' },
      },
    });

    unsub();
    await c1.deactivate();
    await c2.deactivate();
    await c3.deactivate();
  });
});

describe.skip('Undo/Redo', function () {
  it('Can undo/redo with presence', async function ({ task }) {
    type TestDoc = { counter: Counter };
    type Presence = { color: string };
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const doc = new yorkie.Document<TestDoc, Presence>(docKey);
    doc.update((root) => {
      root.counter = new Counter(yorkie.IntType, 100);
    }, 'init counter');

    const client = new yorkie.Client(testRPCAddr);
    await client.activate();
    await client.attach(doc, { initialPresence: { color: 'red' } });

    // 1. Presence update only
    doc.update((root, presence) => {
      presence.set({ color: 'blue' }, { addToHistory: true });
    });
    assert.deepEqual(doc.getMyPresence(), {
      color: 'blue',
    });

    doc.history.undo();
    assert.deepEqual(doc.getMyPresence(), {
      color: 'red',
    });

    doc.history.redo();
    assert.deepEqual(doc.getMyPresence(), {
      color: 'blue',
    });

    // 2. Presence update with root update
    doc.update((root, presence) => {
      root.counter.increase(1);
      presence.set({ color: 'green' }, { addToHistory: true });
    }, 'increase 1');
    assert.equal(doc.toSortedJSON(), '{"counter":101}');
    assert.deepEqual(doc.getMyPresence(), {
      color: 'green',
    });

    doc.history.undo();
    assert.equal(doc.toSortedJSON(), '{"counter":100}');
    assert.deepEqual(doc.getMyPresence(), {
      color: 'blue',
    });

    doc.history.redo();
    assert.equal(doc.toSortedJSON(), '{"counter":101}');
    assert.deepEqual(doc.getMyPresence(), {
      color: 'green',
    });

    await client.deactivate();
  });

  it('Should not impact undo if presence is not added to history', async function ({
    task,
  }) {
    type Presence = { color: string; cursor: { x: number; y: number } };
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const doc = new yorkie.Document<{}, Presence>(docKey);

    const client = new yorkie.Client(testRPCAddr);
    await client.activate();
    await client.attach(doc, {
      initialPresence: { color: 'red', cursor: { x: 0, y: 0 } },
    });

    // 1. Setting addToHistory for both color and cursor
    doc.update((root, presence) => {
      presence.set(
        { color: 'blue', cursor: { x: 1, y: 1 } },
        { addToHistory: true },
      );
    });
    assert.deepEqual(doc.getMyPresence(), {
      color: 'blue',
      cursor: { x: 1, y: 1 },
    });
    assert.deepEqual(doc.getUndoStackForTest(), [
      [
        {
          type: 'presence',
          value: { color: 'red', cursor: { x: 0, y: 0 } },
        },
      ],
    ]);

    doc.history.undo();
    assert.deepEqual(doc.getMyPresence(), {
      color: 'red',
      cursor: { x: 0, y: 0 },
    });

    doc.history.redo();
    assert.deepEqual(doc.getMyPresence(), {
      color: 'blue',
      cursor: { x: 1, y: 1 },
    });

    // 2. Setting addToHistory only for the cursor
    doc.update((root, presence) => {
      presence.set({ color: 'green' });
      presence.set({ cursor: { x: 2, y: 2 } }, { addToHistory: true });
    });
    assert.deepEqual(doc.getMyPresence(), {
      color: 'green',
      cursor: { x: 2, y: 2 },
    });
    assert.deepEqual(doc.getUndoStackForTest(), [
      [
        {
          type: 'presence',
          value: { color: 'red', cursor: { x: 0, y: 0 } },
        },
      ],
      [
        {
          type: 'presence',
          value: { cursor: { x: 1, y: 1 } },
        },
      ],
    ]);

    doc.history.undo();
    assert.deepEqual(doc.getMyPresence(), {
      color: 'green',
      cursor: { x: 1, y: 1 },
    });

    doc.history.redo();
    assert.deepEqual(doc.getMyPresence(), {
      color: 'green',
      cursor: { x: 2, y: 2 },
    });

    // 3. Not setting addToHistory
    doc.update((root, presence) => {
      presence.set({ color: 'black' });
      presence.set({ cursor: { x: 3, y: 3 } });
    });
    assert.deepEqual(doc.getMyPresence(), {
      color: 'black',
      cursor: { x: 3, y: 3 },
    });
    assert.deepEqual(doc.getUndoStackForTest(), [
      [
        {
          type: 'presence',
          value: { color: 'red', cursor: { x: 0, y: 0 } },
        },
      ],
      [
        {
          type: 'presence',
          value: { cursor: { x: 1, y: 1 } },
        },
      ],
    ]);

    doc.history.undo();
    assert.deepEqual(doc.getMyPresence(), {
      color: 'black',
      cursor: { x: 1, y: 1 },
    });

    doc.history.redo();
    assert.deepEqual(doc.getMyPresence(), {
      color: 'black',
      cursor: { x: 3, y: 3 },
    });

    await client.deactivate();
  });

  it('Should handle undo/redo correctly for multiple changes to a single presence key within update', async function ({
    task,
  }) {
    type Presence = { color: string };
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const doc = new yorkie.Document<{}, Presence>(docKey);

    const client = new yorkie.Client(testRPCAddr);
    await client.activate();
    await client.attach(doc, { initialPresence: { color: 'red' } });

    // 1. When multiple changes are made to the "color" key,
    // it should revert to the value before doc.update() call.
    doc.update((root, presence) => {
      presence.set({ color: 'blue' }, { addToHistory: true });
      presence.set({ color: 'green' }, { addToHistory: true });
    });
    assert.deepEqual(doc.getMyPresence(), {
      color: 'green',
    });

    doc.history.undo();
    assert.deepEqual(doc.getMyPresence(), {
      color: 'red',
    });

    doc.history.redo();
    assert.deepEqual(doc.getMyPresence(), {
      color: 'green',
    });

    // 2. `addToHistory` option accumulates for a single key,
    // applying to the last key only. When set to true for the
    // last "color" key, it adds the color to the undo stack.
    doc.update((root, presence) => {
      presence.set({ color: 'black' });
      presence.set({ color: 'purple' }, { addToHistory: true });
    });
    assert.deepEqual(doc.getMyPresence(), {
      color: 'purple',
    });

    doc.history.undo();
    assert.deepEqual(doc.getMyPresence(), {
      color: 'green',
    });

    doc.history.redo();
    assert.deepEqual(doc.getMyPresence(), {
      color: 'purple',
    });

    // 3. When `addToHistory` is false for the last key, it
    // will not be added to the undo stack. The default value
    // when the option is not set is false.
    doc.update((root, presence) => {
      presence.set({ color: 'yellow' }, { addToHistory: true });
      presence.set({ color: 'orange' });
    });
    assert.deepEqual(doc.getMyPresence(), {
      color: 'orange',
    });

    doc.history.undo();
    assert.deepEqual(doc.getMyPresence(), {
      color: 'green',
    });

    doc.history.redo();
    assert.deepEqual(doc.getMyPresence(), {
      color: 'orange',
    });

    await client.deactivate();
  });
});
