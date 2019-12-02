import { assert } from 'chai';
import { Document } from '../../src/document/document';

describe('Document', () => {
  it('Can be created', () => {
    const doc = Document.of('test-col', 'test-doc');
    doc.update((root) => {
      root.set('k1', 'v1');
    }, 'set v1 with k1');

    assert.equal('{"k1":"v1"}', doc.toJSON());
  });
});
