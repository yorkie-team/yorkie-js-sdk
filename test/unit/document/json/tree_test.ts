import { assert } from 'chai';
import { InitialTimeTicket as ITT } from '@yorkie-js-sdk/src/document/time/ticket';
import {
  CRDTTree,
  CRDTNode,
  CRDTInlineNode,
  CRDTBlockNode,
} from '@yorkie-js-sdk/src/document/crdt/tree';

function betweenEqual(
  tree: CRDTTree,
  from: number,
  to: number,
  expected: Array<string>,
) {
  const nodes: Array<CRDTNode> = [];
  tree.nodesBetween(from, to, (node) => {
    nodes.push(node);
    return true;
  });
  assert.deepEqual(
    nodes.map((node) => {
      if (node.isInline) {
        return `${node.type}.${(node as CRDTInlineNode).value}`;
      }
      return node.type;
    }),
    expected,
  );
}

// NOTE: To see the XML string as highlighted, install es6-string-html plugin in VSCode.
describe('CRDTTree', function () {
  it('Can inserts nodes with edit', function () {
    //       0
    // <root> </root>
    const tree = new CRDTTree(ITT);
    assert.equal(tree.getRoot().size, 0);
    assert.equal(tree.toXML(), /*html*/ `<root></root>`);
    let pos = tree.findTreePos(0);
    assert.deepEqual([pos.offset, pos.node], [0, tree.getRoot()]);

    //           1
    // <root> <p> </p> </root>
    tree.edit([0, 0], new CRDTBlockNode(ITT, 'p'), ITT);
    assert.equal(tree.toXML(), /*html*/ `<root><p></p></root>`);
    assert.equal(tree.getRoot().size, 2);
    pos = tree.findTreePos(1);
    assert.deepEqual([pos.offset, pos.node.type], [0, 'p']);

    //           1
    // <root> <p> h e l l o </p> </root>
    tree.edit([1, 1], new CRDTInlineNode(ITT, 'hello'), ITT);
    assert.equal(tree.toXML(), /*html*/ `<root><p>hello</p></root>`);
    assert.equal(tree.getRoot().size, 7);
    pos = tree.findTreePos(1);
    assert.deepEqual([pos.offset, pos.node.type], [0, 'text']);

    //       0   1 2 3 4 5 6    7   8 9  10 11 12 13    14
    // <root> <p> h e l l o </p> <p> w  o  r  l  d  </p>  </root>
    tree.edit(
      [7, 7],
      new CRDTBlockNode(ITT, 'p', [new CRDTInlineNode(ITT, 'world')]),
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
    tree.edit([6, 6], new CRDTInlineNode(ITT, '!'), ITT);
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

  it('Can split text nodes', function () {
    // 00. Create a tree with 2 paragraphs.
    //       0   1     6     11
    // <root> <p> hello world  </p> </root>
    const tree = new CRDTTree(ITT);
    tree.edit([0, 0], new CRDTBlockNode(ITT, 'p'), ITT);
    tree.edit([1, 1], new CRDTInlineNode(ITT, 'helloworld'), ITT);

    // 01. Split left side of 'helloworld'.
    tree.splitNode(1);
    betweenEqual(tree, 1, 11, ['p', 'text.helloworld']);

    // 02. Split right side of 'helloworld'.
    tree.splitNode(11);
    betweenEqual(tree, 1, 11, ['p', 'text.helloworld']);

    // 03. Split 'helloworld' into 'hello' and 'world'.
    tree.splitNode(6);
    betweenEqual(tree, 1, 11, ['p', 'text.hello', 'text.world']);
  });

  it('Can traverse nodes between two positions', function () {
    // 00. Create a tree with 2 paragraphs.
    //       0   1 2 3    4   5 6 7 8    9   10 11 12   13
    // <root> <p> a b </p> <p> c d e </p> <p>  f  g  </p>  </root>
    const tree = new CRDTTree(ITT);
    tree.edit([0, 0], new CRDTBlockNode(ITT, 'p'), ITT);
    tree.edit([1, 1], new CRDTInlineNode(ITT, 'a'), ITT);
    tree.edit([2, 2], new CRDTInlineNode(ITT, 'b'), ITT);
    tree.edit([4, 4], new CRDTBlockNode(ITT, 'p'), ITT);
    tree.edit([5, 5], new CRDTInlineNode(ITT, 'cde'), ITT);
    tree.edit([9, 9], new CRDTBlockNode(ITT, 'p'), ITT);
    tree.edit([10, 10], new CRDTInlineNode(ITT, 'fg'), ITT);

    assert.deepEqual(
      tree.toXML(),
      /*html*/ `<root><p>ab</p><p>cde</p><p>fg</p></root>`,
    );
    betweenEqual(tree, 2, 11, ['p', 'text.b', 'p', 'text.cde', 'p', 'text.fg']);
    betweenEqual(tree, 2, 6, ['p', 'text.b', 'p', 'text.cde']);
  });

  it('Can delete nodes with edit', function () {
    // 00. Create a tree with 2 paragraphs.
    //       0   1 2 3    4   5 6 7    8
    // <root> <p> a b </p> <p> c d </p> </root>
    const tree = new CRDTTree(ITT);
    tree.edit([0, 0], new CRDTBlockNode(ITT, 'p'), ITT);
    tree.edit([1, 1], new CRDTInlineNode(ITT, 'ab'), ITT);
    tree.edit([4, 4], new CRDTBlockNode(ITT, 'p'), ITT);
    tree.edit([5, 5], new CRDTInlineNode(ITT, 'cd'), ITT);
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p>ab</p><p>cd</p></root>`);

    // 01. delete b from first paragraph
    //       0   1 2    3   4 5 6    7
    // <root> <p> a </p> <p> c d </p> </root>
    tree.edit([2, 3], undefined, ITT);
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p>a</p><p>cd</p></root>`);
  });
});
