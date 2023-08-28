import { assert } from 'chai';
import { Document } from '@yorkie-js-sdk/src/document/document';
import {
  withTwoClientsAndDocuments,
  assertUndoRedo,
  toDocKey,
} from '@yorkie-js-sdk/test/integration/integration_helper';
import { Counter } from '@yorkie-js-sdk/src/yorkie';
import { CounterType } from '@yorkie-js-sdk/src/document/crdt/counter';
import Long from 'long';

describe('Counter', function () {
  it('can be increased by Counter type', function () {
    const docKey = toDocKey(`${this.test!.title}-${new Date().getTime()}`);
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

  it('Can handle increase operation', async function () {
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
    }, this.test!.title);
  });

  it('Can handle concurrent increase operation', async function () {
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
    }, this.test!.title);
  });

  it('can handle overflow', function () {
    const docKey = toDocKey(`${this.test!.title}-${new Date().getTime()}`);
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

  it('should handle undo/redo for long type and overflow', function () {
    const docKey = toDocKey(`${this.test!.title}-${new Date().getTime()}`);
    const doc = new Document<{ cnt: Counter; longCnt: Counter }>(docKey);
    const states: Array<string> = [];

    doc.update((root) => {
      root.cnt = new Counter(CounterType.IntegerCnt, 0);
      root.longCnt = new Counter(CounterType.LongCnt, Long.fromString('0'));
    });
    assert.equal(`{"cnt":0,"longCnt":0}`, doc.toSortedJSON());
    states.push(doc.toSortedJSON());

    doc.update((root) => {
      root.cnt.increase(2147483647); // 2^31-1
      root.longCnt.increase(Long.fromString('9223372036854775807')); // 2^63-1
    });
    assert.equal(
      `{"cnt":2147483647,"longCnt":9223372036854775807}`,
      doc.toSortedJSON(),
    );
    states.push(doc.toSortedJSON());

    doc.update((root) => {
      root.cnt.increase(1); // overflow
      root.longCnt.increase(Long.fromString('1')); // overflow
    });
    assert.equal(
      `{"cnt":-2147483648,"longCnt":-9223372036854775808}`,
      doc.toSortedJSON(),
    );
    states.push(doc.toSortedJSON());

    assertUndoRedo(doc, states);
  });

  it('can get proper reverse operations', function () {
    const docKey = toDocKey(`${this.test!.title}-${new Date().getTime()}`);
    const doc = new Document<{ cnt: Counter; longCnt: Counter }>(docKey);

    doc.update((root) => {
      root.cnt = new Counter(CounterType.IntegerCnt, 0);
      root.longCnt = new Counter(CounterType.LongCnt, Long.fromString('0'));
    });
    assert.equal(`{"cnt":0,"longCnt":0}`, doc.toSortedJSON());

    doc.update((root) => {
      root.cnt.increase(1.5);
      root.longCnt.increase(Long.fromString('9223372036854775807')); // 2^63-1
    });
    assert.equal(`{"cnt":1,"longCnt":9223372036854775807}`, doc.toSortedJSON());
    assert.equal(
      `[["1:00:1.INCREASE.-1.5","1:00:2.INCREASE.-9223372036854775807"]]`,
      JSON.stringify(doc.getUndoStackForTest()),
    );

    doc.history.undo();
    assert.equal(`{"cnt":0,"longCnt":0}`, doc.toSortedJSON());
    assert.equal(
      `[["1:00:1.INCREASE.1.5","1:00:2.INCREASE.9223372036854775807"]]`,
      JSON.stringify(doc.getRedoStackForTest()),
    );
  });
});
