import { assert } from 'chai';
import { MaxTimeTicket } from '@yorkie-js-sdk/src/document/time/ticket';
import { CRDTArray } from '@yorkie-js-sdk/src/document/crdt/array';
import yorkie, { Tree } from '@yorkie-js-sdk/src/yorkie';
import {
  testRPCAddr,
  toDocKey,
} from '@yorkie-js-sdk/test/integration/integration_helper';
import { Text } from '@yorkie-js-sdk/src/yorkie';
import { CRDTTreeNode } from '@yorkie-js-sdk/src/document/crdt/tree';
import { IndexTreeNode } from '@yorkie-js-sdk/src/util/index_tree';

// `getNodeLength` returns the number of nodes in the given tree.
function getNodeLength(root: IndexTreeNode<CRDTTreeNode>) {
  let size = 0;

  size += root._children.length;

  if (root._children.length) {
    root._children.forEach((child) => {
      size += getNodeLength(child);
    });
  }

  return size;
}

describe('Garbage Collection', function () {
  it('garbage collection test', function () {
    const doc = new yorkie.Document<{
      1: number;
      2?: Array<number>;
      3: number;
    }>('test-doc');
    assert.equal('{}', doc.toSortedJSON());

    doc.update((root) => {
      root['1'] = 1;
      root['2'] = [1, 2, 3];
      root['3'] = 3;
    }, 'set 1, 2, 3');
    assert.equal('{"1":1,"2":[1,2,3],"3":3}', doc.toSortedJSON());

    doc.update((root) => {
      delete root['2'];
    }, 'deletes 2');
    assert.equal('{"1":1,"3":3}', doc.toSortedJSON());
    assert.equal(4, doc.getGarbageLen());
    assert.equal(4, doc.garbageCollect(MaxTimeTicket));
    assert.equal(0, doc.getGarbageLen());
  });

  it('garbage collection test2', function () {
    const size = 10000;
    const doc = new yorkie.Document<{ 1?: Array<unknown> }>('test-doc');
    doc.update((root) => {
      root['1'] = Array.from(Array(size).keys());
    }, 'sets big array');

    doc.update((root) => {
      delete root['1'];
    }, 'deletes the array');

    assert.equal(size + 1, doc.garbageCollect(MaxTimeTicket));
  });

  it('garbage collection test3', function () {
    const doc = new yorkie.Document<{ list: Array<number> }>('test-doc');
    assert.equal('{}', doc.toSortedJSON());

    doc.update((root) => {
      root['list'] = [1, 2, 3];
    }, 'set 1, 2, 3');
    assert.equal('{"list":[1,2,3]}', doc.toSortedJSON());

    doc.update((root) => {
      delete root['list'][1];
    }, 'deletes 2');
    assert.equal('{"list":[1,3]}', doc.toSortedJSON());

    assert.equal(1, doc.getGarbageLen());
    assert.equal(1, doc.garbageCollect(MaxTimeTicket));
    assert.equal(0, doc.getGarbageLen());

    const root = (doc.getRootObject().get('list') as CRDTArray)
      .getElements()
      .toTestString();
    const clone = (doc.getClone()!.get('list') as CRDTArray)
      .getElements()
      .toTestString();

    assert.equal(root, clone);
  });

  it('text garbage collection test', function () {
    const doc = new yorkie.Document<{ text: Text }>('test-doc');
    doc.update((root) => (root.text = new Text()));
    doc.update((root) => root.text.edit(0, 0, 'ABCD'));
    doc.update((root) => root.text.edit(0, 2, '12'));

    assert.equal(
      '[0:00:0:0 ][3:00:1:0 12]{2:00:1:0 AB}[2:00:1:2 CD]',
      doc.getRoot().text.toTestString(),
    );

    assert.equal(1, doc.getGarbageLen());
    doc.garbageCollect(MaxTimeTicket);
    assert.equal(0, doc.getGarbageLen());

    assert.equal(
      '[0:00:0:0 ][3:00:1:0 12][2:00:1:2 CD]',
      doc.getRoot().text.toTestString(),
    );

    doc.update((root) => root.text.edit(2, 4, ''));

    assert.equal(
      '[0:00:0:0 ][3:00:1:0 12]{2:00:1:2 CD}',
      doc.getRoot().text.toTestString(),
    );
  });

  it('garbage collection test for text', function () {
    const doc = new yorkie.Document<{ k1: Text }>('test-doc');
    assert.equal('{}', doc.toSortedJSON());

    let expectedMessage = '{"k1":[{"val":"Hello "},{"val":"mario"}]}';
    doc.update((root) => {
      root.k1 = new Text();
      root.k1.edit(0, 0, 'Hello world');
      root.k1.edit(6, 11, 'mario');
      assert.equal(expectedMessage, root.toJSON!());
    }, 'edit text k1');
    assert.equal(expectedMessage, doc.toSortedJSON());
    assert.equal(1, doc.getGarbageLen());

    expectedMessage =
      '{"k1":[{"val":"Hi"},{"val":" "},{"val":"j"},{"val":"ane"}]}';

    doc.update((root) => {
      const text = root['k1'];
      text.edit(0, 5, 'Hi');
      text.edit(3, 4, 'j');
      text.edit(4, 8, 'ane');
      assert.equal(expectedMessage, root.toJSON!());
    }, 'deletes 2');
    assert.equal(expectedMessage, doc.toSortedJSON());

    const expectedGarbageLen = 4;
    assert.equal(expectedGarbageLen, doc.getGarbageLen());
    assert.equal(expectedGarbageLen, doc.garbageCollect(MaxTimeTicket));

    const empty = 0;
    assert.equal(empty, doc.getGarbageLen());
  });

  it('garbage collection test for text with attributes', function () {
    const doc = new yorkie.Document<{ k1: Text }>('test-doc');
    assert.equal('{}', doc.toSortedJSON());

    let expectedMessage =
      '{"k1":[{"attrs":{"b":"1"},"val":"Hello "},{"val":"mario"}]}';

    doc.update((root) => {
      root.k1 = new Text();
      root.k1.edit(0, 0, 'Hello world', { b: '1' });
      root.k1.edit(6, 11, 'mario');
      assert.equal(expectedMessage, root.toJSON!());
    }, 'edit text k1');
    assert.equal(expectedMessage, doc.toSortedJSON());
    assert.equal(1, doc.getGarbageLen());

    expectedMessage =
      '{"k1":[{"attrs":{"b":"1"},"val":"Hi"},{"attrs":{"b":"1"},"val":" "},{"val":"j"},{"attrs":{"b":"1"},"val":"ane"}]}';

    doc.update((root) => {
      const text = root['k1'];
      text.edit(0, 5, 'Hi', { b: '1' });
      text.edit(3, 4, 'j');
      text.edit(4, 8, 'ane', { b: '1' });
      assert.equal(expectedMessage, root.toJSON!());
    }, 'edit text k1');
    assert.equal(expectedMessage, doc.toSortedJSON());

    const expectedGarbageLen = 4;
    assert.equal(expectedGarbageLen, doc.getGarbageLen());
    assert.equal(expectedGarbageLen, doc.garbageCollect(MaxTimeTicket));

    const empty = 0;
    assert.equal(empty, doc.getGarbageLen());
  });

  it('garbage collection test for tree', function () {
    const doc = new yorkie.Document<{ t: Tree }>('test-doc');
    assert.equal('{}', doc.toSortedJSON());

    doc.update((root) => {
      root.t = new Tree({
        type: 'doc',
        children: [
          {
            type: 'p',
            children: [
              {
                type: 'tn',
                children: [
                  { type: 'text', value: 'a' },
                  { type: 'text', value: 'b' },
                ],
              },
              { type: 'tn', children: [{ type: 'text', value: 'cd' }] },
            ],
          },
        ],
      });
    });

    doc.update((root) => {
      root.t.editByPath([0, 0, 0], [0, 0, 2], { type: 'text', value: 'gh' });
      assert.equal(root.t.toXML(), `<doc><p><tn>gh</tn><tn>cd</tn></p></doc>`);
    });

    // [text(a), text(b)]
    let nodeLengthBeforeGC = getNodeLength(
      doc.getRoot().t.getIndexTree().getRoot(),
    );
    assert.equal(doc.getGarbageLen(), 2);
    assert.equal(doc.garbageCollect(MaxTimeTicket), 2);
    assert.equal(doc.getGarbageLen(), 0);
    let nodeLengthAfterGC = getNodeLength(
      doc.getRoot().t.getIndexTree().getRoot(),
    );
    assert.equal(nodeLengthBeforeGC - nodeLengthAfterGC, 1);

    doc.update((root) => {
      root.t.editByPath([0, 0, 0], [0, 0, 2], { type: 'text', value: 'cv' });
      assert.equal(root.t.toXML(), `<doc><p><tn>cv</tn><tn>cd</tn></p></doc>`);
    });

    // [text(cd)]
    nodeLengthBeforeGC = getNodeLength(
      doc.getRoot().t.getIndexTree().getRoot(),
    );
    assert.equal(doc.getGarbageLen(), 1);
    assert.equal(doc.garbageCollect(MaxTimeTicket), 1);
    assert.equal(doc.getGarbageLen(), 0);
    nodeLengthAfterGC = getNodeLength(doc.getRoot().t.getIndexTree().getRoot());
    assert.equal(nodeLengthBeforeGC - nodeLengthAfterGC, 1);

    doc.update((root) => {
      root.t.editByPath([0], [1], {
        type: 'p',
        children: [{ type: 'tn', children: [{ type: 'text', value: 'ab' }] }],
      });
      assert.equal(root.t.toXML(), `<doc><p><tn>ab</tn></p></doc>`);
    });

    // [p, tn, tn, text(cv), text(cd)]
    nodeLengthBeforeGC = getNodeLength(
      doc.getRoot().t.getIndexTree().getRoot(),
    );
    assert.equal(doc.getGarbageLen(), 5);
    assert.equal(doc.garbageCollect(MaxTimeTicket), 5);
    assert.equal(doc.getGarbageLen(), 0);
    nodeLengthAfterGC = getNodeLength(doc.getRoot().t.getIndexTree().getRoot());
    assert.equal(nodeLengthBeforeGC - nodeLengthAfterGC, 6);
  });

  it('Can handle tree garbage collection for multi client', async function () {
    const docKey = toDocKey(`${this.test!.title}-${new Date().getTime()}`);
    const doc1 = new yorkie.Document<{ t: Tree }>(docKey);
    const doc2 = new yorkie.Document<{ t: Tree }>(docKey);

    const client1 = new yorkie.Client(testRPCAddr);
    const client2 = new yorkie.Client(testRPCAddr);

    await client1.activate();
    await client2.activate();

    await client1.attach(doc1);
    await client2.attach(doc2);

    doc1.update((root) => {
      root.t = new Tree({
        type: 'doc',
        children: [
          {
            type: 'p',
            children: [
              {
                type: 'tn',
                children: [
                  { type: 'text', value: 'a' },
                  { type: 'text', value: 'b' },
                ],
              },
              { type: 'tn', children: [{ type: 'text', value: 'cd' }] },
            ],
          },
        ],
      });
    });

    assert.equal(0, doc1.getGarbageLen());
    assert.equal(0, doc2.getGarbageLen());

    // (0, 0) -> (1, 0): syncedseqs:(0, 0)
    await client1.sync();

    // (1, 0) -> (1, 1): syncedseqs:(0, 0)
    await client2.sync();

    doc2.update((root) => {
      root.t.editByPath([0, 0, 0], [0, 0, 2], { type: 'text', value: 'gh' });
    }, 'removes 2');
    assert.equal(0, doc1.getGarbageLen());
    assert.equal(2, doc2.getGarbageLen());

    // (1, 1) -> (1, 2): syncedseqs:(0, 1)
    await client2.sync();
    assert.equal(0, doc1.getGarbageLen());
    assert.equal(2, doc2.getGarbageLen());

    // (1, 2) -> (2, 2): syncedseqs:(1, 1)
    await client1.sync();
    assert.equal(2, doc1.getGarbageLen());
    assert.equal(2, doc2.getGarbageLen());

    // (2, 2) -> (2, 2): syncedseqs:(1, 2)
    await client2.sync();
    assert.equal(2, doc1.getGarbageLen());
    assert.equal(2, doc2.getGarbageLen());

    // (2, 2) -> (2, 2): syncedseqs:(2, 2): meet GC condition
    await client1.sync();
    assert.equal(0, doc1.getGarbageLen());
    assert.equal(2, doc2.getGarbageLen());

    // (2, 2) -> (2, 2): syncedseqs:(2, 2): meet GC condition
    await client2.sync();
    assert.equal(0, doc1.getGarbageLen());
    assert.equal(0, doc2.getGarbageLen());

    await client1.detach(doc1);
    await client2.detach(doc2);

    await client1.deactivate();
    await client2.deactivate();
  });

  it('Can handle garbage collection for container type', async function () {
    type TestDoc = { 1: number; 2?: Array<number>; 3: number };
    const docKey = toDocKey(`${this.test!.title}-${new Date().getTime()}`);
    const doc1 = new yorkie.Document<TestDoc>(docKey);
    const doc2 = new yorkie.Document<TestDoc>(docKey);

    const client1 = new yorkie.Client(testRPCAddr);
    const client2 = new yorkie.Client(testRPCAddr);

    await client1.activate();
    await client2.activate();

    await client1.attach(doc1);
    await client2.attach(doc2);

    doc1.update((root) => {
      root['1'] = 1;
      root['2'] = [1, 2, 3];
      root['3'] = 3;
    }, 'sets 1, 2, 3');

    assert.equal(0, doc1.getGarbageLen());
    assert.equal(0, doc2.getGarbageLen());

    // (0, 0) -> (1, 0): syncedseqs:(0, 0)
    await client1.sync();

    // (1, 0) -> (1, 1): syncedseqs:(0, 0)
    await client2.sync();

    doc2.update((root) => {
      delete root['2'];
    }, 'removes 2');
    assert.equal(0, doc1.getGarbageLen());
    assert.equal(4, doc2.getGarbageLen());

    // (1, 1) -> (1, 2): syncedseqs:(0, 1)
    await client2.sync();
    assert.equal(0, doc1.getGarbageLen());
    assert.equal(4, doc2.getGarbageLen());

    // (1, 2) -> (2, 2): syncedseqs:(1, 1)
    await client1.sync();
    assert.equal(4, doc1.getGarbageLen());
    assert.equal(4, doc2.getGarbageLen());

    // (2, 2) -> (2, 2): syncedseqs:(1, 2)
    await client2.sync();
    assert.equal(4, doc1.getGarbageLen());
    assert.equal(4, doc2.getGarbageLen());

    // (2, 2) -> (2, 2): syncedseqs:(2, 2): meet GC condition
    await client1.sync();
    assert.equal(0, doc1.getGarbageLen());
    assert.equal(4, doc2.getGarbageLen());

    // (2, 2) -> (2, 2): syncedseqs:(2, 2): meet GC condition
    await client2.sync();
    assert.equal(0, doc1.getGarbageLen());
    assert.equal(0, doc2.getGarbageLen());

    await client1.detach(doc1);
    await client2.detach(doc2);

    await client1.deactivate();
    await client2.deactivate();
  });

  it('Can handle garbage collection for text type', async function () {
    type TestDoc = { text: Text; textWithAttr: Text };
    const docKey = toDocKey(`${this.test!.title}-${new Date().getTime()}`);
    const doc1 = new yorkie.Document<TestDoc>(docKey);
    const doc2 = new yorkie.Document<TestDoc>(docKey);

    const client1 = new yorkie.Client(testRPCAddr);
    const client2 = new yorkie.Client(testRPCAddr);

    await client1.activate();
    await client2.activate();

    await client1.attach(doc1);
    await client2.attach(doc2);

    doc1.update((root) => {
      root.text = new Text();
      root.text.edit(0, 0, 'Hello World');
      root.textWithAttr = new Text();
      root.textWithAttr.edit(0, 0, 'Hello World');
    }, 'sets text');

    assert.equal(0, doc1.getGarbageLen());
    assert.equal(0, doc2.getGarbageLen());

    // (0, 0) -> (1, 0): syncedseqs:(0, 0)
    await client1.sync();

    // (1, 0) -> (1, 1): syncedseqs:(0, 0)
    await client2.sync();

    doc2.update((root) => {
      root.text.edit(0, 1, 'a');
      root.text.edit(1, 2, 'b');
      root.textWithAttr.edit(0, 1, 'a', { b: '1' });
    }, 'edit text type elements');
    assert.equal(0, doc1.getGarbageLen());
    assert.equal(3, doc2.getGarbageLen());

    // (1, 1) -> (1, 2): syncedseqs:(0, 1)
    await client2.sync();
    assert.equal(0, doc1.getGarbageLen());
    assert.equal(3, doc2.getGarbageLen());

    // (1, 2) -> (2, 2): syncedseqs:(1, 1)
    await client1.sync();
    assert.equal(3, doc1.getGarbageLen());
    assert.equal(3, doc2.getGarbageLen());

    // (2, 2) -> (2, 2): syncedseqs:(1, 2)
    await client2.sync();
    assert.equal(3, doc1.getGarbageLen());
    assert.equal(3, doc2.getGarbageLen());

    // (2, 2) -> (2, 2): syncedseqs:(2, 2): meet GC condition
    await client1.sync();
    assert.equal(0, doc1.getGarbageLen());
    assert.equal(3, doc2.getGarbageLen());

    // (2, 2) -> (2, 2): syncedseqs:(2, 2): meet GC condition
    await client2.sync();
    assert.equal(0, doc1.getGarbageLen());
    assert.equal(0, doc2.getGarbageLen());

    await client1.detach(doc1);
    await client2.detach(doc2);

    await client1.deactivate();
    await client2.deactivate();
  });

  it('Can handle garbage collection with detached document test', async function () {
    type TestDoc = {
      1: number;
      2?: Array<number>;
      3: number;
      4: Text;
      5: Text;
    };
    const docKey = toDocKey(`${this.test!.title}-${new Date().getTime()}`);
    const doc1 = new yorkie.Document<TestDoc>(docKey);
    const doc2 = new yorkie.Document<TestDoc>(docKey);

    const client1 = new yorkie.Client(testRPCAddr);
    const client2 = new yorkie.Client(testRPCAddr);

    await client1.activate();
    await client2.activate();

    await client1.attach(doc1);
    await client2.attach(doc2);

    doc1.update((root) => {
      root['1'] = 1;
      root['2'] = [1, 2, 3];
      root['3'] = 3;
      root['4'] = new Text();
      root['4'].edit(0, 0, 'hi');
      root['5'] = new Text();
      root['5'].edit(0, 0, 'hi');
    }, 'sets 1, 2, 3, 4, 5');

    assert.equal(0, doc1.getGarbageLen());
    assert.equal(0, doc2.getGarbageLen());

    // (0, 0) -> (1, 0): syncedseqs:(0, 0)
    await client1.sync();

    // (1, 0) -> (1, 1): syncedseqs:(0, 0)
    await client2.sync();

    doc1.update((root) => {
      delete root['2'];
      root['4'].edit(0, 1, 'h');
      root['5'].edit(0, 1, 'h', { b: '1' });
    }, 'removes 2 and edit text type elements');
    assert.equal(6, doc1.getGarbageLen());
    assert.equal(0, doc2.getGarbageLen());

    // (1, 1) -> (2, 1): syncedseqs:(1, 0)
    await client1.sync();
    assert.equal(6, doc1.getGarbageLen());
    assert.equal(0, doc2.getGarbageLen());

    await client2.detach(doc2);

    // (2, 1) -> (2, 2): syncedseqs:(1, x)
    await client2.sync();
    assert.equal(6, doc1.getGarbageLen());
    assert.equal(6, doc2.getGarbageLen());

    // (2, 2) -> (2, 2): syncedseqs:(2, x): meet GC condition
    await client1.sync();
    assert.equal(0, doc1.getGarbageLen());
    assert.equal(6, doc2.getGarbageLen());

    await client1.detach(doc1);

    await client1.deactivate();
    await client2.deactivate();
  });
});
