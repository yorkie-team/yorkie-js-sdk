import { assert } from 'chai';
import { DocumentReplica } from '@yorkie-js-sdk/src/document/document';
import { TextChangeType } from '@yorkie-js-sdk/src/document/json/rga_tree_split';
import { TRichText } from '@yorkie-js-sdk/src/yorkie';

describe('RichText', function () {
  it('should handle rich text edit operations', function () {
    const doc = DocumentReplica.create<{ k1: TRichText }>(
      'test-col',
      'test-doc',
    );
    assert.equal('{}', doc.toSortedJSON());

    doc.update((root) => {
      const text = root.createRichText!('k1');
      text.edit(0, 0, 'ABCD', { b: '1' });
      text.edit(3, 3, '\n');
    }, 'set {"k1":"ABC\nD"}');

    doc.update((root) => {
      assert.equal(
        '[0:00:0:0 ][1:00:2:0 ABC][1:00:3:0 \n][1:00:2:3 D][1:00:1:0 \n]',
        root['k1'].getAnnotatedString(),
      );
    });

    assert.equal(
      '{"k1":[{"attrs":{"b":"1"},"content":ABC},{"attrs":{},"content":\n},{"attrs":{"b":"1"},"content":D},{"attrs":{},"content":\n}]}',
      doc.toSortedJSON(),
    );
  });

  it('should handle select operations', async function () {
    const doc = DocumentReplica.create<{ k1: TRichText }>(
      'test-col',
      'test-doc',
    );

    doc.update((root) => {
      root.createRichText!('k1');
      root.k1.edit(0, 0, 'ABCD');
    });

    doc.getRoot().k1.onChanges((changes) => {
      if (changes[0].type === TextChangeType.Selection) {
        assert.equal(changes[0].from, 2);
        assert.equal(changes[0].to, 4);
      }
    });
    doc.update((root) => root.k1.select(2, 4));
  });
});
