import { assert } from 'chai';
import * as sinon from 'sinon';
import yorkie, { Counter, Text, JSONArray } from '@yorkie-js-sdk/src/yorkie';
import {
  testRPCAddr,
  toDocKey,
} from '@yorkie-js-sdk/test/integration/integration_helper';
import {
  waitStubCallCount,
  assertThrowsAsync,
  deepSort,
} from '@yorkie-js-sdk/test/helper/helper';
import type { CRDTElement } from '@yorkie-js-sdk/src/document/crdt/element';
import {
  DocumentStatus,
  DocEvent,
  DocEventType,
} from '@yorkie-js-sdk/src/document/document';
import { OperationInfo } from '@yorkie-js-sdk/src/document/operation/operation';
import { YorkieError } from '@yorkie-js-sdk/src/util/error';

describe('Document', function () {
  it('Can attach/detach documents', async function () {
    type TestDoc = { k1: { ['k1-1']: string }; k2: Array<string> };
    const docKey = toDocKey(`${this.test!.title}-${new Date().getTime()}`);

    const client1 = new yorkie.Client(testRPCAddr);
    const client2 = new yorkie.Client(testRPCAddr);
    await client1.activate();
    await client2.activate();

    const doc1 = await client1.attach<TestDoc>(docKey, {
      isRealtimeSync: false,
    });
    doc1.update((root) => {
      root['k1'] = { 'k1-1': 'v1' };
      root['k2'] = ['1', '2'];
    }, 'set v1, v2');
    await client1.sync();
    assert.equal('{"k1":{"k1-1":"v1"},"k2":["1","2"]}', doc1.toSortedJSON());

    const doc2 = await client2.attach<TestDoc>(docKey, {
      isRealtimeSync: false,
    });
    assert.equal('{"k1":{"k1-1":"v1"},"k2":["1","2"]}', doc2.toSortedJSON());

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
    const d1 = await c1.attach<{ k1: string }>(docKey);
    const d2 = await c2.attach<{ k1: string }>(docKey);
    const d1Events: Array<string> = [];
    const d2Events: Array<string> = [];
    const stub1 = sinon.stub().callsFake((event) => {
      d1Events.push(event.type);
    });
    const stub2 = sinon.stub().callsFake((event) => {
      d2Events.push(event.type);
    });
    const unsub1 = d1.subscribe(stub1);
    const unsub2 = d2.subscribe(stub2);

    d2.update((root) => {
      root['k1'] = 'v1';
    });

    await waitStubCallCount(stub2, 1);
    assert.equal(d2Events.pop(), DocEventType.LocalChange);
    await waitStubCallCount(stub1, 2);
    assert.equal(d1Events.pop(), DocEventType.RemoteChange);
    assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

    unsub1();
    unsub2();

    await c1.detach(d1);
    await c2.detach(d2);
    await c1.deactivate();
    await c2.deactivate();
  });

  it('Eventually sync presences with its peers', async function () {
    const c1 = new yorkie.Client(testRPCAddr);
    const c2 = new yorkie.Client(testRPCAddr);
    await c1.activate();
    await c2.activate();

    const docKey = toDocKey(`${this.test!.title}-${new Date().getTime()}`);
    type PresenceType = {
      name: string;
      cursor: { x: number; y: number };
    };
    const doc1 = await c1.attach<{}, PresenceType>(docKey, {
      initialPresence: {
        name: 'a',
        cursor: { x: 0, y: 0 },
      },
    });
    const doc2 = await c2.attach<{}, PresenceType>(docKey, {
      initialPresence: {
        name: 'b',
        cursor: { x: 1, y: 1 },
      },
    });
    const stub1 = sinon.stub();
    const stub2 = sinon.stub();
    const unsub1 = doc1.subscribe(stub1);
    const unsub2 = doc2.subscribe(stub2);
    // TODO(chacha912): receive the "watched" event in remote-change
    await waitStubCallCount(stub1, 1); // watched
    doc1.update(() => {
      doc1.updatePresence('name', 'A');
    });
    doc2.update(() => {
      doc2.updatePresence('name', 'B');
    });
    doc2.update(() => {
      doc2.updatePresence('name', 'Z');
    });
    doc1.update(() => {
      doc1.updatePresence('cursor', { x: 2, y: 2 });
    });
    doc1.update(() => {
      doc1.updatePresence('name', 'Y');
    });

    await waitStubCallCount(stub1, 5);
    await waitStubCallCount(stub2, 3);
    assert.deepEqual(deepSort(doc1.getPeers()), deepSort(doc2.getPeers()));

    await c1.detach(doc1);
    await c2.detach(doc2);
    await c1.deactivate();
    await c2.deactivate();

    unsub1();
    unsub2();
  });

  it(`Can get peer's presence`, async function () {
    const c1 = new yorkie.Client(testRPCAddr);
    const c2 = new yorkie.Client(testRPCAddr);
    await c1.activate();
    await c2.activate();

    const docKey = toDocKey(`${this.test!.title}-${new Date().getTime()}`);
    type PresenceType = {
      name: string;
      cursor: { x: number; y: number };
    };
    const d1 = await c1.attach<{ version: string }, PresenceType>(docKey, {
      initialPresence: {
        name: 'a',
        cursor: { x: 0, y: 0 },
      },
    });
    const stub1 = sinon.stub();
    const unsub1 = d1.subscribe(stub1);
    assert.deepEqual(d1.getPeerPresence(c2.getID()!), undefined);

    const d2 = await c2.attach<{ version: string }, PresenceType>(docKey, {
      initialPresence: {
        name: 'b',
        cursor: { x: 1, y: 1 },
      },
    });
    await waitStubCallCount(stub1, 1); // watched
    assert.deepEqual(d1.getPeerPresence(c2.getID()!), {
      name: 'b',
      cursor: { x: 1, y: 1 },
    });

    unsub1();
    await c1.deactivate();
    await c2.deactivate();
  });

  it('detects the peers-changed events from doc.subscribe', async function () {
    const c1 = new yorkie.Client(testRPCAddr);
    const c2 = new yorkie.Client(testRPCAddr);
    await c1.activate();
    await c2.activate();
    const c1ID = c1.getID()!;
    const c2ID = c2.getID()!;

    type PresenceType = {
      name: string;
      cursor: { x: number; y: number };
    };
    const c1Presence = {
      name: 'a',
      cursor: { x: 0, y: 0 },
    };
    const c2Presence = {
      name: 'b',
      cursor: { x: 1, y: 1 },
    };
    const docKey1 = 'event-flow1';
    const docKey2 = 'event-flow2';

    const d1Events: Array<string> = [];
    const d1ExpectedEvents: Array<string> = [];
    const d2Events: Array<string> = [];
    const d2ExpectedEvents: Array<string> = [];
    function pushEvent(array: Array<string>, event: DocEvent<PresenceType>) {
      const sortedEvent = deepSort(event);
      array.push(JSON.stringify(sortedEvent));
    }
    const stub1 = sinon.stub().callsFake((event) => {
      pushEvent(d1Events, event);
    });
    const stub2 = sinon.stub().callsFake((event) => {
      pushEvent(d2Events, event);
    });

    // 01. c1 attaches doc with docKey1
    const doc1C1 = await c1.attach<{}, PresenceType>(docKey1, {
      initialPresence: c1Presence,
    });
    const unsub1 = doc1C1.subscribe(stub1);

    // 02. c2 attaches doc with docKey1
    const doc1C2 = await c2.attach<{}, PresenceType>(docKey1, {
      initialPresence: c2Presence,
    });
    const unsub2 = doc1C2.subscribe(stub2);

    // 02-1. c1 receives the watched event
    pushEvent(d1ExpectedEvents, {
      type: DocEventType.PeersChanged,
      value: {
        type: 'watched',
        peers: [{ clientID: c2ID, presence: { ...c2Presence } }],
      },
    });
    await waitStubCallCount(stub1, 1);
    assert.deepEqual(
      d1Events,
      d1ExpectedEvents,
      `[c1] c2 attach doc1: \n actual: ${JSON.stringify(
        d1Events,
      )} \n expected: ${JSON.stringify(d1ExpectedEvents)}`,
    );

    // 03. c1 updates presence
    doc1C1.update(() => {
      doc1C1.updatePresence('name', 'z');
    });

    // 03-1. c1 receives the local change event
    pushEvent(d1ExpectedEvents, {
      type: DocEventType.LocalChange,
      value: [
        {
          message: '',
          operations: [],
          presence: { ...c1Presence, name: 'z' },
          actor: c1ID,
        },
      ],
    });
    assert.equal(2, stub1.callCount);
    assert.deepEqual(
      d1Events,
      d1ExpectedEvents,
      `[c1] c1 updatePresence: \n actual: ${JSON.stringify(
        d1Events,
      )} \n expected: ${JSON.stringify(d1ExpectedEvents)}`,
    );

    // 03-2. c2 receives the remote change event
    pushEvent(d2ExpectedEvents, {
      type: DocEventType.RemoteChange,
      value: [
        {
          message: '',
          operations: [],
          presence: { ...c1Presence, name: 'z' },
          actor: c1ID,
        },
      ],
    });
    await waitStubCallCount(stub2, 1);
    assert.deepEqual(
      d2Events,
      d2ExpectedEvents,
      `[c2] c1 updatePresence: \n actual: ${JSON.stringify(
        d2Events,
      )} \n expected: ${JSON.stringify(d2ExpectedEvents)}`,
    );

    // 04. c1 attaches doc with docKey2
    const doc2C1 = await c1.attach<{}, PresenceType>(docKey2, {
      initialPresence: c1Presence,
    });
    assert.deepEqual(deepSort(doc2C1.getPeers()), [
      {
        clientID: c1ID,
        presence: {
          name: 'a',
          cursor: { x: 0, y: 0 },
        },
      },
    ]);

    // 05. c1 detaches doc with docKey1
    await c1.detach(doc1C1);

    // 05-1. c2 receives the unwatched event
    pushEvent(d2ExpectedEvents, {
      type: DocEventType.PeersChanged,
      value: {
        type: 'unwatched',
        peers: [{ clientID: c1ID, presence: { ...c1Presence, name: 'z' } }],
      },
    });
    await waitStubCallCount(stub2, 2);
    assert.deepEqual(
      d2Events,
      d2ExpectedEvents,
      `[c2] c1 detach doc1: \n actual: ${JSON.stringify(
        d2Events,
      )} \n expected: ${JSON.stringify(d2ExpectedEvents)}`,
    );

    await c1.deactivate();
    await c2.deactivate();

    unsub1();
    unsub2();
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
    const d1 = await c1.attach<TestDoc>(docKey);
    const d2 = await c2.attach<TestDoc>(docKey);
    const events1: Array<OperationInfo> = [];
    let expectedEvents1: Array<OperationInfo> = [];
    const events2: Array<OperationInfo> = [];
    let expectedEvents2: Array<OperationInfo> = [];
    const pushEvent = (event: DocEvent, events: Array<OperationInfo>) => {
      if (event.type !== DocEventType.RemoteChange) return;
      for (const { operations } of event.value) {
        events.push(...operations);
      }
    };
    const stub1 = sinon.stub().callsFake((event) => pushEvent(event, events1));
    const stub2 = sinon.stub().callsFake((event) => pushEvent(event, events2));
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
      expectedEvents2 = [
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
        {
          type: 'select',
          from: 11,
          to: 11,
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
    });

    await waitStubCallCount(stub1, 2);
    await waitStubCallCount(stub2, 1);

    d2.update((root) => {
      root.counter.increase(1);
      root.todos.push('todo4');
      const prevItem = root.todos.getElementByIndex!(1);
      const currItem = root.todos.getElementByIndex!(0);
      root.todos.moveAfter!(prevItem.getID!(), currItem.getID!());
      root.content.select(0, 5);
      root.content.setStyle(0, 5, { bold: true });
      expectedEvents1 = [
        { type: 'increase', path: '$.counter', value: 1 },
        { type: 'add', path: '$.todos', index: 3 },
        {
          type: 'move',
          path: '$.todos',
          index: 1,
          previousIndex: 0,
        },
        {
          type: 'select',
          from: 0,
          to: 5,
          path: '$.content',
        },
        {
          type: 'style',
          from: 0,
          to: 5,
          value: { attributes: { bold: true } },
          path: '$.content',
        },
      ];
    });
    await waitStubCallCount(stub1, 3);
    await waitStubCallCount(stub2, 2);
    assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    assert.deepEqual(
      events1,
      expectedEvents1,
      `d1 event actual: ${JSON.stringify(
        events1,
      )} \n expected: ${JSON.stringify(expectedEvents1)}`,
    );
    assert.deepEqual(
      events2,
      expectedEvents2,
      `d2 event actual: ${JSON.stringify(
        events2,
      )} \n expected: ${JSON.stringify(expectedEvents2)}`,
    );
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
    const d1 = await c1.attach<TestDoc>(docKey);
    const d2 = await c2.attach<TestDoc>(docKey);
    let events: Array<OperationInfo> = [];
    let todoEvents: Array<OperationInfo> = [];
    let counterEvents: Array<OperationInfo> = [];
    const pushEvent = (event: DocEvent, events: Array<OperationInfo>) => {
      if (event.type !== DocEventType.RemoteChange) return;
      for (const { operations } of event.value) {
        events.push(...operations);
      }
    };
    const stub = sinon.stub().callsFake((event) => pushEvent(event, events));
    const stubTodo = sinon
      .stub()
      .callsFake((event) => pushEvent(event, todoEvents));
    const stubCounter = sinon
      .stub()
      .callsFake((event) => pushEvent(event, counterEvents));
    const unsub = d1.subscribe(stub);
    const unsubTodo = d1.subscribe('$.todos', stubTodo);
    const unsubCounter = d1.subscribe('$.counter', stubCounter);

    d2.update((root) => {
      root.counter = new yorkie.Counter(yorkie.IntType, 0);
      root.todos = ['todo1', 'todo2'];
    });
    await waitStubCallCount(stub, 2);
    await waitStubCallCount(stubTodo, 1);
    assert.deepEqual(events, [
      { type: 'set', path: '$', key: 'counter' },
      { type: 'set', path: '$', key: 'todos' },
      { type: 'add', path: '$.todos', index: 0 },
      { type: 'add', path: '$.todos', index: 1 },
    ]);
    assert.deepEqual(todoEvents, [
      { type: 'add', path: '$.todos', index: 0 },
      { type: 'add', path: '$.todos', index: 1 },
    ]);
    events = [];
    todoEvents = [];

    d2.update((root) => {
      root.counter.increase(10);
    });
    await waitStubCallCount(stub, 3);
    await waitStubCallCount(stubCounter, 1);
    assert.deepEqual(events, [
      { type: 'increase', path: '$.counter', value: 10 },
    ]);
    assert.deepEqual(counterEvents, [
      { type: 'increase', path: '$.counter', value: 10 },
    ]);
    events = [];
    counterEvents = [];

    d2.update((root) => {
      root.todos.push('todo3');
    });
    await waitStubCallCount(stub, 4);
    await waitStubCallCount(stubTodo, 2);
    assert.deepEqual(events, [{ type: 'add', path: '$.todos', index: 2 }]);
    assert.deepEqual(todoEvents, [{ type: 'add', path: '$.todos', index: 2 }]);
    events = [];
    todoEvents = [];

    unsubTodo();
    d2.update((root) => {
      root.todos.push('todo4');
    });
    await waitStubCallCount(stub, 5);
    assert.deepEqual(events, [{ type: 'add', path: '$.todos', index: 3 }]);
    assert.deepEqual(todoEvents, []);
    events = [];

    unsubCounter();
    d2.update((root) => {
      root.counter.increase(10);
    });
    await waitStubCallCount(stub, 6);
    assert.deepEqual(events, [
      { type: 'increase', path: '$.counter', value: 10 },
    ]);
    assert.deepEqual(counterEvents, []);

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
    const d1 = await c1.attach<TestDoc>(docKey);
    const d2 = await c2.attach<TestDoc>(docKey);
    let events: Array<OperationInfo> = [];
    let todoEvents: Array<OperationInfo> = [];
    let objEvents: Array<OperationInfo> = [];
    const pushEvent = (event: DocEvent, events: Array<OperationInfo>) => {
      if (event.type !== DocEventType.RemoteChange) return;
      for (const { operations } of event.value) {
        events.push(...operations);
      }
    };
    const stub = sinon.stub().callsFake((event) => pushEvent(event, events));
    const stubTodo = sinon
      .stub()
      .callsFake((event) => pushEvent(event, todoEvents));
    const stubObj = sinon
      .stub()
      .callsFake((event) => pushEvent(event, objEvents));
    const unsub = d1.subscribe(stub);
    const unsubTodo = d1.subscribe('$.todos.0', stubTodo);
    const unsubObj = d1.subscribe('$.obj.c1', stubObj);

    d2.update((root) => {
      root.todos = [{ text: 'todo1', completed: false }];
      root.obj = {
        c1: { name: 'josh', age: 14 },
      };
    });
    await waitStubCallCount(stub, 2);
    await waitStubCallCount(stubTodo, 1);
    await waitStubCallCount(stubObj, 1);
    assert.deepEqual(events, [
      { type: 'set', path: '$', key: 'todos' },
      { type: 'add', path: '$.todos', index: 0 },
      { type: 'set', path: '$.todos.0', key: 'text' },
      { type: 'set', path: '$.todos.0', key: 'completed' },
      { type: 'set', path: '$', key: 'obj' },
      { type: 'set', path: '$.obj', key: 'c1' },
      { type: 'set', path: '$.obj.c1', key: 'name' },
      { type: 'set', path: '$.obj.c1', key: 'age' },
    ]);
    assert.deepEqual(todoEvents, [
      { type: 'set', path: '$.todos.0', key: 'text' },
      { type: 'set', path: '$.todos.0', key: 'completed' },
    ]);
    assert.deepEqual(objEvents, [
      { type: 'set', path: '$.obj.c1', key: 'name' },
      { type: 'set', path: '$.obj.c1', key: 'age' },
    ]);
    events = [];
    todoEvents = [];
    objEvents = [];

    d2.update((root) => {
      root.obj.c1.name = 'john';
    });
    await waitStubCallCount(stub, 3);
    await waitStubCallCount(stubObj, 1);
    assert.deepEqual(events, [{ type: 'set', path: '$.obj.c1', key: 'name' }]);
    assert.deepEqual(objEvents, [
      { type: 'set', path: '$.obj.c1', key: 'name' },
    ]);
    events = [];
    objEvents = [];

    d2.update((root) => {
      root.todos[0].completed = true;
    });
    await waitStubCallCount(stub, 4);
    await waitStubCallCount(stubTodo, 2);
    assert.deepEqual(events, [
      { type: 'set', path: '$.todos.0', key: 'completed' },
    ]);
    assert.deepEqual(todoEvents, [
      { type: 'set', path: '$.todos.0', key: 'completed' },
    ]);
    events = [];
    todoEvents = [];

    unsubTodo();
    d2.update((root) => {
      root.todos[0].text = 'todo_1';
    });
    await waitStubCallCount(stub, 5);
    assert.deepEqual(events, [{ type: 'set', path: '$.todos.0', key: 'text' }]);
    assert.deepEqual(todoEvents, []);
    events = [];

    unsubObj();
    d2.update((root) => {
      root.obj.c1.age = 15;
    });
    await waitStubCallCount(stub, 6);
    assert.deepEqual(events, [{ type: 'set', path: '$.obj.c1', key: 'age' }]);
    assert.deepEqual(objEvents, []);

    unsub();
    await c1.detach(d1);
    await c2.detach(d2);
    await c1.deactivate();
    await c2.deactivate();
  });

  it('Can handle tombstone', async function () {
    type TestDoc = { k1: Array<number> };
    const docKey = toDocKey(`${this.test!.title}-${new Date().getTime()}`);

    const c1 = new yorkie.Client(testRPCAddr);
    const c2 = new yorkie.Client(testRPCAddr);
    await c1.activate();
    await c2.activate();

    const d1 = await c1.attach<TestDoc>(docKey);
    const d2 = await c2.attach<TestDoc>(docKey);

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
    const c1 = new yorkie.Client(testRPCAddr);
    await c1.activate();
    const d1 = await c1.attach<TestDoc>(docKey);

    // 01. remove a document.
    await c1.remove(d1);

    // 02. try to update a removed document.
    assert.throws(
      () => {
        d1.update((root) => {
          root['k1'] = [1, 2];
        }, 'set array');
      },
      YorkieError,
      `${docKey} is removed`,
    );

    await c1.deactivate();
  });

  it('Can create document with the same key as the removed document key', async function () {
    type TestDoc = { k1: Array<number> };
    const docKey = toDocKey(`${this.test!.title}-${new Date().getTime()}`);

    // 01. c1 creates d1 and removes it.
    const c1 = new yorkie.Client(testRPCAddr);
    await c1.activate();
    const d1 = await c1.attach<TestDoc>(docKey);
    d1.update((root) => {
      root['k1'] = [1, 2];
    }, 'set array');
    assert.equal(d1.toSortedJSON(), '{"k1":[1,2]}');
    await c1.remove(d1);

    // 02. c2 creates d2 with the same key.
    const c2 = new yorkie.Client(testRPCAddr);
    await c2.activate();
    const d2 = await c2.attach<TestDoc>(docKey);

    // 02. c1 creates d3 with the same key.
    const d3 = await c1.attach<TestDoc>(docKey);
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
    const d1 = await c1.attach<TestDoc>(docKey);
    d1.update((root) => {
      root['k1'] = [1, 2];
    }, 'set array');
    assert.equal(d1.toSortedJSON(), '{"k1":[1,2]}');
    await c1.sync();

    const c2 = new yorkie.Client(testRPCAddr);
    await c2.activate();
    const d2 = await c2.attach<TestDoc>(docKey);
    assert.equal(d2.toSortedJSON(), '{"k1":[1,2]}');

    // 02. c1 updates d1 and removes it.
    d1.update((root) => {
      root['k1'].push(3);
    });
    await c1.remove(d1);
    assert.equal(d1.toSortedJSON(), '{"k1":[1,2,3]}');
    assert.equal(d1.getStatus(), DocumentStatus.Removed);

    // 03. c2 syncs and checks that d2 is removed.
    await c2.sync();
    assert.equal(d2.toSortedJSON(), '{"k1":[1,2,3]}');
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
    const d1 = await c1.attach<TestDoc>(docKey);
    d1.update((root) => {
      root['k1'] = [1, 2];
    }, 'set array');
    assert.equal(d1.toSortedJSON(), '{"k1":[1,2]}');
    await c1.sync();

    const c2 = new yorkie.Client(testRPCAddr);
    await c2.activate();
    const d2 = await c2.attach<TestDoc>(docKey);
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
    const d1 = await c1.attach<TestDoc>(docKey);
    d1.update((root) => {
      root['k1'] = [1, 2];
    }, 'set array');
    assert.equal(d1.toSortedJSON(), '{"k1":[1,2]}');
    await c1.sync();

    const c2 = new yorkie.Client(testRPCAddr);
    await c2.activate();
    const d2 = await c2.attach<TestDoc>(docKey);
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
    const d1 = await c1.attach<TestDoc>(docKey);

    // 01. abnormal behavior on removed state
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

    const d2 = await c1.attach<TestDoc>(docKey);
    // 02. abnormal behavior on attached state
    assertThrowsAsync(
      async () => {
        await c1.attach<TestDoc>(docKey);
      },
      YorkieError,
      `${docKey} is not detached`,
    );

    // 03. abnormal behavior on detached state
    await c1.detach(d2);
    assertThrowsAsync(
      async () => {
        await c1.detach(d2);
      },
      YorkieError,
      `${docKey} is not attached`,
    );
    assertThrowsAsync(
      async () => {
        await c1.sync(d2);
      },
      YorkieError,
      `${docKey} is not attached`,
    );
    assertThrowsAsync(
      async () => {
        await c1.remove(d2);
      },
      YorkieError,
      `${docKey} is not attached`,
    );

    await c1.deactivate();
  });
});
