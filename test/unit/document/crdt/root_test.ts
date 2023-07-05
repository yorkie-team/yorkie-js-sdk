import { assert } from 'chai';
import { InitialChangeID } from '@yorkie-js-sdk/src/document/change/change_id';
import { CRDTRoot } from '@yorkie-js-sdk/src/document/crdt/root';
import { CRDTObject } from '@yorkie-js-sdk/src/document/crdt/object';
import { ElementRHT } from '@yorkie-js-sdk/src/document/crdt/element_rht';
import { ChangeContext } from '@yorkie-js-sdk/src/document/change/context';
import { ArrayProxy } from '@yorkie-js-sdk/src/document/json/array';
import { InitialTimeTicket } from '@yorkie-js-sdk/src/document/time/ticket';
import { MaxTimeTicket } from '@yorkie-js-sdk/src/document/time/ticket';
import { RGATreeList } from '@yorkie-js-sdk/src/document/crdt/rga_tree_list';
import { Primitive } from '@yorkie-js-sdk/src/document/crdt/primitive';
import { CRDTArray } from '@yorkie-js-sdk/src/document/crdt/array';
import { CRDTText } from '@yorkie-js-sdk/src/document/crdt/text';
import { RGATreeSplit } from '@yorkie-js-sdk/src/document/crdt/rga_tree_split';
import { Text } from '@yorkie-js-sdk/src/yorkie';

describe('ROOT', function () {
  it('basic test', function () {
    const root = new CRDTRoot(
      new CRDTObject(InitialTimeTicket, ElementRHT.create()),
    );
    const cc = ChangeContext.create(InitialChangeID, root);
    assert.isUndefined(root.findByCreatedAt(MaxTimeTicket));
    assert.equal(root.createPath(MaxTimeTicket), '');

    // set '$.k1'
    const k1 = Primitive.of('k1', cc.issueTimeTicket());
    root.getObject().set('k1', k1);
    root.registerElement(k1, root.getObject());
    assert.equal(root.getElementMapSize(), 2);
    assert.equal(root.findByCreatedAt(k1.getCreatedAt()), k1);
    assert.equal(root.createPath(k1.getCreatedAt()), '$.k1');

    // delete '$.k1'
    assert.isUndefined(root.findByCreatedAt(MaxTimeTicket));
    root.getObject().deleteByKey('k1', cc.issueTimeTicket());
    root.deregisterElement(k1);
    assert.equal(root.getElementMapSize(), 1);
    assert.isUndefined(root.findByCreatedAt(k1.getCreatedAt()));

    // set '$.k2'
    const k2 = CRDTObject.create(cc.issueTimeTicket());
    root.getObject().set('k2', k2);
    root.registerElement(k2, root.getObject());
    assert.equal(root.getElementMapSize(), 2);
    assert.equal(root.findByCreatedAt(k2.getCreatedAt()), k2);
    assert.equal(root.createPath(k2.getCreatedAt()), '$.k2');
    assert.equal(k2.toJSON(), '{}');
    assert.equal(Object.keys(k2.toJS()).length, 0);

    // set '$.k2.1'
    const k2Dot1 = CRDTArray.create(cc.issueTimeTicket());
    k2.set('1', k2Dot1);
    root.registerElement(k2Dot1, k2);
    assert.equal(root.getElementMapSize(), 3);
    assert.equal(root.findByCreatedAt(k2Dot1.getCreatedAt()), k2Dot1);
    assert.equal(root.createPath(k2Dot1.getCreatedAt()), '$.k2.1');

    // set '$.k2.1.0'
    const k2Dot1Dot0 = Primitive.of('0', cc.issueTimeTicket());
    k2Dot1.insertAfter(k2Dot1.getLastCreatedAt(), k2Dot1Dot0);
    root.registerElement(k2Dot1Dot0, k2Dot1);
    assert.equal(root.getElementMapSize(), 4);
    assert.equal(root.findByCreatedAt(k2Dot1Dot0.getCreatedAt()), k2Dot1Dot0);
    assert.equal(root.createPath(k2Dot1Dot0.getCreatedAt()), '$.k2.1.0');

    // set '$.k2.1.1'
    const k2dot1dot1 = Primitive.of('1', cc.issueTimeTicket());
    k2Dot1.insertAfter(k2Dot1Dot0.getCreatedAt(), k2dot1dot1);
    root.registerElement(k2dot1dot1, k2Dot1);
    assert.equal(root.getElementMapSize(), 5);
    assert.equal(root.findByCreatedAt(k2dot1dot1.getCreatedAt()), k2dot1dot1);
    assert.equal(root.createPath(k2dot1dot1.getCreatedAt()), '$.k2.1.1');
  });

  it('garbage collection test for array', function () {
    const root = new CRDTRoot(
      new CRDTObject(InitialTimeTicket, ElementRHT.create()),
    );
    const arr = new CRDTArray(InitialTimeTicket, RGATreeList.create());
    const change = ChangeContext.create(InitialChangeID, root);

    ArrayProxy.pushInternal(change, arr, 0);
    ArrayProxy.pushInternal(change, arr, 1);
    ArrayProxy.pushInternal(change, arr, 2);
    assert.equal('[0,1,2]', arr.toJSON());

    const arrJs1 = arr.toJS();
    assert.equal(0, arrJs1?.[0]);
    assert.equal(1, arrJs1?.[1]);
    assert.equal(2, arrJs1?.[2]);

    const targetElement = arr.getByIndex(1)!;
    arr.delete(targetElement.getCreatedAt(), change.issueTimeTicket());
    root.registerRemovedElement(targetElement);
    assert.equal('[0,2]', arr.toJSON());
    assert.equal(1, root.getGarbageLen());

    const arrJs2 = arr.toJS();
    assert.equal(0, arrJs2?.[0]);
    assert.equal(2, arrJs2?.[1]);

    assert.equal(1, root.garbageCollect(MaxTimeTicket));
    assert.equal(0, root.getGarbageLen());
  });

  it('garbage collection test for text', function () {
    const root = new CRDTRoot(
      new CRDTObject(InitialTimeTicket, ElementRHT.create()),
    );
    const obj = new CRDTObject(InitialTimeTicket, ElementRHT.create());
    const change = ChangeContext.create(InitialChangeID, root);
    const crdtText = CRDTText.create(
      RGATreeSplit.create(),
      change.issueTimeTicket(),
    );
    obj.set('k1', crdtText);
    change.registerElement(crdtText, obj);
    const text = new Text(change, crdtText);

    text.edit(0, 0, 'Hello World');
    assert.equal('[0:00:0:0 ][0:00:2:0 Hello World]', text.toTestString());
    assert.equal(0, root.getGarbageLen());

    text.edit(6, 11, 'Yorkie');
    assert.equal(1, root.getGarbageLen());

    text.edit(0, 6, '');
    assert.equal(2, root.getGarbageLen());

    assert.equal(2, root.garbageCollect(MaxTimeTicket));
    assert.equal('[0:00:0:0 ][0:00:3:0 Yorkie]', text.toTestString());
    assert.equal(0, root.getGarbageLen());
  });
});
