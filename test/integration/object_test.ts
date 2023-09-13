import { assert } from 'chai';
import { JSONObject, Client } from '@yorkie-js-sdk/src/yorkie';
import { Document } from '@yorkie-js-sdk/src/document/document';
import {
  withTwoClientsAndDocuments,
  assertUndoRedo,
  toDocKey,
  testRPCAddr,
} from '@yorkie-js-sdk/test/integration/integration_helper';
import { YorkieError } from '@yorkie-js-sdk/src/util/error';

describe('Object', function () {
  it('valid key test', function () {
    const doc = new Document<any>('test-doc');

    assert.throws(() => {
      doc.update((root) => {
        root['.'] = 'dot';
      });
    }, YorkieError);

    assert.throws(() => {
      doc.update((root) => {
        root['$...hello'] = 'world';
      });
    }, YorkieError);

    assert.throws(() => {
      doc.update((root) => {
        root[''] = { '.': 'dot' };
      });
    }, YorkieError);
  });

  it('should apply updates inside nested map', function () {
    const doc = new Document<{
      k1: { 'k1-1'?: string; 'k1-2'?: string };
      k2: Array<string | { 'k2-5': string }>;
    }>('test-doc');
    const states: Array<string> = [];
    assert.equal('{}', doc.toSortedJSON());
    states.push(doc.toSortedJSON());

    doc.update((root) => {
      root['k1'] = { 'k1-1': 'v1' };
      root['k1']['k1-2'] = 'v2';
    }, 'set {"k1-1":"v1","k1-2":"v2":}');
    assert.equal('{"k1":{"k1-1":"v1","k1-2":"v2"}}', doc.toSortedJSON());
    states.push(doc.toSortedJSON());

    doc.update((root) => {
      root['k1']['k1-2'] = 'v3';
    }, 'set {"k1-2":"v3"}');
    assert.equal('{"k1":{"k1-1":"v1","k1-2":"v3"}}', doc.toSortedJSON());
    states.push(doc.toSortedJSON());

    doc.update((root) => {
      root['k2'] = ['1', '2'];
      root['k2'].push('3');
    }, 'set ["1","2","3"]');
    assert.equal(
      '{"k1":{"k1-1":"v1","k1-2":"v3"},"k2":["1","2","3"]}',
      doc.toSortedJSON(),
    );
    states.push(doc.toSortedJSON());

    assert.throws(() => {
      doc.update((root) => {
        root['k2'].push('4');
        throw new Error('dummy error');
      }, 'push "4"');
    }, 'dummy error');
    assert.equal(
      '{"k1":{"k1-1":"v1","k1-2":"v3"},"k2":["1","2","3"]}',
      doc.toSortedJSON(),
    );
    states.push(doc.toSortedJSON());

    doc.update((root) => {
      root['k2'].push('4');
    }, 'push "4"');
    assert.equal(
      '{"k1":{"k1-1":"v1","k1-2":"v3"},"k2":["1","2","3","4"]}',
      doc.toSortedJSON(),
    );
    states.push(doc.toSortedJSON());

    doc.update((root) => {
      root['k2'].push({ 'k2-5': 'v4' });
    }, 'push "{k2-5: 4}"');
    assert.equal(
      '{"k1":{"k1-1":"v1","k1-2":"v3"},"k2":["1","2","3","4",{"k2-5":"v4"}]}',
      doc.toSortedJSON(),
    );
    states.push(doc.toSortedJSON());

    //TODO(Hyemmie): test assertUndoRedo after implementing array's reverse operation
    // assertUndoRedo(doc, states);
  });

  it('should handle delete operations', function () {
    const doc = new Document<{
      k1: { 'k1-1'?: string; 'k1-2': string; 'k1-3'?: string };
    }>('test-doc');
    const states: Array<string> = [];
    assert.equal('{}', doc.toSortedJSON());

    doc.update((root) => {
      root['k1'] = { 'k1-1': 'v1', 'k1-2': 'v2' };
    }, 'set {"k1":{"k1-1":"v1","k1-2":"v2"}}');
    assert.equal('{"k1":{"k1-1":"v1","k1-2":"v2"}}', doc.toSortedJSON());
    states.push(doc.toSortedJSON());

    doc.update((root) => {
      root['k1']['k1-3'] = 'v4';
      delete root['k1']['k1-1'];
    }, 'set {"k1":{"k1-2":"v2"}}');
    assert.equal('{"k1":{"k1-2":"v2","k1-3":"v4"}}', doc.toSortedJSON());
    states.push(doc.toSortedJSON());

    assertUndoRedo(doc, states);
  });

  it('should support toJS and toJSON methods', function () {
    const doc = new Document<{
      content: JSONObject<{ a: number; b: number; c: number }>;
    }>('test-doc');
    doc.update((root) => {
      root.content = { a: 1, b: 2, c: 3 };
    }, 'set a, b, c');
    assert.equal(doc.toSortedJSON(), '{"content":{"a":1,"b":2,"c":3}}');

    const root = doc.getRoot();
    assert.equal(root.toJSON!(), '{"content":{"a":1,"b":2,"c":3}}');
    assert.deepEqual(root.toJS!(), { content: { a: 1, b: 2, c: 3 } });
    assert.equal(root.content.toJSON!(), '{"a":1,"b":2,"c":3}');
    assert.deepEqual(root.content.toJS!(), { a: 1, b: 2, c: 3 });
  });

  it('Object.keys, Object.values and Object.entries test', function () {
    const doc = new Document<{
      content: { a: number; b: number; c: number };
    }>('test-doc');
    assert.equal('{}', doc.toSortedJSON());

    doc.update((root) => {
      root.content = { a: 1, b: 2, c: 3 };
    }, 'set a, b, c');
    assert.equal('{"content":{"a":1,"b":2,"c":3}}', doc.toSortedJSON());

    const content = doc.getRoot().content;
    assert.equal('a,b,c', Object.keys(content).join(','));
    assert.equal('1,2,3', Object.values(content).join(','));
    assert.equal('a,1,b,2,c,3', Object.entries(content).join(','));
  });

  it('Can handle concurrent set/delete operations', async function () {
    await withTwoClientsAndDocuments<{
      k1: string;
      k2: string;
      k3?: string;
      k4: string;
    }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root['k1'] = 'v1';
      });
      d2.update((root) => {
        root['k1'] = 'v2';
      });
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      d1.update((root) => {
        root['k2'] = '3';
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      d1.update((root) => {
        root['k2'] = 'v2';
      });
      d2.update((root) => {
        root['k2'] = 'v3';
      });
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      d1.update((root) => {
        root['k3'] = 'v4';
      });
      d2.update((root) => {
        root['k4'] = 'v5';
      });
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      d1.update((root) => {
        delete root['k3'];
      });
      d2.update((root) => {
        root['k3'] = 'v6';
      });
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, this.test!.title);
  });

  it('Can undo/redo work properly for simple object', function () {
    const doc = new Document<{
      a: number;
    }>('test-doc');
    assert.equal(doc.toSortedJSON(), '{}');
    assert.equal(doc.history.canUndo(), false);
    assert.equal(doc.history.canRedo(), false);

    doc.update((root) => {
      root.a = 1;
    });
    assert.equal(doc.toSortedJSON(), '{"a":1}');
    assert.equal(doc.history.canUndo(), true);
    assert.equal(doc.history.canRedo(), false);

    doc.update((root) => {
      root.a = 2;
    });
    assert.equal(doc.toSortedJSON(), '{"a":2}');
    assert.equal(doc.history.canUndo(), true);
    assert.equal(doc.history.canRedo(), false);

    doc.history.undo();
    assert.equal(doc.toSortedJSON(), '{"a":1}');
    assert.equal(doc.history.canUndo(), true);
    assert.equal(doc.history.canRedo(), true);

    doc.history.redo();
    assert.equal(doc.toSortedJSON(), '{"a":2}');
    assert.equal(doc.history.canUndo(), true);
    assert.equal(doc.history.canRedo(), false);

    doc.history.undo();
    assert.equal(doc.toSortedJSON(), '{"a":1}');
    assert.equal(doc.history.canUndo(), true);
    assert.equal(doc.history.canRedo(), true);

    // TODO(chacha912): fix this test
    try {
      doc.history.undo();
    } catch (err) {
      console.log(err);
    }
    // assert.equal(doc.toSortedJSON(), '{}');
    // assert.equal(doc.history.canUndo(), false);
    // assert.equal(doc.history.canRedo(), true);
  });

  it('Can undo/redo work properly for nested object', function () {
    const doc = new Document<{
      shape: { point: { x: number; y: number }; color: string };
      a: number;
    }>('test-doc');
    const states: Array<string> = [];
    states.push(doc.toSortedJSON());
    assert.equal(doc.toSortedJSON(), '{}');

    doc.update((root) => {
      root.shape = { point: { x: 0, y: 0 }, color: 'red' };
      root.a = 0;
    });
    states.push(doc.toSortedJSON());
    assert.equal(
      doc.toSortedJSON(),
      '{"a":0,"shape":{"color":"red","point":{"x":0,"y":0}}}',
    );

    doc.update((root) => {
      root.shape.point = { x: 1, y: 1 };
      root.shape.color = 'blue';
    });
    states.push(doc.toSortedJSON());
    assert.equal(
      doc.toSortedJSON(),
      '{"a":0,"shape":{"color":"blue","point":{"x":1,"y":1}}}',
    );

    doc.update((root) => {
      root.a = 1;
      root.a = 2;
    });
    states.push(doc.toSortedJSON());
    assert.equal(
      doc.toSortedJSON(),
      '{"a":2,"shape":{"color":"blue","point":{"x":1,"y":1}}}',
    );

    // TODO(chacha912): fix this test
    // assertUndoRedo(doc, states);
  });

  it('concurrent undo/redo of object - no sync before undo', async function () {
    interface TestDoc {
      color: string;
    }
    const docKey = toDocKey(`${this.test!.title}-${new Date().getTime()}`);
    const doc1 = new Document<TestDoc>(docKey);
    const doc2 = new Document<TestDoc>(docKey);

    const client1 = new Client(testRPCAddr);
    const client2 = new Client(testRPCAddr);
    await client1.activate();
    await client2.activate();

    await client1.attach(doc1, { isRealtimeSync: false });
    doc1.update((root) => {
      root.color = 'black';
    }, 'init doc');
    await client1.sync();
    assert.equal(doc1.toSortedJSON(), '{"color":"black"}');

    await client2.attach(doc2, { isRealtimeSync: false });
    assert.equal(doc2.toSortedJSON(), '{"color":"black"}');

    doc1.update((root) => {
      root.color = 'red';
    }, 'set red');
    doc2.update((root) => {
      root.color = 'green';
    }, 'set green');

    assert.equal(doc1.toSortedJSON(), '{"color":"red"}');
    assert.equal(doc2.toSortedJSON(), '{"color":"green"}');

    doc1.history.undo();
    assert.equal(doc1.toSortedJSON(), '{"color":"black"}');

    await client1.sync();
    await client2.sync();
    await client1.sync();

    // client 2's green set wins client 1's undo
    assert.equal(doc1.toSortedJSON(), '{"color":"green"}');
    assert.equal(doc2.toSortedJSON(), '{"color":"green"}');

    doc1.history.redo();

    await client1.sync();
    await client2.sync();
    await client1.sync();

    assert.equal(doc1.toSortedJSON(), '{"color":"red"}');
    assert.equal(doc2.toSortedJSON(), '{"color":"red"}');
  });

  it('concurrent undo/redo of object - sync before undo', async function () {
    interface TestDoc {
      color: string;
    }
    const docKey = toDocKey(`${this.test!.title}-${new Date().getTime()}`);
    const doc1 = new Document<TestDoc>(docKey);
    const doc2 = new Document<TestDoc>(docKey);

    const client1 = new Client(testRPCAddr);
    const client2 = new Client(testRPCAddr);
    await client1.activate();
    await client2.activate();

    await client1.attach(doc1, { isRealtimeSync: false });
    doc1.update((root) => {
      root.color = 'black';
    }, 'init doc');
    await client1.sync();
    assert.equal(doc1.toSortedJSON(), '{"color":"black"}');

    await client2.attach(doc2, { isRealtimeSync: false });
    assert.equal(doc2.toSortedJSON(), '{"color":"black"}');

    doc1.update((root) => {
      root.color = 'red';
    }, 'set red');
    doc2.update((root) => {
      root.color = 'green';
    }, 'set green');
    await client1.sync();
    await client2.sync();
    await client1.sync();
    assert.equal(doc1.toSortedJSON(), '{"color":"green"}');
    assert.equal(doc2.toSortedJSON(), '{"color":"green"}');

    doc1.history.undo();
    assert.equal(doc1.toSortedJSON(), '{"color":"black"}');

    await client1.sync();
    await client2.sync();
    await client1.sync();

    assert.equal(doc1.toSortedJSON(), '{"color":"black"}');
    assert.equal(doc2.toSortedJSON(), '{"color":"black"}');

    doc1.history.redo();

    await client1.sync();
    await client2.sync();
    await client1.sync();

    assert.equal(doc1.toSortedJSON(), '{"color":"green"}');
    assert.equal(doc2.toSortedJSON(), '{"color":"green"}');
  });
});
