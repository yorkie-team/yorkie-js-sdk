import { assert } from 'chai';
import yorkie, { Tree } from '@yorkie-js-sdk/src/yorkie';
import { toDocKey } from '@yorkie-js-sdk/test/integration/integration_helper';

describe('Tree', () => {
  it('Can create a tree', async function () {
    type TreeDoc = { t: Tree };
    const docKey = toDocKey(`${this.test!.title}-${new Date().getTime()}`);
    const doc = new yorkie.Document<TreeDoc>(docKey);
    doc.update((root) => {
      // 01. Create a tree and insert a paragraph.
      root.t = new Tree();
      root.t.edit(0, 0, { type: 'p', children: [] });
      assert.equal(
        '{"t":{"type":"root","children":[{"type":"p","children":[]}]}}',
        root.toJSON!(),
      );

      // 02. Create a text into the paragraph.
      root.t.edit(1, 1, { type: 'text', value: 'AB' });
      assert.equal(
        '{"t":{"type":"root","children":[{"type":"p","children":[{"type":"text","value":"AB"}]}]}}',
        root.toJSON!(),
      );

      // 03. Insert a text into the paragraph.
      root.t.edit(3, 3, { type: 'text', value: 'CD' });
      assert.equal(
        '{"t":{"type":"root","children":[{"type":"p","children":[{"type":"text","value":"AB"},{"type":"text","value":"CD"}]}]}}',
        root.toJSON!(),
      );
    });
  });
});
