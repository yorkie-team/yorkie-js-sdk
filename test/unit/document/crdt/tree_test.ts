import { assert } from 'chai';
import { InitialTimeTicket as ITT } from '@yorkie-js-sdk/src/document/time/ticket';
import { CRDTTree } from '@yorkie-js-sdk/src/document/crdt/tree';
import {
  IndexTreeNode,
  CRDTInlineNode,
  CRDTBlockNode,
  findCommonAncestor,
} from '@yorkie-js-sdk/src/document/crdt/index_tree';

/**
 * `betweenEqual` is a helper function that checks the nodes between the given
 * indexes.
 */
function betweenEqual(
  tree: CRDTTree,
  from: number,
  to: number,
  expected: Array<string>,
) {
  const nodes: Array<IndexTreeNode> = [];
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
    const tree = new CRDTTree(new CRDTBlockNode(ITT, 'root'), ITT);
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
    assert.deepEqual(
      JSON.stringify(tree.toStructure()),
      JSON.stringify({
        type: 'root',
        children: [
          {
            type: 'p',
            children: [
              { type: 'text', value: 'hello', size: 5, isRemoved: false },
              { type: 'text', value: '!', size: 1, isRemoved: false },
            ],
            size: 6,
            isRemoved: false,
          },
          {
            type: 'p',
            children: [
              { type: 'text', value: 'world', size: 5, isRemoved: false },
            ],
            size: 5,
            isRemoved: false,
          },
        ],
        size: 15,
        isRemoved: false,
      }),
    );
  });

  it('Can traverse nodes between the given indexes', function () {
    // 00. Create a tree with 2 paragraphs.
    //       0   1 2 3    4   5 6 7 8    9   10 11 12   13
    // <root> <p> a b </p> <p> c d e </p> <p>  f  g  </p>  </root>
    const tree = new CRDTTree(new CRDTBlockNode(ITT, 'root'), ITT);
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
    betweenEqual(tree, 2, 11, ['text.b', 'p', 'text.cde', 'p', 'text.fg', 'p']);
    betweenEqual(tree, 2, 6, ['text.b', 'p', 'text.cde', 'p']);
    betweenEqual(tree, 0, 1, ['p']);
    betweenEqual(tree, 3, 4, ['p']);
    betweenEqual(tree, 3, 5, ['p', 'p']);
  });

  it('Can delete inline nodes with edit', function () {
    // 01. Create a tree with 2 paragraphs.
    //       0   1 2 3    4   5 6 7    8
    // <root> <p> a b </p> <p> c d </p> </root>
    const tree = new CRDTTree(new CRDTBlockNode(ITT, 'root'), ITT);
    tree.edit([0, 0], new CRDTBlockNode(ITT, 'p'), ITT);
    tree.edit([1, 1], new CRDTInlineNode(ITT, 'ab'), ITT);
    tree.edit([4, 4], new CRDTBlockNode(ITT, 'p'), ITT);
    tree.edit([5, 5], new CRDTInlineNode(ITT, 'cd'), ITT);
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p>ab</p><p>cd</p></root>`);

    let structure = tree.toStructure();
    assert.equal(structure.size, 8);
    assert.equal(structure.children![0].size, 2);
    assert.equal(structure.children![0].children![0].size, 2);

    // 02. delete b from first paragraph
    //       0   1 2    3   4 5 6    7
    // <root> <p> a </p> <p> c d </p> </root>
    tree.edit([2, 3], undefined, ITT);
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p>a</p><p>cd</p></root>`);

    structure = tree.toStructure();
    assert.equal(structure.size, 7);
    assert.equal(structure.children![0].size, 1);
    assert.equal(structure.children![0].children![0].size, 1);
  });

  it('Can delete nodes between block nodes with edit', function () {
    // 01. Create a tree with 2 paragraphs.
    //       0   1 2 3    4   5 6 7    8
    // <root> <p> a b </p> <p> c d </p> </root>
    const tree = new CRDTTree(new CRDTBlockNode(ITT, 'root'), ITT);
    tree.edit([0, 0], new CRDTBlockNode(ITT, 'p'), ITT);
    tree.edit([1, 1], new CRDTInlineNode(ITT, 'ab'), ITT);
    tree.edit([4, 4], new CRDTBlockNode(ITT, 'p'), ITT);
    tree.edit([5, 5], new CRDTInlineNode(ITT, 'cd'), ITT);
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p>ab</p><p>cd</p></root>`);

    // 02. delete b, c and first paragraph.
    //       0   1 2 3    4
    // <root> <p> a d </p> </root>
    tree.edit([2, 6], undefined, ITT);
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p>ad</p></root>`);
    const structure = tree.toStructure();
    assert.equal(structure.size, 4); // root
    assert.equal(structure.children![0].size, 2); // p
    assert.equal(structure.children![0].children![0].size, 1); // a
    assert.equal(structure.children![0].children![1].size, 1); // d

    // 03. insert a new text node at the start of the first paragraph.
    tree.edit([1, 1], new CRDTInlineNode(ITT, '@'), ITT);
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p>@ad</p></root>`);
  });

  it('Can merge different levels with edit', function () {
    // 01. edit between two block nodes in the same hierarchy.
    //       0   1   2   3 4 5    6    7    8
    // <root> <p> <b> <i> a b </i> </b> </p> </root>
    let tree = new CRDTTree(new CRDTBlockNode(ITT, 'root'), ITT);
    tree.edit([0, 0], new CRDTBlockNode(ITT, 'p'), ITT);
    tree.edit([1, 1], new CRDTBlockNode(ITT, 'b'), ITT);
    tree.edit([2, 2], new CRDTBlockNode(ITT, 'i'), ITT);
    tree.edit([3, 3], new CRDTInlineNode(ITT, 'ab'), ITT);
    assert.deepEqual(
      tree.toXML(),
      /*html*/ `<root><p><b><i>ab</i></b></p></root>`,
    );
    tree.edit([2, 3], undefined, ITT);
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p><b>ab</b></p></root>`);

    // 02. edit between two block nodes in same hierarchy.
    tree = new CRDTTree(new CRDTBlockNode(ITT, 'root'), ITT);
    tree.edit([0, 0], new CRDTBlockNode(ITT, 'p'), ITT);
    tree.edit([1, 1], new CRDTBlockNode(ITT, 'b'), ITT);
    tree.edit([2, 2], new CRDTBlockNode(ITT, 'i'), ITT);
    tree.edit([3, 3], new CRDTInlineNode(ITT, 'ab'), ITT);
    assert.deepEqual(
      tree.toXML(),
      /*html*/ `<root><p><b><i>ab</i></b></p></root>`,
    );
    tree.edit([1, 2], undefined, ITT);
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p><i>ab</i></p></root>`);

    // 03. edit between inline and block node in same hierarchy.
    tree = new CRDTTree(new CRDTBlockNode(ITT, 'root'), ITT);
    tree.edit([0, 0], new CRDTBlockNode(ITT, 'p'), ITT);
    tree.edit([1, 1], new CRDTBlockNode(ITT, 'b'), ITT);
    tree.edit([2, 2], new CRDTBlockNode(ITT, 'i'), ITT);
    tree.edit([3, 3], new CRDTInlineNode(ITT, 'ab'), ITT);
    assert.deepEqual(
      tree.toXML(),
      /*html*/ `<root><p><b><i>ab</i></b></p></root>`,
    );
    tree.edit([2, 4], undefined, ITT);
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p><b>b</b></p></root>`);

    // 04. edit between inline and block node in same hierarchy.
    tree = new CRDTTree(new CRDTBlockNode(ITT, 'root'), ITT);
    tree.edit([0, 0], new CRDTBlockNode(ITT, 'p'), ITT);
    tree.edit([1, 1], new CRDTBlockNode(ITT, 'b'), ITT);
    tree.edit([2, 2], new CRDTBlockNode(ITT, 'i'), ITT);
    tree.edit([3, 3], new CRDTInlineNode(ITT, 'ab'), ITT);
    assert.deepEqual(
      tree.toXML(),
      /*html*/ `<root><p><b><i>ab</i></b></p></root>`,
    );
    tree.edit([1, 3], undefined, ITT);
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p>ab</p></root>`);

    // 05. edit between inline and block node in same hierarchy.
    tree = new CRDTTree(new CRDTBlockNode(ITT, 'root'), ITT);
    tree.edit([0, 0], new CRDTBlockNode(ITT, 'p'), ITT);
    tree.edit([1, 1], new CRDTBlockNode(ITT, 'b'), ITT);
    tree.edit([2, 2], new CRDTBlockNode(ITT, 'i'), ITT);
    tree.edit([3, 3], new CRDTInlineNode(ITT, 'ab'), ITT);
    assert.deepEqual(
      tree.toXML(),
      /*html*/ `<root><p><b><i>ab</i></b></p></root>`,
    );
    tree.edit([1, 4], undefined, ITT);
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p>b</p></root>`);

    // 06. edit between inline and block node in same hierarchy.
    tree = new CRDTTree(new CRDTBlockNode(ITT, 'root'), ITT);
    tree.edit([0, 0], new CRDTBlockNode(ITT, 'p'), ITT);
    tree.edit([1, 1], new CRDTBlockNode(ITT, 'b'), ITT);
    tree.edit([2, 2], new CRDTBlockNode(ITT, 'i'), ITT);
    tree.edit([3, 3], new CRDTInlineNode(ITT, 'ab'), ITT);
    assert.deepEqual(
      tree.toXML(),
      /*html*/ `<root><p><b><i>ab</i></b></p></root>`,
    );
    tree.edit([1, 5], undefined, ITT);
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p></p></root>`);

    // 07. edit between inline and block node in same hierarchy.
    tree = new CRDTTree(new CRDTBlockNode(ITT, 'root'), ITT);
    tree.edit([0, 0], new CRDTBlockNode(ITT, 'p'), ITT);
    tree.edit([1, 1], new CRDTInlineNode(ITT, 'ab'), ITT);
    tree.edit([4, 4], new CRDTBlockNode(ITT, 'p'), ITT);
    tree.edit([5, 5], new CRDTBlockNode(ITT, 'b'), ITT);
    tree.edit([6, 6], new CRDTInlineNode(ITT, 'cd'), ITT);
    tree.edit([10, 10], new CRDTBlockNode(ITT, 'p'), ITT);
    tree.edit([11, 11], new CRDTInlineNode(ITT, 'ef'), ITT);
    assert.deepEqual(
      tree.toXML(),
      /*html*/ `<root><p>ab</p><p><b>cd</b></p><p>ef</p></root>`,
    );
    tree.edit([4, 5], undefined, ITT);
    assert.deepEqual(
      tree.toXML(),
      /*html*/ `<root><p>ab</p><b>cd</b><p>ef</p></root>`,
    );
  });

  it('Can split text nodes', function () {
    // 00. Create a tree with 2 paragraphs.
    //       0   1     6     11
    // <root> <p> hello world  </p> </root>
    const tree = new CRDTTree(new CRDTBlockNode(ITT, 'root'), ITT);
    tree.edit([0, 0], new CRDTBlockNode(ITT, 'p'), ITT);
    tree.edit([1, 1], new CRDTInlineNode(ITT, 'helloworld'), ITT);

    // 01. Split left side of 'helloworld'.
    tree.split(1, 1);
    betweenEqual(tree, 1, 11, ['text.helloworld']);

    // 02. Split right side of 'helloworld'.
    tree.split(11, 1);
    betweenEqual(tree, 1, 11, ['text.helloworld']);

    // 03. Split 'helloworld' into 'hello' and 'world'.
    tree.split(6, 1);
    betweenEqual(tree, 1, 11, ['text.hello', 'text.world']);
  });

  it('Can split block nodes', function () {
    // 01. Split position 1.
    let tree = new CRDTTree(new CRDTBlockNode(ITT, 'root'), ITT);
    tree.edit([0, 0], new CRDTBlockNode(ITT, 'p'), ITT);
    tree.edit([1, 1], new CRDTInlineNode(ITT, 'ab'), ITT);
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p>ab</p></root>`);
    tree.split(1, 2);
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p></p><p>ab</p></root>`);
    assert.equal(tree.getSize(), 6);

    // 02. Split position 2.
    //       0   1 2 3    4
    // <root> <p> a b </p> </root>
    tree = new CRDTTree(new CRDTBlockNode(ITT, 'root'), ITT);
    tree.edit([0, 0], new CRDTBlockNode(ITT, 'p'), ITT);
    tree.edit([1, 1], new CRDTInlineNode(ITT, 'ab'), ITT);
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p>ab</p></root>`);
    tree.split(2, 2);
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p>a</p><p>b</p></root>`);
    assert.equal(tree.getSize(), 6);

    // 03. Split position 3.
    tree = new CRDTTree(new CRDTBlockNode(ITT, 'root'), ITT);
    tree.edit([0, 0], new CRDTBlockNode(ITT, 'p'), ITT);
    tree.edit([1, 1], new CRDTInlineNode(ITT, 'ab'), ITT);
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p>ab</p></root>`);
    tree.split(3, 2);
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p>ab</p><p></p></root>`);
    assert.equal(tree.getSize(), 6);

    // 04. Split position 3.
    tree = new CRDTTree(new CRDTBlockNode(ITT, 'root'), ITT);
    tree.edit([0, 0], new CRDTBlockNode(ITT, 'p'), ITT);
    tree.edit([1, 1], new CRDTInlineNode(ITT, 'ab'), ITT);
    tree.edit([3, 3], new CRDTInlineNode(ITT, 'cd'), ITT);
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p>abcd</p></root>`);
    tree.split(3, 2);
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p>ab</p><p>cd</p></root>`);
    assert.equal(tree.getSize(), 8);

    // 05. Split multiple nodes level 1.
    tree = new CRDTTree(new CRDTBlockNode(ITT, 'root'), ITT);
    tree.edit([0, 0], new CRDTBlockNode(ITT, 'p'), ITT);
    tree.edit([1, 1], new CRDTBlockNode(ITT, 'b'), ITT);
    tree.edit([2, 2], new CRDTInlineNode(ITT, 'ab'), ITT);
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p><b>ab</b></p></root>`);
    tree.split(3, 1);
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p><b>ab</b></p></root>`);
    assert.equal(tree.getSize(), 6);

    // Split multiple nodes level 2.
    tree = new CRDTTree(new CRDTBlockNode(ITT, 'root'), ITT);
    tree.edit([0, 0], new CRDTBlockNode(ITT, 'p'), ITT);
    tree.edit([1, 1], new CRDTBlockNode(ITT, 'b'), ITT);
    tree.edit([2, 2], new CRDTInlineNode(ITT, 'ab'), ITT);
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p><b>ab</b></p></root>`);
    tree.split(3, 2);
    assert.deepEqual(
      tree.toXML(),
      /*html*/ `<root><p><b>a</b><b>b</b></p></root>`,
    );
    assert.equal(tree.getSize(), 8);

    // Split multiple nodes level 3.
    tree = new CRDTTree(new CRDTBlockNode(ITT, 'root'), ITT);
    tree.edit([0, 0], new CRDTBlockNode(ITT, 'p'), ITT);
    tree.edit([1, 1], new CRDTBlockNode(ITT, 'b'), ITT);
    tree.edit([2, 2], new CRDTInlineNode(ITT, 'ab'), ITT);
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p><b>ab</b></p></root>`);
    tree.split(3, 3);
    assert.deepEqual(
      tree.toXML(),
      /*html*/ `<root><p><b>a</b></p><p><b>b</b></p></root>`,
    );
    assert.equal(tree.getSize(), 10);
  });

  it('Can split and merge block nodes', function () {
    const tree = new CRDTTree(new CRDTBlockNode(ITT, 'root'), ITT);
    tree.edit([0, 0], new CRDTBlockNode(ITT, 'p'), ITT);
    tree.edit([1, 1], new CRDTInlineNode(ITT, 'abcd'), ITT);
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p>abcd</p></root>`);
    assert.equal(tree.getSize(), 6);

    //       0   1 2 3    4   5 6 7    8
    // <root> <p> a b </p> <p> c d </p> </root>
    tree.split(3, 2);
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p>ab</p><p>cd</p></root>`);
    assert.equal(tree.getSize(), 8);

    tree.edit([3, 5], undefined, ITT);
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p>abcd</p></root>`);
    assert.equal(tree.getSize(), 6);
  });

  it('Can split and merge different levels', function () {
    // 01. edit between two block nodes in the same hierarchy.
    //       0   1   2   3 4 5    6    7    8
    // <root> <p> <b> <i> a b </i> </b> </p> </root>
    let tree = new CRDTTree(new CRDTBlockNode(ITT, 'root'), ITT);
    tree.edit([0, 0], new CRDTBlockNode(ITT, 'p'), ITT);
    tree.edit([1, 1], new CRDTBlockNode(ITT, 'b'), ITT);
    tree.edit([2, 2], new CRDTBlockNode(ITT, 'i'), ITT);
    tree.edit([3, 3], new CRDTInlineNode(ITT, 'ab'), ITT);
    assert.deepEqual(
      tree.toXML(),
      /*html*/ `<root><p><b><i>ab</i></b></p></root>`,
    );
    tree.edit([2, 3], undefined, ITT);
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p><b>ab</b></p></root>`);

    // 02. edit between two block nodes in same hierarchy.
    tree = new CRDTTree(new CRDTBlockNode(ITT, 'root'), ITT);
    tree.edit([0, 0], new CRDTBlockNode(ITT, 'p'), ITT);
    tree.edit([1, 1], new CRDTBlockNode(ITT, 'b'), ITT);
    tree.edit([2, 2], new CRDTBlockNode(ITT, 'i'), ITT);
    tree.edit([3, 3], new CRDTInlineNode(ITT, 'ab'), ITT);
    assert.deepEqual(
      tree.toXML(),
      /*html*/ `<root><p><b><i>ab</i></b></p></root>`,
    );
    tree.edit([1, 2], undefined, ITT);
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p><i>ab</i></p></root>`);

    // 03. edit between inline and block node in same hierarchy.
    tree = new CRDTTree(new CRDTBlockNode(ITT, 'root'), ITT);
    tree.edit([0, 0], new CRDTBlockNode(ITT, 'p'), ITT);
    tree.edit([1, 1], new CRDTBlockNode(ITT, 'b'), ITT);
    tree.edit([2, 2], new CRDTBlockNode(ITT, 'i'), ITT);
    tree.edit([3, 3], new CRDTInlineNode(ITT, 'ab'), ITT);
    assert.deepEqual(
      tree.toXML(),
      /*html*/ `<root><p><b><i>ab</i></b></p></root>`,
    );
    tree.edit([2, 4], undefined, ITT);
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p><b>b</b></p></root>`);

    // 04. edit between inline and block node in same hierarchy.
    tree = new CRDTTree(new CRDTBlockNode(ITT, 'root'), ITT);
    tree.edit([0, 0], new CRDTBlockNode(ITT, 'p'), ITT);
    tree.edit([1, 1], new CRDTBlockNode(ITT, 'b'), ITT);
    tree.edit([2, 2], new CRDTBlockNode(ITT, 'i'), ITT);
    tree.edit([3, 3], new CRDTInlineNode(ITT, 'ab'), ITT);
    assert.deepEqual(
      tree.toXML(),
      /*html*/ `<root><p><b><i>ab</i></b></p></root>`,
    );
    tree.edit([1, 3], undefined, ITT);
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p>ab</p></root>`);

    // 05. edit between inline and block node in same hierarchy.
    tree = new CRDTTree(new CRDTBlockNode(ITT, 'root'), ITT);
    tree.edit([0, 0], new CRDTBlockNode(ITT, 'p'), ITT);
    tree.edit([1, 1], new CRDTBlockNode(ITT, 'b'), ITT);
    tree.edit([2, 2], new CRDTBlockNode(ITT, 'i'), ITT);
    tree.edit([3, 3], new CRDTInlineNode(ITT, 'ab'), ITT);
    assert.deepEqual(
      tree.toXML(),
      /*html*/ `<root><p><b><i>ab</i></b></p></root>`,
    );
    tree.edit([1, 4], undefined, ITT);
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p>b</p></root>`);

    // 06. edit between inline and block node in same hierarchy.
    tree = new CRDTTree(new CRDTBlockNode(ITT, 'root'), ITT);
    tree.edit([0, 0], new CRDTBlockNode(ITT, 'p'), ITT);
    tree.edit([1, 1], new CRDTBlockNode(ITT, 'b'), ITT);
    tree.edit([2, 2], new CRDTBlockNode(ITT, 'i'), ITT);
    tree.edit([3, 3], new CRDTInlineNode(ITT, 'ab'), ITT);
    assert.deepEqual(
      tree.toXML(),
      /*html*/ `<root><p><b><i>ab</i></b></p></root>`,
    );
    tree.edit([1, 5], undefined, ITT);
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p></p></root>`);

    // 07. edit between inline and block node in same hierarchy.
    tree = new CRDTTree(new CRDTBlockNode(ITT, 'root'), ITT);
    tree.edit([0, 0], new CRDTBlockNode(ITT, 'p'), ITT);
    tree.edit([1, 1], new CRDTInlineNode(ITT, 'ab'), ITT);
    tree.edit([4, 4], new CRDTBlockNode(ITT, 'p'), ITT);
    tree.edit([5, 5], new CRDTBlockNode(ITT, 'b'), ITT);
    tree.edit([6, 6], new CRDTInlineNode(ITT, 'cd'), ITT);
    tree.edit([10, 10], new CRDTBlockNode(ITT, 'p'), ITT);
    tree.edit([11, 11], new CRDTInlineNode(ITT, 'ef'), ITT);
    assert.deepEqual(
      tree.toXML(),
      /*html*/ `<root><p>ab</p><p><b>cd</b></p><p>ef</p></root>`,
    );
    tree.edit([4, 5], undefined, ITT);
    assert.deepEqual(
      tree.toXML(),
      /*html*/ `<root><p>ab</p><b>cd</b><p>ef</p></root>`,
    );
  });

  it('Can find common ancestor of two given nodes', function () {
    const tree = new CRDTTree(new CRDTBlockNode(ITT, 'root'), ITT);
    tree.edit([0, 0], new CRDTBlockNode(ITT, 'p'), ITT);
    tree.edit([1, 1], new CRDTBlockNode(ITT, 'b'), ITT);
    tree.edit([2, 2], new CRDTInlineNode(ITT, 'ab'), ITT);
    tree.edit([5, 5], new CRDTBlockNode(ITT, 'b'), ITT);
    tree.edit([6, 6], new CRDTInlineNode(ITT, 'cd'), ITT);

    assert.deepEqual(
      tree.toXML(),
      /*html*/ `<root><p><b>ab</b><b>cd</b></p></root>`,
    );

    const ancestor = findCommonAncestor(
      tree.findTreePos(3, true).node,
      tree.findTreePos(7, true).node,
    );
    assert.equal(ancestor!.type, 'p');
  });
});
