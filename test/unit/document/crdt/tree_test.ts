/*
 * Copyright 2023 The Yorkie Authors. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { describe, it, assert } from 'vitest';
import { ElementRHT } from '@yorkie-js-sdk/src/document/crdt/element_rht';
import { CRDTObject } from '@yorkie-js-sdk/src/document/crdt/object';
import {
  InitialTimeTicket as ITT,
  TimeTicket,
} from '@yorkie-js-sdk/src/document/time/ticket';
import { CRDTRoot } from '@yorkie-js-sdk/src/document/crdt/root';
import { InitialChangeID } from '@yorkie-js-sdk/src/document/change/change_id';
import { ChangeContext } from '@yorkie-js-sdk/src/document/change/context';
import {
  CRDTTree,
  CRDTTreeNode,
  CRDTTreeNodeID,
  CRDTTreePos,
  toXML,
} from '@yorkie-js-sdk/src/document/crdt/tree';

/**
 * `DTP` is a dummy CRDTTreeNodeID for testing.
 */
const DTP = CRDTTreeNodeID.of(ITT, 0);

/**
 * `dummyContext` is a helper context that is used for testing.
 */
const dummyContext = ChangeContext.create(
  InitialChangeID,
  new CRDTRoot(new CRDTObject(ITT, ElementRHT.create())),
  {},
);

/**
 * `issuePos` is a helper function that issues a new CRDTTreeNodeID.
 */
function issuePos(offset = 0): CRDTTreeNodeID {
  return CRDTTreeNodeID.of(dummyContext.issueTimeTicket(), offset);
}

/**
 * `issueTime` is a helper function that issues a new TimeTicket.
 */
function issueTime(): TimeTicket {
  return dummyContext.issueTimeTicket();
}

describe('CRDTTreeNode', function () {
  it('Can be created', function () {
    const node = new CRDTTreeNode(DTP, 'text', 'hello');
    assert.equal(node.id, DTP);
    assert.equal(node.type, 'text');
    assert.equal(node.value, 'hello');
    assert.equal(node.size, 5);
    assert.equal(node.isText, true);
    assert.equal(node.isRemoved, false);
  });

  it('Can be split', function () {
    const para = new CRDTTreeNode(DTP, 'p', []);
    para.append(new CRDTTreeNode(DTP, 'text', 'helloyorkie'));
    assert.equal(toXML(para), /*html*/ `<p>helloyorkie</p>`);
    assert.equal(para.size, 11);
    assert.equal(para.isText, false);

    const left = para.children[0];
    const right = left.split(5, 0);
    assert.equal(toXML(para), /*html*/ `<p>helloyorkie</p>`);
    assert.equal(para.size, 11);

    assert.equal(left.value, 'hello');
    assert.equal(right!.value, 'yorkie');
    assert.deepEqual(left.id, CRDTTreeNodeID.of(ITT, 0));
    assert.deepEqual(right!.id, CRDTTreeNodeID.of(ITT, 5));
  });
});

// NOTE: To see the XML string as highlighted, install es6-string-html plugin in VSCode.
describe('CRDTTree', function () {
  it('Can inserts nodes with edit', function () {
    //       0
    // <root> </root>
    const tree = new CRDTTree(new CRDTTreeNode(issuePos(), 'r'), issueTime());
    assert.equal(tree.getRoot().size, 0);
    assert.equal(tree.toXML(), /*html*/ `<r></r>`);

    //           1
    // <root> <p> </p> </root>
    tree.editByIndex([0, 0], [new CRDTTreeNode(issuePos(), 'p')], issueTime());
    assert.equal(tree.toXML(), /*html*/ `<r><p></p></r>`);
    assert.equal(tree.getRoot().size, 2);

    //           1
    // <root> <p> h e l l o </p> </root>
    tree.editByIndex(
      [1, 1],
      [new CRDTTreeNode(issuePos(), 'text', 'hello')],
      issueTime(),
    );
    assert.equal(tree.toXML(), /*html*/ `<r><p>hello</p></r>`);
    assert.equal(tree.getRoot().size, 7);

    //       0   1 2 3 4 5 6    7   8 9  10 11 12 13    14
    // <root> <p> h e l l o </p> <p> w  o  r  l  d  </p>  </root>
    const p = new CRDTTreeNode(issuePos(), 'p', []);
    p.insertAt(new CRDTTreeNode(issuePos(), 'text', 'world'), 0);
    tree.editByIndex([7, 7], [p], issueTime());
    assert.equal(tree.toXML(), /*html*/ `<r><p>hello</p><p>world</p></r>`);
    assert.equal(tree.getRoot().size, 14);

    //       0   1 2 3 4 5 6 7    8   9 10 11 12 13 14    15
    // <root> <p> h e l l o ! </p> <p> w  o  r  l  d  </p>  </root>
    tree.editByIndex(
      [6, 6],
      [new CRDTTreeNode(issuePos(), 'text', '!')],
      issueTime(),
    );
    assert.equal(tree.toXML(), /*html*/ `<r><p>hello!</p><p>world</p></r>`);

    assert.deepEqual(
      JSON.stringify(tree.toTestTreeNode()),
      JSON.stringify({
        type: 'r',
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

    //       0   1 2 3 4 5 6 7 8    9   10 11 12 13 14 15    16
    // <root> <p> h e l l o ~ ! </p> <p>  w  o  r  l  d  </p>  </root>
    tree.editByIndex(
      [6, 6],
      [new CRDTTreeNode(issuePos(), 'text', '~')],
      issueTime(),
    );
    assert.equal(tree.toXML(), /*html*/ `<r><p>hello~!</p><p>world</p></r>`);
  });

  it('Can delete text nodes with edit', function () {
    // 01. Create a tree with 2 paragraphs.
    //       0   1 2 3    4   5 6 7    8
    // <root> <p> a b </p> <p> c d </p> </root>
    const tree = new CRDTTree(
      new CRDTTreeNode(issuePos(), 'root'),
      issueTime(),
    );
    tree.editByIndex([0, 0], [new CRDTTreeNode(issuePos(), 'p')], issueTime());
    tree.editByIndex(
      [1, 1],
      [new CRDTTreeNode(issuePos(), 'text', 'ab')],
      issueTime(),
    );
    tree.editByIndex([4, 4], [new CRDTTreeNode(issuePos(), 'p')], issueTime());
    tree.editByIndex(
      [5, 5],
      [new CRDTTreeNode(issuePos(), 'text', 'cd')],
      issueTime(),
    );
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p>ab</p><p>cd</p></root>`);

    let treeNode = tree.toTestTreeNode();
    assert.equal(treeNode.size, 8);
    assert.equal(treeNode.children![0].size, 2);
    assert.equal(treeNode.children![0].children![0].size, 2);

    // 02. delete b from first paragraph
    //       0   1 2    3   4 5 6    7
    // <root> <p> a </p> <p> c d </p> </root>
    tree.editByIndex([2, 3], undefined, issueTime());
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p>a</p><p>cd</p></root>`);

    treeNode = tree.toTestTreeNode();
    assert.equal(treeNode.size, 7);
    assert.equal(treeNode.children![0].size, 1);
    assert.equal(treeNode.children![0].children![0].size, 1);
  });

  it('Can find the closest TreePos when parentNode or leftSiblingNode does not exist', function () {
    const tree = new CRDTTree(
      new CRDTTreeNode(issuePos(), 'root'),
      issueTime(),
    );

    const pNode = new CRDTTreeNode(issuePos(), 'p');
    const textNode = new CRDTTreeNode(issuePos(), 'text', 'ab');

    //       0   1 2 3    4
    // <root> <p> a b </p> </root>
    tree.editByIndex([0, 0], [pNode], issueTime());
    tree.editByIndex([1, 1], [textNode], issueTime());
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p>ab</p></root>`);

    // Find the closest index.TreePos when leftSiblingNode in crdt.TreePos is removed.
    //       0   1    2
    // <root> <p> </p> </root>
    tree.editByIndex([1, 3], undefined, issueTime());
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p></p></root>`);

    let [parent, left] = tree.findNodesAndSplitText(
      new CRDTTreePos(pNode.id, textNode.id),
      issueTime(),
    );
    assert.equal(tree.toIndex(parent, left), 1);

    // Find the closest index.TreePos when parentNode in crdt.TreePos is removed.
    //       0
    // <root> </root>
    tree.editByIndex([0, 2], undefined, issueTime());
    assert.deepEqual(tree.toXML(), /*html*/ `<root></root>`);

    [parent, left] = tree.findNodesAndSplitText(
      new CRDTTreePos(pNode.id, textNode.id),
      issueTime(),
    );
    assert.equal(tree.toIndex(parent, left), 0);
  });
});

describe.skip('Tree.split', function () {
  it('Can split text nodes', function () {
    // 00. Create a tree with 2 paragraphs.
    //       0   1     6     11
    // <root> <p> hello world  </p> </root>
    const tree = new CRDTTree(
      new CRDTTreeNode(issuePos(), 'root'),
      issueTime(),
    );
    tree.editByIndex([0, 0], [new CRDTTreeNode(issuePos(), 'p')], issueTime());
    tree.editByIndex(
      [1, 1],
      [new CRDTTreeNode(issuePos(), 'text', 'helloworld')],
      issueTime(),
    );

    // 01. Split left side of 'helloworld'.
    tree.split(1, 1);
    // TODO(JOOHOJANG): make new helper function when implement Tree.split
    //betweenEqual(tree, 1, 11, ['text.helloworld']);

    // 02. Split right side of 'helloworld'.
    tree.split(11, 1);
    // TODO(JOOHOJANG): make new helper function when implement Tree.split
    //betweenEqual(tree, 1, 11, ['text.helloworld']);

    // 03. Split 'helloworld' into 'hello' and 'world'.
    tree.split(6, 1);
    // TODO(JOOHOJANG): make new helper function when implement Tree.split
    //betweenEqual(tree, 1, 11, ['text.hello', 'text.world']);
  });

  it('Can split element nodes', function () {
    // 01. Split position 1.
    let tree = new CRDTTree(new CRDTTreeNode(issuePos(), 'root'), issueTime());
    tree.editByIndex([0, 0], [new CRDTTreeNode(issuePos(), 'p')], issueTime());
    tree.editByIndex(
      [1, 1],
      [new CRDTTreeNode(issuePos(), 'text', 'ab')],
      issueTime(),
    );
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p>ab</p></root>`);
    tree.split(1, 2);
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p></p><p>ab</p></root>`);
    assert.equal(tree.getSize(), 6);

    // 02. Split position 2.
    //       0   1 2 3    4
    // <root> <p> a b </p> </root>
    tree = new CRDTTree(new CRDTTreeNode(issuePos(), 'root'), issueTime());
    tree.editByIndex([0, 0], [new CRDTTreeNode(issuePos(), 'p')], issueTime());
    tree.editByIndex(
      [1, 1],
      [new CRDTTreeNode(issuePos(), 'text', 'ab')],
      issueTime(),
    );
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p>ab</p></root>`);
    tree.split(2, 2);
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p>a</p><p>b</p></root>`);
    assert.equal(tree.getSize(), 6);

    // 03. Split position 3.
    tree = new CRDTTree(new CRDTTreeNode(issuePos(), 'root'), issueTime());
    tree.editByIndex([0, 0], [new CRDTTreeNode(issuePos(), 'p')], issueTime());
    tree.editByIndex(
      [1, 1],
      [new CRDTTreeNode(issuePos(), 'text', 'ab')],
      issueTime(),
    );
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p>ab</p></root>`);
    tree.split(3, 2);
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p>ab</p><p></p></root>`);
    assert.equal(tree.getSize(), 6);

    // 04. Split position 3.
    tree = new CRDTTree(new CRDTTreeNode(issuePos(), 'root'), issueTime());
    tree.editByIndex([0, 0], [new CRDTTreeNode(issuePos(), 'p')], issueTime());
    tree.editByIndex(
      [1, 1],
      [new CRDTTreeNode(issuePos(), 'text', 'ab')],
      issueTime(),
    );
    tree.editByIndex(
      [3, 3],
      [new CRDTTreeNode(issuePos(), 'text', 'cd')],
      issueTime(),
    );
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p>abcd</p></root>`);
    tree.split(3, 2);
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p>ab</p><p>cd</p></root>`);
    assert.equal(tree.getSize(), 8);

    // 05. Split multiple nodes level 1.
    tree = new CRDTTree(new CRDTTreeNode(issuePos(), 'root'), issueTime());
    tree.editByIndex([0, 0], [new CRDTTreeNode(issuePos(), 'p')], issueTime());
    tree.editByIndex([1, 1], [new CRDTTreeNode(issuePos(), 'b')], issueTime());
    tree.editByIndex(
      [2, 2],
      [new CRDTTreeNode(issuePos(), 'text', 'ab')],
      issueTime(),
    );
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p><b>ab</b></p></root>`);
    tree.split(3, 1);
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p><b>ab</b></p></root>`);
    assert.equal(tree.getSize(), 6);

    // Split multiple nodes level 2.
    tree = new CRDTTree(new CRDTTreeNode(issuePos(), 'root'), issueTime());
    tree.editByIndex([0, 0], [new CRDTTreeNode(issuePos(), 'p')], issueTime());
    tree.editByIndex([1, 1], [new CRDTTreeNode(issuePos(), 'b')], issueTime());
    tree.editByIndex(
      [2, 2],
      [new CRDTTreeNode(issuePos(), 'text', 'ab')],
      issueTime(),
    );
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p><b>ab</b></p></root>`);
    tree.split(3, 2);
    assert.deepEqual(
      tree.toXML(),
      /*html*/ `<root><p><b>a</b><b>b</b></p></root>`,
    );
    assert.equal(tree.getSize(), 8);

    // Split multiple nodes level 3.
    tree = new CRDTTree(new CRDTTreeNode(issuePos(), 'root'), issueTime());
    tree.editByIndex([0, 0], [new CRDTTreeNode(issuePos(), 'p')], issueTime());
    tree.editByIndex([1, 1], [new CRDTTreeNode(issuePos(), 'b')], issueTime());
    tree.editByIndex(
      [2, 2],
      [new CRDTTreeNode(issuePos(), 'text', 'ab')],
      issueTime(),
    );
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p><b>ab</b></p></root>`);
    tree.split(3, 3);
    assert.deepEqual(
      tree.toXML(),
      /*html*/ `<root><p><b>a</b></p><p><b>b</b></p></root>`,
    );
    assert.equal(tree.getSize(), 10);
  });

  it('Can split and merge element nodes by edit', function () {
    const tree = new CRDTTree(
      new CRDTTreeNode(issuePos(), 'root'),
      issueTime(),
    );
    tree.editByIndex([0, 0], [new CRDTTreeNode(issuePos(), 'p')], issueTime());
    tree.editByIndex(
      [1, 1],
      [new CRDTTreeNode(issuePos(), 'text', 'abcd')],
      issueTime(),
    );
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p>abcd</p></root>`);
    assert.equal(tree.getSize(), 6);

    //       0   1 2 3    4   5 6 7    8
    // <root> <p> a b </p> <p> c d </p> </root>
    tree.split(3, 2);
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p>ab</p><p>cd</p></root>`);
    assert.equal(tree.getSize(), 8);

    tree.editByIndex([3, 5], undefined, issueTime());
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p>abcd</p></root>`);
    assert.equal(tree.getSize(), 6);
  });
});

describe('Tree.move', function () {
  it('Can delete nodes between element nodes with edit', function () {
    // 01. Create a tree with 2 paragraphs.
    //       0   1 2 3    4   5 6 7    8
    // <root> <p> a b </p> <p> c d </p> </root>
    const tree = new CRDTTree(
      new CRDTTreeNode(issuePos(), 'root'),
      issueTime(),
    );
    tree.editByIndex([0, 0], [new CRDTTreeNode(issuePos(), 'p')], issueTime());
    tree.editByIndex(
      [1, 1],
      [new CRDTTreeNode(issuePos(), 'text', 'ab')],
      issueTime(),
    );
    tree.editByIndex([4, 4], [new CRDTTreeNode(issuePos(), 'p')], issueTime());
    tree.editByIndex(
      [5, 5],
      [new CRDTTreeNode(issuePos(), 'text', 'cd')],
      issueTime(),
    );
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p>ab</p><p>cd</p></root>`);

    // 02. delete b, c and first paragraph.
    //       0   1 2 3    4
    // <root> <p> a d </p> </root>
    tree.editByIndex([2, 6], undefined, issueTime());
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p>a</p><p>d</p></root>`);
    // TODO(sejongk): Use the below assertion after implementing Tree.Move.
    // assert.deepEqual(tree.toXML(), /*html*/ `<root><p>ad</p></root>`);

    // const treeNode = tree.toTestTreeNode();
    // assert.equal(treeNode.size, 4); // root
    // assert.equal(treeNode.children![0].size, 2); // p
    // assert.equal(treeNode.children![0].children![0].size, 1); // a
    // assert.equal(treeNode.children![0].children![1].size, 1); // d

    // // 03. insert a new text node at the start of the first paragraph.
    // tree.editByIndex(
    //   [1, 1],
    //   [new CRDTTreeNode(issuePos(), 'text', '@')],
    //   issueTime(),
    // );
    // assert.deepEqual(tree.toXML(), /*html*/ `<root><p>@ad</p></root>`);
  });

  it.skip('Can merge different levels with edit', function () {
    // 01. edit between two element nodes in the same hierarchy.
    //       0   1   2   3 4 5    6    7    8
    // <root> <p> <b> <i> a b </i> </b> </p> </root>
    let tree = new CRDTTree(new CRDTTreeNode(issuePos(), 'root'), issueTime());
    tree.editByIndex([0, 0], [new CRDTTreeNode(issuePos(), 'p')], issueTime());
    tree.editByIndex([1, 1], [new CRDTTreeNode(issuePos(), 'b')], issueTime());
    tree.editByIndex([2, 2], [new CRDTTreeNode(issuePos(), 'i')], issueTime());
    tree.editByIndex(
      [3, 3],
      [new CRDTTreeNode(issuePos(), 'text', 'ab')],
      issueTime(),
    );
    assert.deepEqual(
      tree.toXML(),
      /*html*/ `<root><p><b><i>ab</i></b></p></root>`,
    );
    tree.editByIndex([5, 6], undefined, issueTime());
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p><b>ab</b></p></root>`);

    // 02. edit between two element nodes in same hierarchy.
    tree = new CRDTTree(new CRDTTreeNode(issuePos(), 'root'), issueTime());
    tree.editByIndex([0, 0], [new CRDTTreeNode(issuePos(), 'p')], issueTime());
    tree.editByIndex([1, 1], [new CRDTTreeNode(issuePos(), 'b')], issueTime());
    tree.editByIndex([2, 2], [new CRDTTreeNode(issuePos(), 'i')], issueTime());
    tree.editByIndex(
      [3, 3],
      [new CRDTTreeNode(issuePos(), 'text', 'ab')],
      issueTime(),
    );
    assert.deepEqual(
      tree.toXML(),
      /*html*/ `<root><p><b><i>ab</i></b></p></root>`,
    );
    tree.editByIndex([6, 7], undefined, issueTime());
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p><i>ab</i></p></root>`);

    // 03. edit between text and element node in same hierarchy.
    tree = new CRDTTree(new CRDTTreeNode(issuePos(), 'root'), issueTime());
    tree.editByIndex([0, 0], [new CRDTTreeNode(issuePos(), 'p')], issueTime());
    tree.editByIndex([1, 1], [new CRDTTreeNode(issuePos(), 'b')], issueTime());
    tree.editByIndex([2, 2], [new CRDTTreeNode(issuePos(), 'i')], issueTime());
    tree.editByIndex(
      [3, 3],
      [new CRDTTreeNode(issuePos(), 'text', 'ab')],
      issueTime(),
    );
    assert.deepEqual(
      tree.toXML(),
      /*html*/ `<root><p><b><i>ab</i></b></p></root>`,
    );
    tree.editByIndex([4, 6], undefined, issueTime());
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p><b>a</b></p></root>`);

    // 04. edit between text and element node in same hierarchy.
    tree = new CRDTTree(new CRDTTreeNode(issuePos(), 'root'), issueTime());
    tree.editByIndex([0, 0], [new CRDTTreeNode(issuePos(), 'p')], issueTime());
    tree.editByIndex([1, 1], [new CRDTTreeNode(issuePos(), 'b')], issueTime());
    tree.editByIndex([2, 2], [new CRDTTreeNode(issuePos(), 'i')], issueTime());
    tree.editByIndex(
      [3, 3],
      [new CRDTTreeNode(issuePos(), 'text', 'ab')],
      issueTime(),
    );
    assert.deepEqual(
      tree.toXML(),
      /*html*/ `<root><p><b><i>ab</i></b></p></root>`,
    );
    tree.editByIndex([5, 7], undefined, issueTime());
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p>ab</p></root>`);

    // 05. edit between text and element node in same hierarchy.
    tree = new CRDTTree(new CRDTTreeNode(issuePos(), 'root'), issueTime());
    tree.editByIndex([0, 0], [new CRDTTreeNode(issuePos(), 'p')], issueTime());
    tree.editByIndex([1, 1], [new CRDTTreeNode(issuePos(), 'b')], issueTime());
    tree.editByIndex([2, 2], [new CRDTTreeNode(issuePos(), 'i')], issueTime());
    tree.editByIndex(
      [3, 3],
      [new CRDTTreeNode(issuePos(), 'text', 'ab')],
      issueTime(),
    );
    assert.deepEqual(
      tree.toXML(),
      /*html*/ `<root><p><b><i>ab</i></b></p></root>`,
    );
    tree.editByIndex([4, 7], undefined, issueTime());
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p>a</p></root>`);

    // 06. edit between text and element node in same hierarchy.
    tree = new CRDTTree(new CRDTTreeNode(issuePos(), 'root'), issueTime());
    tree.editByIndex([0, 0], [new CRDTTreeNode(issuePos(), 'p')], issueTime());
    tree.editByIndex([1, 1], [new CRDTTreeNode(issuePos(), 'b')], issueTime());
    tree.editByIndex([2, 2], [new CRDTTreeNode(issuePos(), 'i')], issueTime());
    tree.editByIndex(
      [3, 3],
      [new CRDTTreeNode(issuePos(), 'text', 'ab')],
      issueTime(),
    );
    assert.deepEqual(
      tree.toXML(),
      /*html*/ `<root><p><b><i>ab</i></b></p></root>`,
    );
    tree.editByIndex([3, 7], undefined, issueTime());
    assert.deepEqual(tree.toXML(), /*html*/ `<root><p></p></root>`);

    // 07. edit between text and element node in same hierarchy.
    tree = new CRDTTree(new CRDTTreeNode(issuePos(), 'root'), issueTime());
    tree.editByIndex([0, 0], [new CRDTTreeNode(issuePos(), 'p')], issueTime());
    tree.editByIndex(
      [1, 1],
      [new CRDTTreeNode(issuePos(), 'text', 'ab')],
      issueTime(),
    );
    tree.editByIndex([4, 4], [new CRDTTreeNode(issuePos(), 'p')], issueTime());
    tree.editByIndex([5, 5], [new CRDTTreeNode(issuePos(), 'b')], issueTime());
    tree.editByIndex(
      [6, 6],
      [new CRDTTreeNode(issuePos(), 'text', 'cd')],
      issueTime(),
    );
    tree.editByIndex(
      [10, 10],
      [new CRDTTreeNode(issuePos(), 'p')],
      issueTime(),
    );
    tree.editByIndex(
      [11, 11],
      [new CRDTTreeNode(issuePos(), 'text', 'ef')],
      issueTime(),
    );
    assert.deepEqual(
      tree.toXML(),
      /*html*/ `<root><p>ab</p><p><b>cd</b></p><p>ef</p></root>`,
    );
    tree.editByIndex([9, 10], undefined, issueTime());
    assert.deepEqual(
      tree.toXML(),
      /*html*/ `<root><p>ab</p><b>cd</b><p>ef</p></root>`,
    );
  });
});
