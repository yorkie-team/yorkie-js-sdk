import { assert } from 'chai';
import { DocumentReplica } from '../../src/document/document';
import { RichText } from '../../src/document/json/rich_text';
import { TextChangeType } from '../../src/document/json/rga_tree_split';

describe('RichText', function () {
  it('should handle rich text edit operations', function () {
    const doc = DocumentReplica.create('test-col', 'test-doc');
    assert.equal('{}', doc.toSortedJSON());

    doc.update((root) => {
      const text = root.createRichText('k1');
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
    const doc = DocumentReplica.create<{
      rich: RichText;
    }>('test-col', 'test-doc');

    doc.update((root) => {
      root.createRichText('rich');
      root.rich.edit(0, 0, 'ABCD');
    });

    doc.getRoot().rich.onChanges((changes) => {
      if (changes[0].type === TextChangeType.Selection) {
        assert.equal(changes[0].from, 2);
        assert.equal(changes[0].to, 4);
      }
    });
    doc.update((root) => root.rich.select(2, 4));
  });
});
