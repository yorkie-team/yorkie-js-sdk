import { assert } from 'chai';
import { Document } from '../../src/document/document';

describe('Counter', function () {
  it('can be increased by Counter type', function () {
    const doc = Document.create('test-col', 'test-doc');

    doc.update((root) => {
      root['k1'] = {};
      root['k1'].createCounter('age', 1);
      root['k1'].createCounter('length', 10.5);

      root['k1']['age'].increase(5);
      root['k1']['length'].increase(3.5);
    });
    assert.equal(`{"k1":{"age":6,"length":14}}`, doc.toSortedJSON());

    doc.update((root) => {
      root['k1']['age'].increase(1.5).increase(1);
      root['k1']['length'].increase(3.5).increase(1);
    });
    assert.equal(`{"k1":{"age":8.5,"length":18.5}}`, doc.toSortedJSON());

    // error test
    assert.Throw(() => {
      doc.update((root) => {
        root['k1']['age'].increase(true);
      });
    }, 'Unsupported type of value: boolean');
    assert.equal(`{"k1":{"age":8.5,"length":18.5}}`, doc.toSortedJSON());
  });
});
