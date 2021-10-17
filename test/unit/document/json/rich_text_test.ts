import { assert } from 'chai';
import { RichText } from '@yorkie-js-sdk/src/document/json/rich_text';
import { InitialTimeTicket } from '@yorkie-js-sdk/src/document/time/ticket';
import { RGATreeSplit } from '@yorkie-js-sdk/src/document/json/rga_tree_split';

describe('RichText', function () {
  it('basic test', function () {
    const rgaTreeSplit = RGATreeSplit.create();
    const richText = RichText.create(rgaTreeSplit, InitialTimeTicket);
    const range = richText.createRange(0, 0);

    richText.editInternal(range, 'test-value', InitialTimeTicket);

    const value = richText.getValue();
    assert.equal(value[0].content, '\n');
    assert.equal(value[1].content, 'test-value');

    assert.equal(
      '[{"attrs":{},"content":\n},{"attrs":{},"content":test-value}]',
      richText.toJSON(),
    );
  });
});
