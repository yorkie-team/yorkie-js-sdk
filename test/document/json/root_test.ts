import { assert } from 'chai';
import { InitialChangeID } from '../../../src/document/change/change_id';
import { JSONRoot } from '../../../src/document/json/root';
import { JSONObject } from '../../../src/document/json/object';
import { RHTPQMap } from '../../../src/document/json/rht_pq_map';
import { ChangeContext } from '../../../src/document/change/context';
import { ObjectProxy } from '../../../src/document/proxy/object_proxy';
import { ArrayProxy } from '../../../src/document/proxy/array_proxy';

import { InitialTimeTicket } from '../../../src/document/time/ticket';
import { MaxTimeTicket } from '../../../src/document/time/ticket';
import { RGATreeList } from '../../../src/document/json/rga_tree_list';
import { JSONArray } from '../../../src/yorkie';

describe('ROOT', function () {
  it('garbage collection test for array', function () {
    const root = new JSONRoot(
      new JSONObject(InitialTimeTicket, RHTPQMap.create()),
    );
    const arr = new JSONArray(InitialTimeTicket, RGATreeList.create());
    const change = ChangeContext.create(InitialChangeID, '', root);

    ArrayProxy.pushInternal(change, arr, 0);
    ArrayProxy.pushInternal(change, arr, 1);
    ArrayProxy.pushInternal(change, arr, 2);
    assert.equal('[0,1,2]', arr.toJSON());

    const targetElement = arr.getByIndex(1);
    arr.delete(targetElement.getCreatedAt(), change.issueTimeTicket());
    root.registerRemovedElementPair(arr, targetElement);
    assert.equal('[0,2]', arr.toJSON());
    assert.equal(1, root.getGarbageLen());

    assert.equal(1, root.garbageCollect(MaxTimeTicket));
    assert.equal(0, root.getGarbageLen());
  });

  it('garbage collection test for text', function () {
    const root = new JSONRoot(
      new JSONObject(InitialTimeTicket, RHTPQMap.create()),
    );
    const obj = new JSONObject(InitialTimeTicket, RHTPQMap.create());
    const change = ChangeContext.create(InitialChangeID, '', root);
    const text = ObjectProxy.createText(change, obj, 'k1');

    text.edit(0, 0, 'Hello World');
    assert.equal(0, root.getGarbageLen());

    text.edit(6, 11, 'Yorkie');
    assert.equal(1, root.getGarbageLen());

    text.edit(0, 6, '');
    assert.equal(2, root.getGarbageLen());

    assert.equal(2, root.garbageCollect(MaxTimeTicket));
    assert.equal('[0:00:0:0 ][0:00:3:0 Yorkie]', text.getAnnotatedString());
    assert.equal(0, root.getGarbageLen());
  });

  it('garbage collection test for rich text', function () {
    const root = new JSONRoot(
      new JSONObject(InitialTimeTicket, RHTPQMap.create()),
    );
    const obj = new JSONObject(InitialTimeTicket, RHTPQMap.create());
    const change = ChangeContext.create(InitialChangeID, '', root);
    const text = ObjectProxy.createRichText(change, obj, 'k1');

    text.edit(0, 0, 'Hello World');
    assert.equal(
      '[0:00:0:0 ][0:00:2:0 Hello World][0:00:1:0 \n]',
      text.getAnnotatedString(),
    );
    assert.equal(0, root.getGarbageLen());

    text.edit(6, 11, 'Yorkie');
    assert.equal(1, root.getGarbageLen());

    text.edit(0, 6, '');
    assert.equal(2, root.getGarbageLen());

    assert.equal(2, root.garbageCollect(MaxTimeTicket));
    assert.equal(
      '[0:00:0:0 ][0:00:3:0 Yorkie][0:00:1:0 \n]',
      text.getAnnotatedString(),
    );
    assert.equal(0, root.getGarbageLen());
  });
});
