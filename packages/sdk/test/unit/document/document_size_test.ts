import { describe, it, assert } from 'vitest';
import Long from 'long';
import {
  Counter,
  CounterType,
  Document,
  JSONObject,
} from '@yorkie-js/sdk/src/yorkie';

describe('Document Size', () => {
  it('primitive test', function () {
    const doc = new Document<{
      k0: null;
      k1: boolean;
      k2: number;
      k3: Long;
      k4: number;
      k5: string;
      k6: Uint8Array;
      k7: Date;
      k8: undefined;
    }>('test-doc');

    // NOTE(hackerwins): O(Created) + P(CreatedAt, MovedAt)
    doc.update((root) => (root['k0'] = null));
    assert.deepEqual(doc.getDocSize().live, { data: 8, meta: 72 });

    // NOTE(hackerwins): O(Created) + P(CreatedAt, MovedAt) * 2
    doc.update((root) => (root['k1'] = true));
    assert.deepEqual(doc.getDocSize().live, { data: 12, meta: 120 });

    doc.update((root) => (root['k2'] = 2147483647));
    assert.deepEqual(doc.getDocSize().live, { data: 16, meta: 168 });

    doc.update((root) => (root['k3'] = Long.MAX_VALUE));
    assert.deepEqual(doc.getDocSize().live, { data: 24, meta: 216 });

    doc.update((root) => (root['k4'] = 1.79));
    assert.deepEqual(doc.getDocSize().live, { data: 32, meta: 264 });

    doc.update((root) => (root['k5'] = '4'));
    assert.deepEqual(doc.getDocSize().live, { data: 34, meta: 312 });

    doc.update((root) => (root['k6'] = new Uint8Array([65, 66])));
    assert.deepEqual(doc.getDocSize().live, { data: 36, meta: 360 });

    doc.update((root) => (root['k7'] = new Date()));
    assert.deepEqual(doc.getDocSize().live, { data: 44, meta: 408 });

    doc.update((root) => (root['k8'] = undefined));
    assert.deepEqual(doc.getDocSize().live, { data: 52, meta: 456 });
  });

  it('array test', function () {
    const doc = new Document<{ arr: Array<string> }>('test-doc');

    doc.update((root) => (root['arr'] = []));
    assert.deepEqual(doc.getDocSize().live, { data: 0, meta: 72 });

    doc.update((root) => root['arr'].push('a'));
    assert.deepEqual(doc.getDocSize().live, { data: 2, meta: 96 });
    assert.deepEqual(doc.getDocSize().gc, { data: 0, meta: 0 });

    doc.update((root) => delete root['arr'][0]);
    assert.deepEqual(doc.getDocSize().live, { data: 0, meta: 72 });
    assert.deepEqual(doc.getDocSize().gc, { data: 2, meta: 48 });
  });

  it('gc test', function () {
    const doc = new Document<
      JSONObject<{
        num?: number;
        str: string;
      }>
    >('test-doc');

    doc.update((root) => {
      root['num'] = 1;
      root['str'] = 'hello';
    });
    assert.deepEqual(doc.getDocSize().live, { data: 14, meta: 120 });

    doc.update((root) => {
      delete root['num'];
    });
    assert.deepEqual(doc.getDocSize().live, { data: 10, meta: 72 });
    // NOTE(hackerwins): P(CreatedAt, MovedAt, RemovedAt)
    assert.deepEqual(doc.getDocSize().gc, { data: 4, meta: 72 });
  });

  it('counter test', function () {
    const doc = new Document<{ counter: Counter }>('test-doc');
    doc.update((root) => (root.counter = new Counter(CounterType.Int, 0)));
    assert.deepEqual(doc.getDocSize().live, { data: 4, meta: 72 });
  });

  it.todo('text test', function () {
    const doc = new Document<{ text: Text }>('test-doc');

    doc.update((root) => {
      root.text = new Text('hello');
    });
    assert.deepEqual(doc.getDocSize().live, { data: 10, meta: 72 });
  });
});
