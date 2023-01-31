import { assert } from 'chai';
import { JSONObject } from '@yorkie-js-sdk/src/yorkie';
import { DocEventType, Document } from '@yorkie-js-sdk/src/document/document';
import { withTwoClientsAndDocuments } from '@yorkie-js-sdk/test/integration/integration_helper';

describe('Object', function () {
  it('should apply updates inside nested map', function () {
    const doc = Document.create<{
      k1: { 'k1-1'?: string; 'k1-2'?: string };
      k2: Array<string | { 'k2-5': string }>;
    }>('test-doc');
    assert.equal('{}', doc.toSortedJSON());

    doc.update((root) => {
      root['k1'] = { 'k1-1': 'v1' };
      root['k1']['k1-2'] = 'v2';
    }, 'set {"k1-1":"v1","k1-2":"v2":}');
    assert.equal('{"k1":{"k1-1":"v1","k1-2":"v2"}}', doc.toSortedJSON());

    doc.update((root) => {
      root['k1']['k1-2'] = 'v3';
    }, 'set {"k1-2":"v3"}');
    assert.equal('{"k1":{"k1-1":"v1","k1-2":"v3"}}', doc.toSortedJSON());

    doc.update((root) => {
      root['k2'] = ['1', '2'];
      root['k2'].push('3');
    }, 'set ["1","2","3"]');
    assert.equal(
      '{"k1":{"k1-1":"v1","k1-2":"v3"},"k2":["1","2","3"]}',
      doc.toSortedJSON(),
    );

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

    doc.update((root) => {
      root['k2'].push('4');
    }, 'push "4"');
    assert.equal(
      '{"k1":{"k1-1":"v1","k1-2":"v3"},"k2":["1","2","3","4"]}',
      doc.toSortedJSON(),
    );

    doc.update((root) => {
      root['k2'].push({ 'k2-5': 'v4' });
    }, 'push "{k2-5: 4}"');
    assert.equal(
      '{"k1":{"k1-1":"v1","k1-2":"v3"},"k2":["1","2","3","4",{"k2-5":"v4"}]}',
      doc.toSortedJSON(),
    );
  });

  it('should handle delete operations', function () {
    const doc = Document.create<{
      k1: { 'k1-1'?: string; 'k1-2': string; 'k1-3'?: string };
    }>('test-doc');
    assert.equal('{}', doc.toSortedJSON());

    doc.update((root) => {
      root['k1'] = { 'k1-1': 'v1', 'k1-2': 'v2' };
    }, 'set {"k1":{"k1-1":"v1","k1-2":"v2"}}');
    assert.equal('{"k1":{"k1-1":"v1","k1-2":"v2"}}', doc.toSortedJSON());

    doc.update((root) => {
      delete root['k1']['k1-1'];
      root['k1']['k1-3'] = 'v4';
    }, 'set {"k1":{"k1-2":"v2"}}');
    assert.equal('{"k1":{"k1-2":"v2","k1-3":"v4"}}', doc.toSortedJSON());
  });

  it('should support toJS and toJSON methods', function () {
    const doc = Document.create<{
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
    const doc = Document.create<{
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

  it('should show a reduced version of paths in cases when a nested object is instantiated', async function () {
    await withTwoClientsAndDocuments<{
      k1: {
        id: string;
        selected: boolean;
        test: string;
        layers: Array<{ a: string; b: string }>;
      };
      k2: number;
    }>(async (c1, d1, c2, d2) => {
      // TODO(hackerwins): consider replacing the below code with `createEmitterAndSpy`.
      d2.subscribe((event) => {
        if (event.type === DocEventType.RemoteChange) {
          assert.deepEqual(event.value[0].paths.sort(), ['$.k1', '$.k2']);
        }
      });
      d1.subscribe((event) => {
        if (event.type === DocEventType.RemoteChange) {
          assert.deepEqual(event.value[0].paths, [
            '$.k1.selected',
            '$.k1.layers.0.a',
            '$.k2',
          ]);
        }
      });
      d1.update((root) => {
        root['k1'] = {
          id: 'id7fb51ad',
          selected: false,
          test: 'hi',
          layers: [{ a: 'hi', b: 'bhi' }],
        };
        root['k1']['selected'] = true;
        root['k1']['test'] = 'change';
        root['k2'] = 5;
      });

      await c1.sync();
      await c2.sync();
      await c1.sync();
      d2.update((root) => {
        root['k1']['selected'] = false;
        root['k1']['layers'][0]['a'] = 'hi2';
        root['k2']++;
      });
      await c1.sync();
      await c2.sync();
      await c1.sync();
    }, this.test!.title);
  });
});
