import { Document, Counter } from '@yorkie-js-sdk/src/yorkie';
import { CounterType } from '@yorkie-js-sdk/src/document/crdt/counter';
import { describe, bench, assert } from 'vitest';

const benchmarkCounter = (size: number) => {
  const doc = new Document<{ counter: Counter }>('test-doc');

  doc.update((root) => {
    root.counter = new Counter(CounterType.IntegerCnt, 0);
    for (let i = 0; i < size; i++) {
      root.counter.increase(i);
    }
  });
};

describe('Counter', () => {
  bench('counter', () => {
    const doc = new Document<{ age: Counter; price: Counter }>('test-doc');
    const integer = 10;
    const long = 5;
    const uinteger = 100;
    const float = 3.14;
    const double = 5.66;
    doc.update((root) => {
      root.age = new Counter(CounterType.IntegerCnt, 5);
      root.age.increase(long);
      root.age.increase(double);
      root.age.increase(float);
      root.age.increase(uinteger);
      root.age.increase(integer);
    });
    assert.equal('{"age":128}', doc.toJSON());
    doc.update((root) => {
      root.price = new Counter(CounterType.LongCnt, 9000000000000000000);
      root.price.increase(long);
      root.price.increase(double);
      root.price.increase(float);
      root.price.increase(uinteger);
      root.price.increase(integer);
    });
    assert.equal('{"age":128,"price":9000000000000000123}', doc.toJSON());
    doc.update((root) => {
      root.age.increase(-5);
      root.age.increase(-3.14);
      root.price.increase(-100);
      root.price.increase(-20.5);
    });
    assert.equal('{"age":120,"price":9000000000000000003}', doc.toJSON());
    // TODO: We need to filter not-allowed type
    // counter.increase() method doesn't filter not-allowed type
  });

  bench('counter 1000', () => {
    benchmarkCounter(1000);
  });

  bench('counter 10000', () => {
    benchmarkCounter(10000);
  });
});
