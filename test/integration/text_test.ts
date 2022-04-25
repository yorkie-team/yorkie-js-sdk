import { assert } from 'chai';
import { DocumentReplica } from '@yorkie-js-sdk/src/document/document';
import { PlainText } from '@yorkie-js-sdk/src/document/json/plain_text';
import { TextView } from '@yorkie-js-sdk/test/helper/helper';
import { TextChangeType } from '@yorkie-js-sdk/src/document/json/rga_tree_split';
import { withTwoClientsAndDocuments } from '@yorkie-js-sdk/test/integration/integration_helper';
import { TText } from '@yorkie-js-sdk/src/yorkie';

describe('Text', function () {
  it('should handle edit operations', function () {
    const doc = DocumentReplica.create<{ k1: TText }>('test-col', 'test-doc');
    assert.equal('{}', doc.toSortedJSON());

    //           ------ ins links ----
    //           |            |      |
    // [init] - [A] - [12] - {BC} - [D]
    doc.update((root) => {
      const text = root.createText!('k1');
      text.edit(0, 0, 'ABCD');
      text.edit(1, 3, '12');
    }, 'set {"k1":"A12D"}');

    doc.update((root) => {
      assert.equal(
        '[0:00:0:0 ][1:00:2:0 A][1:00:3:0 12]{1:00:2:1 BC}[1:00:2:3 D]',
        root['k1'].getAnnotatedString(),
      );

      let range = root['k1'].createRange(0, 0);
      assert.equal('0:00:0:0:0', range[0].getAnnotatedString());

      range = root['k1'].createRange(1, 1);
      assert.equal('1:00:2:0:1', range[0].getAnnotatedString());

      range = root['k1'].createRange(2, 2);
      assert.equal('1:00:3:0:1', range[0].getAnnotatedString());

      range = root['k1'].createRange(3, 3);
      assert.equal('1:00:3:0:2', range[0].getAnnotatedString());

      range = root['k1'].createRange(4, 4);
      assert.equal('1:00:2:3:1', range[0].getAnnotatedString());
    });

    assert.equal('{"k1":"A12D"}', doc.toSortedJSON());
  });

  it('should handle edit operations2', function () {
    const doc = DocumentReplica.create<{ k1: TText }>('test-col', 'test-doc');
    assert.equal('{}', doc.toSortedJSON());

    //           -- ins links ---
    //           |              |
    // [init] - [ABC] - [\n] - [D]
    doc.update((root) => {
      const text = root.createText!('k1');
      text.edit(0, 0, 'ABCD');
      text.edit(3, 3, '\n');
    }, 'set {"k1":"ABC\nD"}');

    doc.update((root) => {
      assert.equal(
        '[0:00:0:0 ][1:00:2:0 ABC][1:00:3:0 \n][1:00:2:3 D]',
        root['k1'].getAnnotatedString(),
      );
    });

    assert.equal('{"k1":"ABC\nD"}', doc.toSortedJSON());
  });

  it('should handle type 하늘', function () {
    const doc = DocumentReplica.create<{ k1: TText }>('test-col', 'test-doc');
    assert.equal('{}', doc.toSortedJSON());

    doc.update((root) => {
      const text = root.createText!('k1');
      text.edit(0, 0, 'ㅎ');
      text.edit(0, 1, '하');
      text.edit(0, 1, '한');
      text.edit(0, 1, '하');
      text.edit(1, 1, '느');
      text.edit(1, 2, '늘');
    }, 'set {"k1":"하늘"}');

    assert.equal('{"k1":"하늘"}', doc.toSortedJSON());
  });

  it('should handle deletion of nested nodes', function () {
    const doc = DocumentReplica.create<{ text: PlainText }>(
      'test-col',
      'test-doc',
    );
    const view = new TextView();
    doc.update((root) => root.createText!('text'));
    doc.getRoot().text.onChanges((changes) => view.applyChanges(changes));

    const commands = [
      { from: 0, to: 0, content: 'ABC' },
      { from: 3, to: 3, content: 'DEF' },
      { from: 2, to: 4, content: '1' },
      { from: 1, to: 4, content: '2' },
    ];

    for (const cmd of commands) {
      doc.update((root) => root.text.edit(cmd.from, cmd.to, cmd.content));
      assert.equal(view.getValue(), doc.getRoot().text.getValue());
    }
  });

  it('should handle select operations', async function () {
    const doc = DocumentReplica.create<{
      text: PlainText;
    }>('test-col', 'test-doc');

    doc.update((root) => {
      root.createText!('text');
      root.text.edit(0, 0, 'ABCD');
    });

    doc.getRoot().text.onChanges((changes) => {
      if (changes[0].type === TextChangeType.Selection) {
        assert.equal(changes[0].from, 2);
        assert.equal(changes[0].to, 4);
      }
    });
    doc.update((root) => root.text.select(2, 4));
  });

  it('should handle edit operations', async function () {
    await withTwoClientsAndDocuments<{ k1: TText }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.createText!('k1');
        root['k1'].edit(0, 0, 'ABCD');
      }, 'set new text by c1');
      await c1.sync();
      await c2.sync();
      assert.equal(d1.toSortedJSON(), `{"k1":"ABCD"}`);
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      d1.update((root) => {
        root.createText!('k1');
        root['k1'].edit(0, 0, '1234');
      }, 'edit 0,0 1234 by c1');
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), `{"k1":"1234"}`);
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, this.test!.title);
  });

  it('should handle concurrent edit operations', async function () {
    await withTwoClientsAndDocuments<{ k1: TText }>(async (c1, d1, c2, d2) => {
      d1.update((root) => {
        root.createText!('k1');
      }, 'set new text by c1');
      await c1.sync();
      await c2.sync();
      assert.equal(d1.toSortedJSON(), `{"k1":""}`);
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      d1.update((root) => {
        root['k1'].edit(0, 0, 'ABCD');
      }, 'edit 0,0 ABCD by c1');
      assert.equal(d1.toSortedJSON(), `{"k1":"ABCD"}`);
      d2.update((root) => {
        root['k1'].edit(0, 0, '1234');
      }, 'edit 0,0 1234 by c2');
      assert.equal(d2.toSortedJSON(), `{"k1":"1234"}`);
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      d1.update((root) => {
        root['k1'].edit(2, 3, 'XX');
      }, 'edit 2,3 XX by c1');
      d2.update((root) => {
        root['k1'].edit(2, 3, 'YY');
      }, 'edit 2,3 YY by c1');
      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());

      d1.update((root) => {
        root['k1'].edit(4, 5, 'ZZ');
      }, 'edit 4,5 ZZ by c1');
      d2.update((root) => {
        root['k1'].edit(2, 3, 'TT');
      }, 'edit 2,3 TT by c1');

      await c1.sync();
      await c2.sync();
      await c1.sync();
      assert.equal(d1.toSortedJSON(), d2.toSortedJSON());
    }, this.test!.title);
  });
});
