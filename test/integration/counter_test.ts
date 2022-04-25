import { assert } from 'chai';
import { DocumentReplica } from '@yorkie-js-sdk/src/document/document';
import { withTwoClientsAndDocuments } from '@yorkie-js-sdk/test/integration/integration_helper';
import { TObject, TCounter } from '@yorkie-js-sdk/src/yorkie';

describe('Counter', function () {
  it('can be increased by Counter type', function () {
    const doc = DocumentReplica.create<{
      k1: TObject<{ age?: TCounter; length?: TCounter }>;
    }>('test-col', 'test-doc');

    doc.update((root) => {
      root['k1'] = {};
      root['k1'].createCounter!('age', 1);
      root['k1'].createCounter!('length', 10.5);

      root['k1']['age']!.increase(5);
      root['k1']['length']!.increase(3.5);
    });
    assert.equal(`{"k1":{"age":6,"length":14}}`, doc.toSortedJSON());

    doc.update((root) => {
      root['k1']['age']!.increase(1.5).increase(1);
      root['k1']['length']!.increase(3.5).increase(1);
    });
    assert.equal(`{"k1":{"age":8.5,"length":18.5}}`, doc.toSortedJSON());

    // error test
    assert.Throw(() => {
      doc.update((root) => {
        root['k1']['age']!.increase(true as any);
      });
    }, 'Unsupported type of value: boolean');
    assert.equal(`{"k1":{"age":8.5,"length":18.5}}`, doc.toSortedJSON());
  });

  it('Can handle increase operation', async function () {
    type TestDoc = { age: TCounter };
    await withTwoClientsAndDocuments<TestDoc>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.createCounter!('age', 0);
      });
      d1.update((root) => {
        root['age'].increase(1).increase(2);
        root.createCounter!('length', 10);
      });

      await c1.sync();
      await c2.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, this.test!.title);
  });

  it('Can handle concurrent increase operation', async function () {
    await withTwoClientsAndDocuments<{
      age: TCounter;
      width: TCounter;
      height: TCounter;
    }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.createCounter!('age', 0);
        root.createCounter!('width', 0);
        root.createCounter!('height', 0);
      });
      await c1.sync();
      await c2.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      d1.update((root) => {
        root['age'].increase(1).increase(2);
        root['width'].increase(10);
      });
      d2.update((root) => {
        root['age'].increase(3.14).increase(2);
        root.createCounter!('width', 2.5);
      });
      await c1.sync();
      await c2.sync();
      await c1.sync();

      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, this.test!.title);
  });
});
