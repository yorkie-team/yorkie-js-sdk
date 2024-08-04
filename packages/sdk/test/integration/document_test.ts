import { describe, it, assert, vi, afterEach } from 'vitest';
import yorkie, {
  Counter,
  Text,
  JSONArray,
  SyncMode,
} from '@yorkie-js-sdk/src/yorkie';
import {
  testRPCAddr,
  toDocKey,
} from '@yorkie-js-sdk/test/integration/integration_helper';
import {
  EventCollector,
  assertThrowsAsync,
} from '@yorkie-js-sdk/test/helper/helper';
import type { CRDTElement } from '@yorkie-js-sdk/src/document/crdt/element';
import {
  DocumentStatus,
  DocEventType,
  StatusChangedEvent,
} from '@yorkie-js-sdk/src/document/document';
import { OperationInfo } from '@yorkie-js-sdk/src/document/operation/operation';
import { YorkieError } from '@yorkie-js-sdk/src/util/error';

describe('Document', function () {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('Can attach/detach documents', async function ({ task }) {
    type TestDoc = { k1: { ['k1-1']: string }; k2: Array<string> };
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const doc1 = new yorkie.Document<TestDoc>(docKey);
    const doc2 = new yorkie.Document<TestDoc>(docKey);

    const client1 = new yorkie.Client(testRPCAddr);
    const client2 = new yorkie.Client(testRPCAddr);
    await client1.activate();
    await client2.activate();

    await client1.attach(doc1, { syncMode: SyncMode.Manual });
    doc1.update((root) => {
      root['k1'] = { 'k1-1': 'v1' };
      root['k2'] = ['1', '2'];
    }, 'set v1, v2');
    await client1.sync();
    assert.equal('{"k1":{"k1-1":"v1"},"k2":["1","2"]}', doc1.toSortedJSON());

    await client2.attach(doc2, { syncMode: SyncMode.Manual });
    assert.equal('{"k1":{"k1-1":"v1"},"k2":["1","2"]}', doc2.toSortedJSON());

    await client1.detach(doc1);
    await client2.detach(doc2);

    await client1.deactivate();
    await client2.deactivate();
  });

  it('Can remove document using removeIfNotAttached option when detaching', async function ({
    task,
  }) {
    type TestDoc = { k1: Array<number>; k2: Array<number> };
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const doc1 = new yorkie.Document<TestDoc>(docKey);
    const doc2 = new yorkie.Document<TestDoc>(docKey);

    const client1 = new yorkie.Client(testRPCAddr);
    const client2 = new yorkie.Client(testRPCAddr);
    await client1.activate();
    await client2.activate();

    // 1. client1 attaches and updates the document.
    await client1.attach(doc1);
    assert.equal('{}', doc1.toSortedJSON());
    doc1.update((root) => {
      root.k1 = [1, 2];
      root.k2 = [3, 4];
    });
    await client1.sync();
    assert.equal('{"k1":[1,2],"k2":[3,4]}', doc1.toSortedJSON());

    // 2. client2 attaches the document.
    await client2.attach(doc2);
    assert.equal('{"k1":[1,2],"k2":[3,4]}', doc2.toSortedJSON());

    // 3. client1 detaches the document.
    // The document is not removed as client2 is still attached to it.
    await client1.detach(doc1, { removeIfNotAttached: true });
    assert.equal(doc1.getStatus(), DocumentStatus.Detached);

    // 4. client2 detaches the document.
    // Since no client is attached to the document, it gets removed.
    await client2.detach(doc2, { removeIfNotAttached: true });
    assert.equal(doc2.getStatus(), DocumentStatus.Removed);

    // 5. client3 attaches the document.
    // The content of the removed document should not be exposed.
    const doc3 = new yorkie.Document<TestDoc>(docKey);
    const client3 = new yorkie.Client(testRPCAddr);
    await client3.activate();
    await client3.attach(doc3);
    assert.equal('{}', doc3.toSortedJSON());

    await client1.deactivate();
    await client2.deactivate();
    await client3.deactivate();
  });

  it('Can watch documents', async function ({ task }) {
    const c1 = new yorkie.Client(testRPCAddr);
    const c2 = new yorkie.Client(testRPCAddr);
    await c1.activate();
    await c2.activate();

    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const d1 = new yorkie.Document<{ k1: string }>(docKey);
    const d2 = new yorkie.Document<{ k1: string }>(docKey);
    await c1.attach(d1);
    await c2.attach(d2);

    const eventCollectorD1 = new EventCollector();
    const eventCollectorD2 = new EventCollector();
    const unsub1 = d1.subscribe((event) => {
      eventCollectorD1.add(event.type);
    });
    const unsub2 = d2.subscribe((event) => {
      eventCollectorD2.add(event.type);
    });

    d2.update((root) => {
      root['k1'] = 'v1';
    });

    await eventCollectorD2.waitAndVerifyNthEvent(1, DocEventType.LocalChange);
    await eventCollectorD1.waitAndVerifyNthEvent(1, DocEventType.RemoteChange);
    assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

    unsub1();
    unsub2();

    await c1.detach(d1);
    await c2.detach(d2);
    await c1.deactivate();
    await c2.deactivate();
  });

  it('detects the events from doc.subscribe', async function ({ task }) {
    const c1 = new yorkie.Client(testRPCAddr);
    const c2 = new yorkie.Client(testRPCAddr);
    await c1.activate();
    await c2.activate();

    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    type TestDoc = {
      counter: Counter;
      todos: JSONArray<string>; // specify type as `JSONArray` to use the `moveAfter` method
      content: Text;
      obj: {
        name: string;
        age: number;
        food?: Array<string>;
        score: Record<string, number>;
      };
    };
    const d1 = new yorkie.Document<TestDoc>(docKey);
    const d2 = new yorkie.Document<TestDoc>(docKey);
    await c1.attach(d1);
    await c2.attach(d2);

    type EventForTest = {
      type: DocEventType;
      value: Array<OperationInfo>;
    };
    let expectedEventValue: Array<OperationInfo>;
    const eventCollectorD1 = new EventCollector<EventForTest>();
    const eventCollectorD2 = new EventCollector<EventForTest>();
    const unsub1 = d1.subscribe((event) => {
      if (event.type === DocEventType.Snapshot) {
        return;
      }
      eventCollectorD1.add({ type: event.type, value: event.value.operations });
    });
    const unsub2 = d2.subscribe((event) => {
      if (event.type === DocEventType.Snapshot) {
        return;
      }
      eventCollectorD2.add({ type: event.type, value: event.value.operations });
    });

    d1.update((root) => {
      root.counter = new yorkie.Counter(yorkie.IntType, 100);
      root.todos = ['todo1', 'todo2', 'todo3'];
      root.content = new yorkie.Text();
      root.content.edit(0, 0, 'hello world', {
        italic: true,
        objAttr: { key1: { key2: 'value' } },
      });
      root.obj = {
        name: 'josh',
        age: 14,
        food: ['🍏', '🍇'],
        score: {
          english: 80,
          math: 90,
        },
      };
      root.obj.score = { science: 100 };
      delete root.obj.food;
    });
    expectedEventValue = [
      { type: 'set', path: '$', key: 'counter' },
      { type: 'set', path: '$', key: 'todos' },
      { type: 'set', path: '$', key: 'content' },
      {
        type: 'edit',
        from: 0,
        to: 0,
        value: {
          attributes: { italic: true, objAttr: { key1: { key2: 'value' } } },
          content: 'hello world',
        },
        path: '$.content',
      },
      { type: 'set', path: '$', key: 'obj' },
      { type: 'set', path: '$.obj', key: 'score' },
      { type: 'remove', path: '$.obj', key: 'food' },
    ];
    await eventCollectorD1.waitAndVerifyNthEvent(1, {
      type: DocEventType.LocalChange,
      value: expectedEventValue,
    });
    await eventCollectorD2.waitAndVerifyNthEvent(1, {
      type: DocEventType.RemoteChange,
      value: expectedEventValue,
    });

    d2.update((root) => {
      root.counter.increase(1);
      root.todos.push('todo4');
      const prevItem = root.todos.getElementByIndex!(1);
      const currItem = root.todos.getElementByIndex!(0);
      root.todos.moveAfter!(prevItem.getID!(), currItem.getID!());
      root.content.setStyle(0, 5, { bold: true });
    });
    expectedEventValue = [
      { type: 'increase', path: '$.counter', value: 1 },
      { type: 'add', path: '$.todos', index: 3 },
      {
        type: 'move',
        path: '$.todos',
        index: 1,
        previousIndex: 0,
      },
      {
        type: 'style',
        from: 0,
        to: 5,
        value: { attributes: { bold: true } },
        path: '$.content',
      },
    ];
    await eventCollectorD1.waitAndVerifyNthEvent(2, {
      type: DocEventType.RemoteChange,
      value: expectedEventValue,
    });
    await eventCollectorD2.waitAndVerifyNthEvent(2, {
      type: DocEventType.LocalChange,
      value: expectedEventValue,
    });
    assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    unsub1();
    unsub2();

    await c1.detach(d1);
    await c2.detach(d2);
    await c1.deactivate();
    await c2.deactivate();
  });

  it('specify the topic to subscribe to', async function ({ task }) {
    const c1 = new yorkie.Client(testRPCAddr);
    const c2 = new yorkie.Client(testRPCAddr);
    await c1.activate();
    await c2.activate();

    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    type TestDoc = {
      counter: Counter;
      todos: JSONArray<string>;
    };
    const d1 = new yorkie.Document<TestDoc>(docKey);
    const d2 = new yorkie.Document<TestDoc>(docKey);
    await c1.attach(d1);
    await c2.attach(d2);

    type EventForTest = Array<OperationInfo>;
    const eventCollector = new EventCollector<EventForTest>();
    const eventCollectorForTodos = new EventCollector<EventForTest>();
    const eventCollectorForCounter = new EventCollector<EventForTest>();
    const unsub = d1.subscribe((event) => {
      if (event.type === DocEventType.Snapshot) {
        return;
      }
      eventCollector.add(event.value.operations);
    });
    const unsubTodo = d1.subscribe('$.todos', (event) => {
      eventCollectorForTodos.add(event.value.operations);
    });
    const unsubCounter = d1.subscribe('$.counter', (event) => {
      eventCollectorForCounter.add(event.value.operations);
    });

    d2.update((root) => {
      root.counter = new yorkie.Counter(yorkie.IntType, 0);
      root.todos = ['todo1', 'todo2'];
    });
    await eventCollector.waitAndVerifyNthEvent(1, [
      { type: 'set', path: '$', key: 'counter' },
      { type: 'set', path: '$', key: 'todos' },
    ]);

    d2.update((root) => {
      root.counter.increase(10);
    });
    await eventCollector.waitAndVerifyNthEvent(2, [
      { type: 'increase', path: '$.counter', value: 10 },
    ]);
    await eventCollectorForCounter.waitAndVerifyNthEvent(1, [
      { type: 'increase', path: '$.counter', value: 10 },
    ]);

    d2.update((root) => {
      root.todos.push('todo3');
    });
    await eventCollector.waitAndVerifyNthEvent(3, [
      { type: 'add', path: '$.todos', index: 2 },
    ]);
    await eventCollectorForTodos.waitAndVerifyNthEvent(1, [
      { type: 'add', path: '$.todos', index: 2 },
    ]);

    unsubTodo();
    d2.update((root) => {
      root.todos.push('todo4');
    });
    await eventCollector.waitAndVerifyNthEvent(4, [
      { type: 'add', path: '$.todos', index: 3 },
    ]);
    assert.equal(eventCollectorForTodos.getLength(), 1); // No events after unsubscribing `$.todos`

    unsubCounter();
    d2.update((root) => {
      root.counter.increase(10);
    });
    await eventCollector.waitAndVerifyNthEvent(5, [
      { type: 'increase', path: '$.counter', value: 10 },
    ]);
    assert.equal(eventCollectorForCounter.getLength(), 1); // No events after unsubscribing `$.counter`

    unsub();
    await c1.detach(d1);
    await c2.detach(d2);
    await c1.deactivate();
    await c2.deactivate();
  });

  it('specify the nested topic to subscribe to', async function ({ task }) {
    const c1 = new yorkie.Client(testRPCAddr);
    const c2 = new yorkie.Client(testRPCAddr);
    await c1.activate();
    await c2.activate();

    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    type TestDoc = {
      todos: Array<{
        text: string;
        completed: boolean;
      }>;
      obj: Record<string, { name: string; age: number }>;
    };
    const d1 = new yorkie.Document<TestDoc>(docKey);
    const d2 = new yorkie.Document<TestDoc>(docKey);
    await c1.attach(d1);
    await c2.attach(d2);

    type EventForTest = Array<OperationInfo>;
    const eventCollector = new EventCollector<EventForTest>();
    const eventCollectorForTodos0 = new EventCollector<EventForTest>();
    const eventCollectorForObjC1 = new EventCollector<EventForTest>();
    const unsub = d1.subscribe((event) => {
      if (event.type === DocEventType.Snapshot) {
        return;
      }
      eventCollector.add(event.value.operations);
    });
    const unsubTodo = d1.subscribe('$.todos.0', (event) => {
      eventCollectorForTodos0.add(event.value.operations);
    });
    const unsubObj = d1.subscribe('$.obj.c1', (event) => {
      eventCollectorForObjC1.add(event.value.operations);
    });

    d2.update((root) => {
      root.todos = [{ text: 'todo1', completed: false }];
      root.obj = {
        c1: { name: 'josh', age: 14 },
      };
    });
    await eventCollector.waitAndVerifyNthEvent(1, [
      { type: 'set', path: '$', key: 'todos' },
      { type: 'set', path: '$', key: 'obj' },
    ]);

    d2.update((root) => {
      root.obj.c1.name = 'john';
    });
    await eventCollector.waitAndVerifyNthEvent(2, [
      { type: 'set', path: '$.obj.c1', key: 'name' },
    ]);
    await eventCollectorForObjC1.waitAndVerifyNthEvent(1, [
      { type: 'set', path: '$.obj.c1', key: 'name' },
    ]);

    d2.update((root) => {
      root.todos[0].completed = true;
    });
    await eventCollector.waitAndVerifyNthEvent(3, [
      { type: 'set', path: '$.todos.0', key: 'completed' },
    ]);
    await eventCollectorForTodos0.waitAndVerifyNthEvent(1, [
      { type: 'set', path: '$.todos.0', key: 'completed' },
    ]);

    unsubTodo();
    d2.update((root) => {
      root.todos[0].text = 'todo_1';
    });
    await eventCollector.waitAndVerifyNthEvent(4, [
      { type: 'set', path: '$.todos.0', key: 'text' },
    ]);
    assert.equal(eventCollectorForTodos0.getLength(), 1); // No events after unsubscribing `$.todos.0`

    unsubObj();
    d2.update((root) => {
      root.obj.c1.age = 15;
    });
    await eventCollector.waitAndVerifyNthEvent(5, [
      { type: 'set', path: '$.obj.c1', key: 'age' },
    ]);
    assert.equal(eventCollectorForObjC1.getLength(), 1); // No events after unsubscribing `$.obj.c1`

    unsub();
    await c1.detach(d1);
    await c2.detach(d2);
    await c1.deactivate();
    await c2.deactivate();
  });

  it('Can handle tombstone', async function ({ task }) {
    type TestDoc = { k1: Array<number> };
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const d1 = new yorkie.Document<TestDoc>(docKey);
    const d2 = new yorkie.Document<TestDoc>(docKey);

    const c1 = new yorkie.Client(testRPCAddr);
    const c2 = new yorkie.Client(testRPCAddr);
    await c1.activate();
    await c2.activate();

    await c1.attach(d1, { syncMode: SyncMode.Manual });
    await c2.attach(d2, { syncMode: SyncMode.Manual });

    d1.update((root) => {
      root['k1'] = [1, 2];
    }, 'set array');

    await c1.sync();
    await c2.sync();
    assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

    let prevArray: CRDTElement | undefined;
    d1.update((root) => {
      root.k1.push(3);
      prevArray = d1.getRootObject().get('k1') as unknown as CRDTElement;
    }, 'push element to k1');
    d2.update((root) => {
      root.k1 = [];
    }, 'reassign k1 with new array');
    await c2.sync();
    await c1.sync();

    assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    assert.isTrue(prevArray?.isRemoved());
  });

  it('Can remove document', async function ({ task }) {
    type TestDoc = { k1: Array<number> };
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const d1 = new yorkie.Document<TestDoc>(docKey);
    const c1 = new yorkie.Client(testRPCAddr);
    const c1Key = c1.getKey();

    // 01. client is not activated.
    assertThrowsAsync(
      async () => {
        await c1.remove(d1);
      },
      YorkieError,
      `${c1Key} is not active`,
    );

    // 02. document is not attached.
    await c1.activate();
    assertThrowsAsync(
      async () => {
        await c1.remove(d1);
      },
      YorkieError,
      `${docKey} is not attached`,
    );

    // 03. document is attached.
    await c1.attach(d1);
    await c1.remove(d1);

    // 04. try to update a removed document.
    assert.throws(
      () => {
        d1.update((root) => {
          root['k1'] = [1, 2];
        }, 'set array');
      },
      YorkieError,
      `${docKey} is removed`,
    );

    // 05. try to attach a removed document.
    assertThrowsAsync(
      async () => {
        await c1.attach(d1);
      },
      YorkieError,
      `${docKey} is not detached`,
    );

    await c1.deactivate();
  });

  it('Can create document with the same key as the removed document key', async function ({
    task,
  }) {
    type TestDoc = { k1: Array<number> };
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);

    // 01. c1 creates d1 and removes it.
    const c1 = new yorkie.Client(testRPCAddr);
    await c1.activate();
    const d1 = new yorkie.Document<TestDoc>(docKey);
    d1.update((root) => {
      root['k1'] = [1, 2];
    }, 'set array');
    await c1.attach(d1);
    assert.equal(d1.toSortedJSON(), '{"k1":[1,2]}');
    await c1.remove(d1);

    // 02. c2 creates d2 with the same key.
    const c2 = new yorkie.Client(testRPCAddr);
    await c2.activate();
    const d2 = new yorkie.Document<TestDoc>(docKey);
    await c2.attach(d2);

    // 02. c1 creates d2 with the same key.
    const d3 = new yorkie.Document<TestDoc>(docKey);
    await c1.attach(d3);
    assert.equal(d2.toSortedJSON(), '{}');
    assert.equal(d3.toSortedJSON(), '{}');

    await c1.deactivate();
    await c2.deactivate();
  });

  it('Can know that document has been removed when doing client.sync()', async function ({
    task,
  }) {
    type TestDoc = { k1: Array<number> };
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);

    // 01. c1 attaches d1 and c2 watches same doc.
    const c1 = new yorkie.Client(testRPCAddr);
    await c1.activate();
    const d1 = new yorkie.Document<TestDoc>(docKey);
    d1.update((root) => {
      root['k1'] = [1, 2];
    }, 'set array');
    await c1.attach(d1, { syncMode: SyncMode.Manual });
    assert.equal(d1.toSortedJSON(), '{"k1":[1,2]}');

    const c2 = new yorkie.Client(testRPCAddr);
    await c2.activate();
    const d2 = new yorkie.Document<TestDoc>(docKey);
    await c2.attach(d2, { syncMode: SyncMode.Manual });
    assert.equal(d2.toSortedJSON(), '{"k1":[1,2]}');

    // 02. c1 updates d1 and removes it.
    d1.update((root) => {
      root['k1'].push(3);
    });
    await c1.remove(d1);
    assert.equal(d1.toSortedJSON(), '{"k1":[1,2,3]}', 'd1');
    assert.equal(d1.getStatus(), DocumentStatus.Removed);

    // 03. c2 syncs and checks that d2 is removed.
    await c2.sync();
    assert.equal(d2.toSortedJSON(), '{"k1":[1,2,3]}', 'd2');
    assert.equal(d2.getStatus(), DocumentStatus.Removed);

    await c1.deactivate();
    await c2.deactivate();
  });

  it('Can know that document has been removed when doing client.detach()', async function ({
    task,
  }) {
    type TestDoc = { k1: Array<number> };
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);

    // 01. c1 attaches d1 and c2 watches same doc.
    const c1 = new yorkie.Client(testRPCAddr);
    await c1.activate();
    const d1 = new yorkie.Document<TestDoc>(docKey);
    d1.update((root) => {
      root['k1'] = [1, 2];
    }, 'set array');
    await c1.attach(d1, { syncMode: SyncMode.Manual });
    assert.equal(d1.toSortedJSON(), '{"k1":[1,2]}');

    const c2 = new yorkie.Client(testRPCAddr);
    await c2.activate();
    const d2 = new yorkie.Document<TestDoc>(docKey);
    await c2.attach(d2, { syncMode: SyncMode.Manual });
    assert.equal(d2.toSortedJSON(), '{"k1":[1,2]}');

    // 02. c1 removes d1 and c2 detaches d2.
    await c1.remove(d1);
    await c2.detach(d2);

    await c1.sync();
    await c2.sync();

    assert.equal(d1.getStatus(), DocumentStatus.Removed);
    assert.equal(d2.getStatus(), DocumentStatus.Removed);

    await c1.deactivate();
    await c2.deactivate();
  });

  it('removed document removal test', async function ({ task }) {
    type TestDoc = { k1: Array<number> };
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);

    // 01. c1 attaches d1 and c2 watches same doc.
    const c1 = new yorkie.Client(testRPCAddr);
    await c1.activate();
    const d1 = new yorkie.Document<TestDoc>(docKey);
    d1.update((root) => {
      root['k1'] = [1, 2];
    }, 'set array');
    await c1.attach(d1, { syncMode: SyncMode.Manual });
    assert.equal(d1.toSortedJSON(), '{"k1":[1,2]}');

    const c2 = new yorkie.Client(testRPCAddr);
    await c2.activate();
    const d2 = new yorkie.Document<TestDoc>(docKey);
    await c2.attach(d2, { syncMode: SyncMode.Manual });
    assert.equal(d2.toSortedJSON(), '{"k1":[1,2]}');

    // 02. c1 removes d1 and c2 removes d2.
    await c1.remove(d1);
    await c2.remove(d2);

    await c1.sync();
    await c2.sync();

    assert.equal(d1.getStatus(), DocumentStatus.Removed);
    assert.equal(d2.getStatus(), DocumentStatus.Removed);

    await c1.deactivate();
    await c2.deactivate();
  });

  // State transition of document
  // ┌──────────┐ Attach ┌──────────┐ Remove ┌─────────┐
  // │ Detached ├───────►│ Attached ├───────►│ Removed │
  // └──────────┘        └─┬─┬──────┘        └─────────┘
  //           ▲           │ │     ▲
  //           └───────────┘ └─────┘
  //              Detach     PushPull
  it('document state transition test', async function ({ task }) {
    type TestDoc = { k1: Array<number> };
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const c1 = new yorkie.Client(testRPCAddr);
    await c1.activate();

    // 01. abnormal behavior on detached state
    const d1 = new yorkie.Document<TestDoc>(docKey);
    assertThrowsAsync(
      async () => {
        await c1.detach(d1);
      },
      YorkieError,
      `${docKey} is not attached`,
    );
    assertThrowsAsync(
      async () => {
        await c1.sync(d1);
      },
      YorkieError,
      `${docKey} is not attached`,
    );
    assertThrowsAsync(
      async () => {
        await c1.remove(d1);
      },
      YorkieError,
      `${docKey} is not attached`,
    );

    // 02. abnormal behavior on attached state
    await c1.attach(d1);
    assertThrowsAsync(
      async () => {
        await c1.attach(d1);
      },
      YorkieError,
      `${docKey} is not detached`,
    );

    // 03. abnormal behavior on removed state
    await c1.remove(d1);
    assertThrowsAsync(
      async () => {
        await c1.remove(d1);
      },
      YorkieError,
      `${docKey} is not attached`,
    );
    assertThrowsAsync(
      async () => {
        await c1.sync(d1);
      },
      YorkieError,
      `${docKey} is not attached`,
    );
    assertThrowsAsync(
      async () => {
        await c1.detach(d1);
      },
      YorkieError,
      `${docKey} is not attached`,
    );

    await c1.deactivate();
  });

  it('Can subscribe to events related to document status changes', async function ({
    task,
  }) {
    const c1 = new yorkie.Client(testRPCAddr);
    const c2 = new yorkie.Client(testRPCAddr);
    await c1.activate();
    await c2.activate();
    const c1ID = c1.getID()!;
    let c2ID = c2.getID()!;

    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const d1 = new yorkie.Document(docKey);
    const d2 = new yorkie.Document(docKey);
    const eventCollectorD1 = new EventCollector<StatusChangedEvent['value']>();
    const eventCollectorD2 = new EventCollector<StatusChangedEvent['value']>();
    const unsub1 = d1.subscribe('status', (event) => {
      eventCollectorD1.add(event.value);
    });
    const unsub2 = d2.subscribe('status', (event) => {
      eventCollectorD2.add(event.value);
    });

    // 1. When the client attaches a document, it receives an attached event.
    await c1.attach(d1);
    await c2.attach(d2);

    await eventCollectorD1.waitAndVerifyNthEvent(1, {
      status: DocumentStatus.Attached,
      actorID: c1ID,
    });
    await eventCollectorD2.waitAndVerifyNthEvent(1, {
      status: DocumentStatus.Attached,
      actorID: c2ID,
    });

    // 2. When c1 detaches a document, it receives a detached event.
    await c1.detach(d1);
    await eventCollectorD1.waitAndVerifyNthEvent(2, {
      status: DocumentStatus.Detached,
    });

    // 3. When c2 deactivates, it should also receive a detached event.
    await c2.deactivate();
    await eventCollectorD2.waitAndVerifyNthEvent(2, {
      status: DocumentStatus.Detached,
    });

    // 4. When other document is attached, it receives an attached event.
    const docKey2 = toDocKey(`${task.name}2-${new Date().getTime()}`);
    const d3 = new yorkie.Document(docKey2);
    const d4 = new yorkie.Document(docKey2);
    const eventCollectorD3 = new EventCollector<StatusChangedEvent['value']>();
    const eventCollectorD4 = new EventCollector<StatusChangedEvent['value']>();
    const unsub3 = d3.subscribe('status', (event) => {
      eventCollectorD3.add(event.value);
    });
    const unsub4 = d4.subscribe('status', (event) => {
      eventCollectorD4.add(event.value);
    });
    await c1.attach(d3, { syncMode: SyncMode.Manual });
    await eventCollectorD3.waitAndVerifyNthEvent(1, {
      status: DocumentStatus.Attached,
      actorID: c1ID,
    });

    await c2.activate();
    c2ID = c2.getID()!;
    await c2.attach(d4, { syncMode: SyncMode.Manual });
    await eventCollectorD4.waitAndVerifyNthEvent(1, {
      status: DocumentStatus.Attached,
      actorID: c2ID,
    });

    // 5. When c1 removes a document, it receives a removed event.
    await c1.remove(d3);
    await eventCollectorD3.waitAndVerifyNthEvent(2, {
      status: DocumentStatus.Removed,
    });

    // 6. When c2 syncs, it should also receive a removed event.
    await c2.sync();
    await eventCollectorD4.waitAndVerifyNthEvent(2, {
      status: DocumentStatus.Removed,
    });

    // 7. If the document is in the removed state, a detached event should not occur when deactivating.
    const eventCount3 = eventCollectorD3.getLength();
    const eventCount4 = eventCollectorD4.getLength();
    await c1.deactivate();
    await c2.deactivate();
    assert.equal(eventCollectorD3.getLength(), eventCount3);
    assert.equal(eventCollectorD4.getLength(), eventCount4);

    unsub1();
    unsub2();
    unsub3();
    unsub4();
  });

  it('Should properly handle removed document when deactivating', async function ({
    task,
  }) {
    const c1 = new yorkie.Client(testRPCAddr);
    const c2 = new yorkie.Client(testRPCAddr);
    await c1.activate();
    await c2.activate();
    const c1ID = c1.getID()!;
    const c2ID = c2.getID()!;

    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const d1 = new yorkie.Document(docKey);
    const d2 = new yorkie.Document(docKey);
    const eventCollectorD1 = new EventCollector<StatusChangedEvent['value']>();
    const eventCollectorD2 = new EventCollector<StatusChangedEvent['value']>();
    const unsub1 = d1.subscribe('status', (event) => {
      eventCollectorD1.add(event.value);
    });
    const unsub2 = d2.subscribe('status', (event) => {
      eventCollectorD2.add(event.value);
    });

    // 1. When the client attaches a document, it receives an attached event.
    await c1.attach(d1, {
      syncMode: SyncMode.Manual,
    });
    await c2.attach(d2, {
      syncMode: SyncMode.Manual,
    });

    await eventCollectorD1.waitAndVerifyNthEvent(1, {
      status: DocumentStatus.Attached,
      actorID: c1ID,
    });
    await eventCollectorD2.waitAndVerifyNthEvent(1, {
      status: DocumentStatus.Attached,
      actorID: c2ID,
    });

    // 2. When c1 removes a document, it receives a removed event.
    await c1.remove(d1);
    await eventCollectorD1.waitAndVerifyNthEvent(2, {
      status: DocumentStatus.Removed,
    });

    // 3. When c2 deactivates, it should also receive a removed event.
    await c2.deactivate();
    // NOTE(chacha912): For now, document status changes to `Detached` when deactivating.
    // This behavior may change in the future.
    await eventCollectorD2.waitAndVerifyNthEvent(2, {
      status: DocumentStatus.Detached,
    });

    await c1.deactivate();
    unsub1();
    unsub2();
  });

  describe('Undo/Redo', function () {
    it('Can canUndo/canRedo work properly', async function ({ task }) {
      type TestDoc = { counter: Counter };
      const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
      const doc = new yorkie.Document<TestDoc>(docKey);
      doc.update((root) => {
        root.counter = new Counter(yorkie.IntType, 100);
      }, 'init counter');
      assert.equal(doc.toSortedJSON(), '{"counter":100}');

      assert.equal(doc.history.canUndo(), true);
      assert.equal(doc.history.canRedo(), false);

      // user increases the counter
      doc.update((root) => {
        root.counter.increase(1);
      }, 'increase 1');
      assert.equal(doc.toSortedJSON(), '{"counter":101}');

      // user can only undo the latest operation
      assert.equal(doc.history.canUndo(), true);
      assert.equal(doc.history.canRedo(), false);

      // user undoes the latest operation
      doc.history.undo();
      assert.equal(doc.history.canUndo(), true);
      assert.equal(doc.history.canRedo(), true);

      // user redoes the latest undone operation
      doc.history.redo();
      assert.equal(doc.history.canUndo(), true);
      assert.equal(doc.history.canRedo(), false);
      assert.equal(doc.toSortedJSON(), '{"counter":101}');
    });

    it('doc.update should clear redo stack', async function ({ task }) {
      type TestDoc = { counter: Counter };
      const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
      const doc = new yorkie.Document<TestDoc>(docKey);
      doc.update((root) => {
        root.counter = new Counter(yorkie.IntType, 100);
      }, 'init counter');
      assert.equal(doc.toSortedJSON(), '{"counter":100}');

      assert.equal(doc.history.canUndo(), true);
      assert.equal(doc.history.canRedo(), false);

      for (let i = 0; i < 5; i++) {
        doc.update((root) => {
          root.counter.increase(1);
        }, 'increase 1');
        assert.equal(doc.toSortedJSON(), `{"counter":${100 + i + 1}}`);
      }
      assert.equal(doc.history.canUndo(), true);
      assert.equal(doc.history.canRedo(), false);

      doc.history.undo();
      assert.equal(doc.history.canUndo(), true);
      assert.equal(doc.history.canRedo(), true);

      doc.update((root) => {
        root.counter.increase(1);
      }, 'increase 1');

      // doc.update() clears redo stack
      assert.equal(doc.history.canUndo(), true);
      assert.equal(doc.history.canRedo(), false);
    });

    it('undo/redo with empty stack must throw error', async function ({
      task,
    }) {
      type TestDoc = { counter: Counter };
      const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
      const doc = new yorkie.Document<TestDoc>(docKey);

      assert.throws(
        () => {
          doc.history.undo();
        },
        Error,
        'There is no operation to be undone',
      );

      assert.throws(
        () => {
          doc.history.redo();
        },
        Error,
        'There is no operation to be redone',
      );
    });

    it('update() that contains undo/redo must throw error', async function ({
      task,
    }) {
      type TestDoc = { counter: Counter };
      const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
      const doc = new yorkie.Document<TestDoc>(docKey);
      doc.update((root) => {
        root.counter = new Counter(yorkie.IntType, 100);
      }, 'init counter');
      assert.equal(doc.toSortedJSON(), '{"counter":100}');

      assert.equal(doc.history.canUndo(), true);
      assert.equal(doc.history.canRedo(), false);

      assert.throws(
        () => {
          doc.update(() => {
            doc.history.undo();
          }, 'undo');
        },
        Error,
        'Undo is not allowed during an update',
      );

      assert.throws(
        () => {
          doc.update(() => {
            doc.history.redo();
          }, 'redo');
        },
        Error,
        'Redo is not allowed during an update',
      );
    });

    it('maximum undo/redo stack test', async function ({ task }) {
      type TestDoc = { counter: Counter };
      const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
      const doc = new yorkie.Document<TestDoc>(docKey);
      doc.update((root) => {
        root.counter = new Counter(yorkie.IntType, 0);
      }, 'init counter');
      assert.equal(doc.toSortedJSON(), '{"counter":0}');

      assert.equal(doc.history.canUndo(), true);
      assert.equal(doc.history.canRedo(), false);

      for (let i = 0; i < 100; i++) {
        doc.update((root) => {
          root.counter.increase(1);
        }, 'increase loop');
      }
      assert.equal(doc.toSortedJSON(), '{"counter":100}');

      for (let i = 0; i < 100; i++) {
        if (i < 50) {
          doc.history.undo();
        } else {
          assert.throws(
            () => {
              doc.history.undo();
            },
            Error,
            'There is no operation to be undone',
          );
        }
      }
      assert.equal(doc.toSortedJSON(), '{"counter":50}');

      for (let i = 0; i < 100; i++) {
        if (i < 50) {
          doc.history.redo();
        } else {
          assert.throws(
            () => {
              doc.history.redo();
            },
            Error,
            'There is no operation to be redone',
          );
        }
      }
      assert.equal(doc.toSortedJSON(), '{"counter":100}');
    });
  });
});
