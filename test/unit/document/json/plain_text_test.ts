import { assert } from 'chai';
import { PlainText } from '@yorkie-js-sdk/src/document/json/plain_text';
import { InitialTimeTicket } from '@yorkie-js-sdk/src/document/time/ticket';
import { RGATreeSplit } from '@yorkie-js-sdk/src/document/json/rga_tree_split';

describe('PlainText', function () {
  it('basic test', function () {
    const rgaTreeSplit = RGATreeSplit.create();
    const plainText = PlainText.create(rgaTreeSplit, InitialTimeTicket);
    const range = plainText.createRange(0, 0);

    plainText.editInternal(range, 'test-value', InitialTimeTicket);
    assert.equal(plainText.getValue(), 'test-value');
    assert.equal(plainText.toJS(), 'test-value');
    assert.equal(plainText.toJSON(), '"test-value"');
  });
});
