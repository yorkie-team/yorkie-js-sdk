import { describe, it, assert } from 'vitest';
import { Document } from '@yorkie-js-sdk/src/document/document';
import { toStringHistoryOp } from '@yorkie-js-sdk/test/helper/helper';
import {
  withTwoClientsAndDocuments,
  assertUndoRedo,
  toDocKey,
  testRPCAddr,
} from '@yorkie-js-sdk/test/integration/integration_helper';
import yorkie, { Counter, SyncMode } from '@yorkie-js-sdk/src/yorkie';
import { CounterType } from '@yorkie-js-sdk/src/document/crdt/counter';
import Long from 'long';

describe('Counter', function () {
  it('can be increased by Counter type', function ({ task }) {
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const doc = new Document<{
      k1: { age?: Counter; length?: Counter };
    }>(docKey);
    const states: Array<string> = [];

    doc.update((root) => {
      root.k1 = {};
      root.k1.age = new Counter(CounterType.IntegerCnt, 1);
      root.k1.length = new Counter(CounterType.IntegerCnt, 10.5);
      root.k1.age.increase(5);
      root.k1.length.increase(3.5);
    });
    assert.equal(`{"k1":{"age":6,"length":13}}`, doc.toSortedJSON());
    states.push(doc.toSortedJSON());
    assert.equal(6, doc.getRoot().k1.age?.getValue());
    assert.equal(13, doc.getRoot().k1.length?.getValue());

    doc.update((root) => {
      root.k1.age?.increase(1.5).increase(1);
      root.k1.length?.increase(3.5).increase(1);
    });
    assert.equal(`{"k1":{"age":8,"length":17}}`, doc.toSortedJSON());
    states.push(doc.toSortedJSON());
    assert.equal(8, doc.getRoot().k1.age?.getValue());
    assert.equal(17, doc.getRoot().k1.length?.getValue());

    // error test
    assert.Throw(() => {
      doc.update((root) => {
        root.k1.age?.increase(true as any);
      });
    }, 'Unsupported type of value: boolean');
    assert.equal(`{"k1":{"age":8,"length":17}}`, doc.toSortedJSON());
    assert.equal(8, doc.getRoot().k1.age?.getValue());
    assert.equal(17, doc.getRoot().k1.length?.getValue());

    assertUndoRedo(doc, states);
  });

  it('Can handle increase operation', async function ({ task }) {
    type TestDoc = { age: Counter; length: Counter };
    await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.age = new Counter(CounterType.IntegerCnt, 0);
      });
      d1.update((root) => {
        root.age.increase(1).increase(2);
        root.length = new Counter(CounterType.IntegerCnt, 10);
      });

      await c1.sync();
      await c2.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, task.name);
  });

  it('Can handle concurrent increase operation', async function ({ task }) {
    await withTwoClientsAndDocuments<{
      age: Counter;
      width: Counter;
      height: Counter;
    }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.age = new Counter(CounterType.IntegerCnt, 0);
        root.width = new Counter(CounterType.IntegerCnt, 0);
        root.height = new Counter(CounterType.IntegerCnt, 0);
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      d1.update((root) => {
        root.age.increase(1).increase(2);
        root.width.increase(10);
      });
      d2.update((root) => {
        root.age.increase(3.14).increase(2);
        root.width = new Counter(CounterType.IntegerCnt, 2.5);
      });
      await c1.sync();
      await c2.sync();
      await c1.sync();

      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, task.name);
  });

  it('can handle overflow', function ({ task }) {
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const doc = new Document<{ age: Counter }>(docKey);
    doc.update((root) => {
      root.age = new Counter(CounterType.IntegerCnt, 2147483647);
      root.age.increase(1);
    });
    assert.equal(`{"age":-2147483648}`, doc.toSortedJSON());

    doc.update((root) => {
      root.age = new Counter(CounterType.IntegerCnt, 2147483648);
    });
    assert.equal(`{"age":-2147483648}`, doc.toSortedJSON());

    doc.update((root) => {
      root.age = new Counter(
        CounterType.LongCnt,
        Long.fromString('9223372036854775807'),
      );
      root.age.increase(1);
    });
    assert.equal(`{"age":-9223372036854775808}`, doc.toSortedJSON());

    doc.update((root) => {
      root.age = new Counter(
        CounterType.LongCnt,
        Long.fromString('9223372036854775808'),
      );
    });
    assert.equal(`{"age":-9223372036854775808}`, doc.toSortedJSON());
  });

  it('can get proper reverse operations', function ({ task }) {
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const doc = new Document<{ cnt: Counter; longCnt: Counter }>(docKey);

    doc.update((root) => {
      root.cnt = new Counter(CounterType.IntegerCnt, 0);
      root.longCnt = new Counter(CounterType.LongCnt, Long.fromString('0'));
    });
    assert.equal(doc.toSortedJSON(), `{"cnt":0,"longCnt":0}`);

    doc.update((root) => {
      root.cnt.increase(1.5);
      root.longCnt.increase(Long.fromString('9223372036854775807')); // 2^63-1
    });
    assert.equal(doc.toSortedJSON(), `{"cnt":1,"longCnt":9223372036854775807}`);

    assert.deepEqual(doc.getUndoStackForTest().at(-1)?.map(toStringHistoryOp), [
      '1:00:2.INCREASE.-9223372036854775807',
      '1:00:1.INCREASE.-1.5',
    ]);

    doc.history.undo();
    assert.equal(doc.toSortedJSON(), `{"cnt":0,"longCnt":0}`);
    assert.deepEqual(doc.getRedoStackForTest().at(-1)?.map(toStringHistoryOp), [
      '1:00:1.INCREASE.1.5',
      '1:00:2.INCREASE.9223372036854775807',
    ]);
  });

  it('Can undo/redo for increase operation', async function ({ task }) {
    type TestDoc = { counter: Counter };
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const doc = new Document<TestDoc>(docKey);
    doc.update((root) => {
      root.counter = new Counter(CounterType.IntegerCnt, 100);
    }, 'init counter');
    assert.equal(doc.toSortedJSON(), '{"counter":100}');

    doc.update((root) => {
      root.counter.increase(1);
    }, 'increase 1');
    assert.equal(doc.toSortedJSON(), '{"counter":101}');

    doc.history.undo();
    assert.equal(doc.toSortedJSON(), '{"counter":100}');

    doc.history.redo();
    assert.equal(doc.toSortedJSON(), '{"counter":101}');

    doc.history.undo();
    assert.equal(doc.toSortedJSON(), '{"counter":100}');
  });

  it('should handle undo/redo for long type and overflow', function ({ task }) {
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const doc = new Document<{ cnt: Counter; longCnt: Counter }>(docKey);
    const states: Array<string> = [];

    doc.update((root) => {
      root.cnt = new Counter(CounterType.IntegerCnt, 0);
      root.longCnt = new Counter(CounterType.LongCnt, Long.fromString('0'));
    });
    assert.equal(doc.toSortedJSON(), `{"cnt":0,"longCnt":0}`);
    states.push(doc.toSortedJSON());

    doc.update((root) => {
      root.cnt.increase(2147483647); // 2^31-1
      root.longCnt.increase(Long.fromString('9223372036854775807')); // 2^63-1
    });
    assert.equal(
      doc.toSortedJSON(),
      `{"cnt":2147483647,"longCnt":9223372036854775807}`,
    );
    states.push(doc.toSortedJSON());

    doc.update((root) => {
      root.cnt.increase(1); // overflow
      root.longCnt.increase(Long.fromString('1')); // overflow
    });
    assert.equal(
      doc.toSortedJSON(),
      `{"cnt":-2147483648,"longCnt":-9223372036854775808}`,
    );
    states.push(doc.toSortedJSON());

    assertUndoRedo(doc, states);
  });

  it('Can undo/redo for concurrent users', async function ({ task }) {
    type TestDoc = { counter: Counter };
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const doc1 = new yorkie.Document<TestDoc>(docKey);
    const doc2 = new yorkie.Document<TestDoc>(docKey);

    const client1 = new yorkie.Client(testRPCAddr);
    const client2 = new yorkie.Client(testRPCAddr);
    await client1.activate();
    await client2.activate();

    await client1.attach(doc1, { syncMode: SyncMode.Manual });
    doc1.update((root) => {
      root.counter = new Counter(yorkie.IntType, 100);
    }, 'init counter');
    await client1.sync();
    assert.equal(doc1.toSortedJSON(), '{"counter":100}');

    await client2.attach(doc2, { syncMode: SyncMode.Manual });
    assert.equal(doc2.toSortedJSON(), '{"counter":100}');

    // client1 increases 1 and client2 increases 2
    doc1.update((root) => {
      root.counter.increase(1);
    }, 'increase 1');
    doc2.update((root) => {
      root.counter.increase(2);
    }, 'increase 2');
    await client1.sync();
    await client2.sync();
    await client1.sync();
    assert.equal(doc1.toSortedJSON(), '{"counter":103}');
    assert.equal(doc2.toSortedJSON(), '{"counter":103}');

    // client1 undoes one's latest increase operation
    doc1.history.undo();
    await client1.sync();
    await client2.sync();
    assert.equal(doc1.toSortedJSON(), '{"counter":102}');
    assert.equal(doc2.toSortedJSON(), '{"counter":102}');

    // only client1 can redo undone operation
    assert.equal(doc1.history.canRedo(), true);
    assert.equal(doc2.history.canRedo(), false);

    // client1 redoes one's latest undone operation
    doc1.history.redo();
    await client1.sync();
    await client2.sync();
    assert.equal(doc1.toSortedJSON(), '{"counter":103}');
    assert.equal(doc2.toSortedJSON(), '{"counter":103}');

    await client1.deactivate();
    await client2.deactivate();
  });
});
