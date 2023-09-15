import { assert } from 'chai';
import * as sinon from 'sinon';
import yorkie, { Counter, Text, JSONArray } from '@yorkie-js-sdk/src/yorkie';
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
} from '@yorkie-js-sdk/src/document/document';
import { OperationInfo } from '@yorkie-js-sdk/src/document/operation/operation';
import { YorkieError } from '@yorkie-js-sdk/src/util/error';

describe('Document', function () {
  it('Can attach/detach documents', async function () {
    type TestDoc = { k1: { ['k1-1']: string }; k2: Array<string> };
    const docKey = toDocKey(`${this.test!.title}-${new Date().getTime()}`);
    const doc1 = new yorkie.Document<TestDoc>(docKey);
    const doc2 = new yorkie.Document<TestDoc>(docKey);

    const client1 = new yorkie.Client(testRPCAddr);
    const client2 = new yorkie.Client(testRPCAddr);
    await client1.activate();
    await client2.activate();

    await client1.attach(doc1, { isRealtimeSync: false });
    doc1.update((root) => {
      root['k1'] = { 'k1-1': 'v1' };
      root['k2'] = ['1', '2'];
    }, 'set v1, v2');
    await client1.sync();
    assert.equal('{"k1":{"k1-1":"v1"},"k2":["1","2"]}', doc1.toSortedJSON());

    await client2.attach(doc2, { isRealtimeSync: false });
    assert.equal('{"k1":{"k1-1":"v1"},"k2":["1","2"]}', doc2.toSortedJSON());

    await client1.detach(doc1);
    await client2.detach(doc2);

    await client1.attach(doc1, { isRealtimeSync: false });
    await client2.attach(doc2, { isRealtimeSync: false });

    await client1.detach(doc1);
    await client2.detach(doc2);

    await client1.deactivate();
    await client2.deactivate();
  });

  it('Can watch documents', async function () {
    const c1 = new yorkie.Client(testRPCAddr);
    const c2 = new yorkie.Client(testRPCAddr);
    await c1.activate();
    await c2.activate();

    const docKey = toDocKey(`${this.test!.title}-${new Date().getTime()}`);
    const d1 = new yorkie.Document<{ k1: string }>(docKey);
    const d2 = new yorkie.Document<{ k1: string }>(docKey);
    await c1.attach(d1);
    await c2.attach(d2);

    const eventCollectorD1 = new EventCollector();
    const eventCollectorD2 = new EventCollector();
    const stub1 = sinon.stub().callsFake((event) => {
      eventCollectorD1.add(event.type);
    });
    const stub2 = sinon.stub().callsFake((event) => {
      eventCollectorD2.add(event.type);
    });
    const unsub1 = d1.subscribe(stub1);
    const unsub2 = d2.subscribe(stub2);

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

  it('detects the events from doc.subscribe', async function () {
    const c1 = new yorkie.Client(testRPCAddr);
    const c2 = new yorkie.Client(testRPCAddr);
    await c1.activate();
    await c2.activate();

    const docKey = toDocKey(`${this.test!.title}-${new Date().getTime()}`);
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
    const stub1 = sinon.stub().callsFake((event) => {
      eventCollectorD1.add({ type: event.type, value: event.value.operations });
    });
    const stub2 = sinon.stub().callsFake((event) => {
      eventCollectorD2.add({ type: event.type, value: event.value.operations });
    });
    const unsub1 = d1.subscribe(stub1);
    const unsub2 = d2.subscribe(stub2);

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
      { type: 'add', path: '$.todos', index: 0 },
      { type: 'add', path: '$.todos', index: 1 },
      { type: 'add', path: '$.todos', index: 2 },
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
      { type: 'set', path: '$.obj', key: 'name' },
      { type: 'set', path: '$.obj', key: 'age' },
      { type: 'set', path: '$.obj', key: 'food' },
      { type: 'add', path: '$.obj.food', index: 0 },
      { type: 'add', path: '$.obj.food', index: 1 },
      { type: 'set', path: '$.obj', key: 'score' },
      { type: 'set', path: '$.obj.score', key: 'english' },
      { type: 'set', path: '$.obj.score', key: 'math' },
      { type: 'set', path: '$.obj', key: 'score' },
      { type: 'set', path: '$.obj.score', key: 'science' },
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

  it('specify the topic to subscribe to', async function () {
    const c1 = new yorkie.Client(testRPCAddr);
    const c2 = new yorkie.Client(testRPCAddr);
    await c1.activate();
    await c2.activate();

    const docKey = toDocKey(`${this.test!.title}-${new Date().getTime()}`);
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
    const stub = sinon.stub().callsFake((event) => {
      eventCollector.add(event.value.operations);
    });
    const stubTodo = sinon.stub().callsFake((event) => {
      eventCollectorForTodos.add(event.value.operations);
    });
    const stubCounter = sinon.stub().callsFake((event) => {
      eventCollectorForCounter.add(event.value.operations);
    });
    const unsub = d1.subscribe(stub);
    const unsubTodo = d1.subscribe('$.todos', stubTodo);
    const unsubCounter = d1.subscribe('$.counter', stubCounter);

    d2.update((root) => {
      root.counter = new yorkie.Counter(yorkie.IntType, 0);
      root.todos = ['todo1', 'todo2'];
    });
    await eventCollector.waitAndVerifyNthEvent(1, [
      { type: 'set', path: '$', key: 'counter' },
      { type: 'set', path: '$', key: 'todos' },
      { type: 'add', path: '$.todos', index: 0 },
      { type: 'add', path: '$.todos', index: 1 },
    ]);
    await eventCollectorForTodos.waitAndVerifyNthEvent(1, [
      { type: 'add', path: '$.todos', index: 0 },
      { type: 'add', path: '$.todos', index: 1 },
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
    await eventCollectorForTodos.waitAndVerifyNthEvent(2, [
      { type: 'add', path: '$.todos', index: 2 },
    ]);

    unsubTodo();
    d2.update((root) => {
      root.todos.push('todo4');
    });
    await eventCollector.waitAndVerifyNthEvent(4, [
      { type: 'add', path: '$.todos', index: 3 },
    ]);
    assert.equal(eventCollectorForTodos.getLength(), 2); // No events after unsubscribing `$.todos`

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

  it('specify the nested topic to subscribe to', async function () {
    const c1 = new yorkie.Client(testRPCAddr);
    const c2 = new yorkie.Client(testRPCAddr);
    await c1.activate();
    await c2.activate();

    const docKey = toDocKey(`${this.test!.title}-${new Date().getTime()}`);
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
    const stub = sinon.stub().callsFake((event) => {
      eventCollector.add(event.value.operations);
    });
    const stubTodo = sinon.stub().callsFake((event) => {
      eventCollectorForTodos0.add(event.value.operations);
    });
    const stubObj = sinon.stub().callsFake((event) => {
      eventCollectorForObjC1.add(event.value.operations);
    });
    const unsub = d1.subscribe(stub);
    const unsubTodo = d1.subscribe('$.todos.0', stubTodo);
    const unsubObj = d1.subscribe('$.obj.c1', stubObj);

    d2.update((root) => {
      root.todos = [{ text: 'todo1', completed: false }];
      root.obj = {
        c1: { name: 'josh', age: 14 },
      };
    });
    await eventCollector.waitAndVerifyNthEvent(1, [
      { type: 'set', path: '$', key: 'todos' },
      { type: 'add', path: '$.todos', index: 0 },
      { type: 'set', path: '$.todos.0', key: 'text' },
      { type: 'set', path: '$.todos.0', key: 'completed' },
      { type: 'set', path: '$', key: 'obj' },
      { type: 'set', path: '$.obj', key: 'c1' },
      { type: 'set', path: '$.obj.c1', key: 'name' },
      { type: 'set', path: '$.obj.c1', key: 'age' },
    ]);
    await eventCollectorForTodos0.waitAndVerifyNthEvent(1, [
      { type: 'set', path: '$.todos.0', key: 'text' },
      { type: 'set', path: '$.todos.0', key: 'completed' },
    ]);
    await eventCollectorForObjC1.waitAndVerifyNthEvent(1, [
      { type: 'set', path: '$.obj.c1', key: 'name' },
      { type: 'set', path: '$.obj.c1', key: 'age' },
    ]);

    d2.update((root) => {
      root.obj.c1.name = 'john';
    });
    await eventCollector.waitAndVerifyNthEvent(2, [
      { type: 'set', path: '$.obj.c1', key: 'name' },
    ]);
    await eventCollectorForObjC1.waitAndVerifyNthEvent(2, [
      { type: 'set', path: '$.obj.c1', key: 'name' },
    ]);

    d2.update((root) => {
      root.todos[0].completed = true;
    });
    await eventCollector.waitAndVerifyNthEvent(3, [
      { type: 'set', path: '$.todos.0', key: 'completed' },
    ]);
    await eventCollectorForTodos0.waitAndVerifyNthEvent(2, [
      { type: 'set', path: '$.todos.0', key: 'completed' },
    ]);

    unsubTodo();
    d2.update((root) => {
      root.todos[0].text = 'todo_1';
    });
    await eventCollector.waitAndVerifyNthEvent(4, [
      { type: 'set', path: '$.todos.0', key: 'text' },
    ]);
    assert.equal(eventCollectorForTodos0.getLength(), 2); // No events after unsubscribing `$.todos.0`

    unsubObj();
    d2.update((root) => {
      root.obj.c1.age = 15;
    });
    await eventCollector.waitAndVerifyNthEvent(5, [
      { type: 'set', path: '$.obj.c1', key: 'age' },
    ]);
    assert.equal(eventCollectorForObjC1.getLength(), 2); // No events after unsubscribing `$.obj.c1`

    unsub();
    await c1.detach(d1);
    await c2.detach(d2);
    await c1.deactivate();
    await c2.deactivate();
  });

  it('Can handle tombstone', async function () {
    type TestDoc = { k1: Array<number> };
    const docKey = toDocKey(`${this.test!.title}-${new Date().getTime()}`);
    const d1 = new yorkie.Document<TestDoc>(docKey);
    const d2 = new yorkie.Document<TestDoc>(docKey);

    const c1 = new yorkie.Client(testRPCAddr);
    const c2 = new yorkie.Client(testRPCAddr);
    await c1.activate();
    await c2.activate();

    await c1.attach(d1);
    await c2.attach(d2);

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

  it('Can remove document', async function () {
    type TestDoc = { k1: Array<number> };
    const docKey = toDocKey(`${this.test!.title}-${new Date().getTime()}`);
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

  it('Can create document with the same key as the removed document key', async function () {
    type TestDoc = { k1: Array<number> };
    const docKey = toDocKey(`${this.test!.title}-${new Date().getTime()}`);

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

  it('Can know that document has been removed when doing client.sync()', async function () {
    type TestDoc = { k1: Array<number> };
    const docKey = toDocKey(`${this.test!.title}-${new Date().getTime()}`);

    // 01. c1 attaches d1 and c2 watches same doc.
    const c1 = new yorkie.Client(testRPCAddr);
    await c1.activate();
    const d1 = new yorkie.Document<TestDoc>(docKey);
    d1.update((root) => {
      root['k1'] = [1, 2];
    }, 'set array');
    await c1.attach(d1, { isRealtimeSync: false });
    assert.equal(d1.toSortedJSON(), '{"k1":[1,2]}');

    const c2 = new yorkie.Client(testRPCAddr);
    await c2.activate();
    const d2 = new yorkie.Document<TestDoc>(docKey);
    await c2.attach(d2, { isRealtimeSync: false });
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

  it('Can know that document has been removed when doing client.detach()', async function () {
    type TestDoc = { k1: Array<number> };
    const docKey = toDocKey(`${this.test!.title}-${new Date().getTime()}`);

    // 01. c1 attaches d1 and c2 watches same doc.
    const c1 = new yorkie.Client(testRPCAddr);
    await c1.activate();
    const d1 = new yorkie.Document<TestDoc>(docKey);
    d1.update((root) => {
      root['k1'] = [1, 2];
    }, 'set array');
    await c1.attach(d1);
    assert.equal(d1.toSortedJSON(), '{"k1":[1,2]}');

    const c2 = new yorkie.Client(testRPCAddr);
    await c2.activate();
    const d2 = new yorkie.Document<TestDoc>(docKey);
    await c2.attach(d2);
    assert.equal(d2.toSortedJSON(), '{"k1":[1,2]}');

    // 02. c1 removes d1 and c2 detaches d2.
    await c1.remove(d1);
    await c2.detach(d2);

    assert.equal(d1.getStatus(), DocumentStatus.Removed);
    assert.equal(d2.getStatus(), DocumentStatus.Removed);

    await c1.deactivate();
    await c2.deactivate();
  });

  it('removed document removal test', async function () {
    type TestDoc = { k1: Array<number> };
    const docKey = toDocKey(`${this.test!.title}-${new Date().getTime()}`);

    // 01. c1 attaches d1 and c2 watches same doc.
    const c1 = new yorkie.Client(testRPCAddr);
    await c1.activate();
    const d1 = new yorkie.Document<TestDoc>(docKey);
    d1.update((root) => {
      root['k1'] = [1, 2];
    }, 'set array');
    await c1.attach(d1);
    assert.equal(d1.toSortedJSON(), '{"k1":[1,2]}');

    const c2 = new yorkie.Client(testRPCAddr);
    await c2.activate();
    const d2 = new yorkie.Document<TestDoc>(docKey);
    await c2.attach(d2);
    assert.equal(d2.toSortedJSON(), '{"k1":[1,2]}');

    // 02. c1 removes d1 and c2 removes d2.
    await c1.remove(d1);
    await c2.remove(d2);
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
  it('document state transition test', async function () {
    type TestDoc = { k1: Array<number> };
    const docKey = toDocKey(`${this.test!.title}-${new Date().getTime()}`);
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
});
