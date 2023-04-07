import { assert } from 'chai';
import { InitialTimeTicket as ITT } from '@yorkie-js-sdk/src/document/time/ticket';
import { CRDTTree } from '@yorkie-js-sdk/src/document/crdt/tree';

// NOTE: To see the XML string as highlighted, install es6-string-html plugin in VSCode.
describe('CRDTTree', function () {
  it.only('Can inserts nodes with edit', function () {
    //       0
    // <root> </root>
    const tree = new CRDTTree(ITT);
    assert.equal(tree.getRoot().size, 0);
    assert.equal(tree.toXML(), /*html*/ `<root></root>`);
    let pos = tree.findTreePos(0);
    assert.deepEqual([pos.offset, pos.node], [0, tree.getRoot()]);

    //           1
    // <root> <p> </p> </root>
    tree.edit([0, 0], { id: ITT, type: 'p', children: [], size: 0 }, ITT);
    assert.equal(tree.toXML(), /*html*/ `<root><p></p></root>`);
    assert.equal(tree.getRoot().size, 2);
    pos = tree.findTreePos(1);
    assert.deepEqual([pos.offset, pos.node.type], [0, 'p']);

    //           1
    // <root> <p> h e l l o </p> </root>
    tree.edit([1, 1], { id: ITT, type: 'text', value: 'hello', size: 5 }, ITT);
    assert.equal(tree.toXML(), /*html*/ `<root><p>hello</p></root>`);
    assert.equal(tree.getRoot().size, 7);
    pos = tree.findTreePos(1);
    assert.deepEqual([pos.offset, pos.node.type], [0, 'text']);

    //       0   1 2 3 4 5 6    7   8 9  10 11 12 13    14
    // <root> <p> h e l l o </p> <p> w  o  r  l  d  </p>  </root>
    tree.edit(
      [7, 7],
      {
        id: ITT,
        type: 'p',
        size: 5,
        children: [{ id: ITT, type: 'text', value: 'world', size: 5 }],
      },
      ITT,
    );
    pos = tree.findTreePos(7);
    assert.deepEqual([pos.offset, pos.node.type], [1, 'root']);
    assert.equal(
      tree.toXML(),
      /*html*/ `<root><p>hello</p><p>world</p></root>`,
    );
    assert.equal(tree.getRoot().size, 14);

    //       0   1 2 3 4 5 6    7   8 9  10 11 12 13    14
    // <root> <p> h e l l o </p> <p> w  o  r  l  d  </p>  </root>
    pos = tree.findTreePos(0);
    assert.deepEqual([pos.offset, pos.node.type], [0, 'root']);
    pos = tree.findTreePos(1);
    assert.deepEqual([pos.offset, pos.node.type], [0, 'text']);
    pos = tree.findTreePos(6);
    assert.deepEqual([pos.offset, pos.node.type], [5, 'text']);
    pos = tree.findTreePos(6, false);
    assert.deepEqual([pos.offset, pos.node.type], [1, 'p']);
    pos = tree.findTreePos(7);
    assert.deepEqual([pos.offset, pos.node.type], [1, 'root']);
    pos = tree.findTreePos(8);
    assert.deepEqual([pos.offset, pos.node.type], [0, 'text']);
    pos = tree.findTreePos(13);
    assert.deepEqual([pos.offset, pos.node.type], [5, 'text']);
    pos = tree.findTreePos(14);
    assert.deepEqual([pos.offset, pos.node.type], [2, 'root']);

    //       0   1 2 3 4 5 6 7    8   9 10 11 12 13 14    15
    // <root> <p> h e l l o ! </p> <p> w  o  r  l  d  </p>  </root>
    tree.edit([6, 6], { id: ITT, type: 'text', size: 1, value: '!' }, ITT);
    assert.equal(
      tree.toXML(),
      /*html*/ `<root><p>hello!</p><p>world</p></root>`,
    );
    assert.equal(
      tree.toJSON(),
      JSON.stringify({
        type: 'root',
        children: [
          {
            type: 'p',
            children: [
              { type: 'text', value: 'hello' },
              { type: 'text', value: '!' },
            ],
          },
          { type: 'p', children: [{ type: 'text', value: 'world' }] },
        ],
      }),
    );
    assert.equal(tree.getRoot().size, 15);
  });

  it.only('Can delete nodes with edit', function () {
    // 00. Create a tree with 2 paragraphs.
    //       0   1 2 3    4   5 6 7    8
    // <root> <p> a b </p> <p> c d </p> </root>
    const tree = new CRDTTree(ITT);
    tree.edit([0, 0], { id: ITT, type: 'p', children: [], size: 0 }, ITT);
    tree.edit([1, 1], { id: ITT, type: 'text', value: 'ab', size: 2 }, ITT);
    tree.edit([4, 4], { id: ITT, type: 'p', children: [], size: 0 }, ITT);
    tree.edit([5, 5], { id: ITT, type: 'text', value: 'cd', size: 2 }, ITT);
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p>ab</p><p>cd</p></root>`);

    // 01. delete b from first paragraph
    //       0   1 2    3   4 5 6    7
    // <root> <p> a </p> <p> c d </p> </root>
    // tree.edit([2, 3], null, ITT);
    // assert.deepEqual(tree.toXML(), /*html*/ `<root><p>ab</p><p>cd</p></root>`);
  });
});
