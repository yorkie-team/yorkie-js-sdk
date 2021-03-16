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
import { JSONPrimitive } from '../../../src/document/json/primitive';
import { JSONArray } from '../../../src/yorkie';

describe('ROOT', function () {
  it('basic test', function () {
    const root = new JSONRoot(
      new JSONObject(InitialTimeTicket, RHTPQMap.create()),
    );
    const cc = ChangeContext.create(InitialChangeID, root);
    assert.isUndefined(root.findByCreatedAt(MaxTimeTicket));

    // set '$.k1'
    const k1 = JSONPrimitive.of('k1', cc.issueTimeTicket());
    root.getObject().set('k1', k1);
    root.registerElement(k1, root.getObject());
    assert.equal(root.getElementMapSize(), 2);
    assert.equal(root.findByCreatedAt(k1.getCreatedAt()), k1);
    assert.equal(root.createPath(k1.getCreatedAt()), '$.k1');

    // delete '$.k1'
    root.getObject().deleteByKey('k1', cc.issueTimeTicket());
    root.deregisterElement(k1);
    assert.equal(root.getElementMapSize(), 1);
    assert.isUndefined(root.findByCreatedAt(k1.getCreatedAt()));

    // set '$.k2'
    const k2 = JSONObject.create(cc.issueTimeTicket());
    root.getObject().set('k2', k2);
    root.registerElement(k2, root.getObject());
    assert.equal(root.getElementMapSize(), 2);
    assert.equal(root.findByCreatedAt(k2.getCreatedAt()), k2);
    assert.equal(root.createPath(k2.getCreatedAt()), '$.k2');

    // set '$.k2.1'
    const k2_1 = JSONArray.create(cc.issueTimeTicket());
    k2.set('1', k2_1);
    root.registerElement(k2_1, k2);
    assert.equal(root.getElementMapSize(), 3);
    assert.equal(root.findByCreatedAt(k2_1.getCreatedAt()), k2_1);
    assert.equal(root.createPath(k2_1.getCreatedAt()), '$.k2.1');

    // set '$.k2.1.0'
    const k2_1_0 = JSONPrimitive.of('0', cc.issueTimeTicket());
    k2_1.insertAfter(k2_1.getLastCreatedAt(), k2_1_0);
    root.registerElement(k2_1_0, k2_1);
    assert.equal(root.getElementMapSize(), 4);
    assert.equal(root.findByCreatedAt(k2_1_0.getCreatedAt()), k2_1_0);
    assert.equal(root.createPath(k2_1_0.getCreatedAt()), '$.k2.1.0');

    // set '$.k2.1.1'
    const k2_1_1 = JSONPrimitive.of('1', cc.issueTimeTicket());
    k2_1.insertAfter(k2_1_0.getCreatedAt(), k2_1_1);
    root.registerElement(k2_1_1, k2_1);
    assert.equal(root.getElementMapSize(), 5);
    assert.equal(root.findByCreatedAt(k2_1_1.getCreatedAt()), k2_1_1);
    assert.equal(root.createPath(k2_1_1.getCreatedAt()), '$.k2.1.1');
  });

  it('garbage collection test for array', function () {
    const root = new JSONRoot(
      new JSONObject(InitialTimeTicket, RHTPQMap.create()),
    );
    const arr = new JSONArray(InitialTimeTicket, RGATreeList.create());
    const change = ChangeContext.create(InitialChangeID, root);

    ArrayProxy.pushInternal(change, arr, 0);
    ArrayProxy.pushInternal(change, arr, 1);
    ArrayProxy.pushInternal(change, arr, 2);
    assert.equal('[0,1,2]', arr.toJSON());

    const targetElement = arr.getByIndex(1)!;
    arr.delete(targetElement.getCreatedAt(), change.issueTimeTicket());
    root.registerRemovedElement(targetElement);
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
    const change = ChangeContext.create(InitialChangeID, root);
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
    const change = ChangeContext.create(InitialChangeID, root);
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
