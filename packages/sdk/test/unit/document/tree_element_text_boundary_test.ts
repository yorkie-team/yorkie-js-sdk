/*
 * Copyright 2026 The Yorkie Authors. All rights reserved.
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
import { posT, timeT } from '@yorkie-js/sdk/test/helper/helper';
import { Document, Indexable } from '@yorkie-js/sdk/src/document/document';
import { Tree } from '@yorkie-js/sdk/src/yorkie';
import { CRDTTree, CRDTTreeNode } from '@yorkie-js/sdk/src/document/crdt/tree';
import { converter } from '@yorkie-js/sdk/src/api/converter';
import { ChangePack as PbChangePack } from '@yorkie-js/sdk/src/api/yorkie/v1/resources_pb';
import { ChangePack } from '@yorkie-js/sdk/src/document/change/change_pack';
import { Checkpoint } from '@yorkie-js/sdk/src/document/change/checkpoint';
import { InitialVersionVector } from '@yorkie-js/sdk/src/document/time/version_vector';

/**
 * The index right after an element and right before a text sibling (index 8
 * below) resolves to the start of that text.
 *
 * `fromTreePos` used to anchor that index on the text itself at offset 0. A
 * text left sibling means "after its first N characters", and with N = 0
 * there is nothing to split off, so the whole text became the left sibling
 * and the edit landed after it. It now anchors on what precedes the text.
 *
 * Mirrors yorkie's pkg/document/crdt/tree_find_pos_test.go and
 * pkg/document/tree_element_text_boundary_test.go (yorkie#2079): the position
 * computed here goes on the wire, so both SDKs must resolve it the same way.
 *
 *     0   1   2 3 4 5 6 7    8 9 10 11 12 13 14    15
 * <r> <p> <b> h e l l o </b>   w  o  r  l  d   </p>  </r>
 */

/**
 * `textNode` returns a new text node with the given value.
 */
function textNode(value: string): CRDTTreeNode {
  return new CRDTTreeNode(posT(), 'text', value);
}

/**
 * `editT` replaces [from, to) with node, or deletes it when node is omitted.
 */
function editT(
  tree: CRDTTree,
  from: number,
  to: number,
  node?: CRDTTreeNode,
  splitLevel = 0,
): void {
  tree.editT([from, to], node && [node], splitLevel, timeT(), timeT);
}

/**
 * `newBoldHelloWorldTree` builds `<r><p><b>hello</b> world</p></r>`.
 */
function newBoldHelloWorldTree(): CRDTTree {
  const tree = new CRDTTree(new CRDTTreeNode(posT(), 'r'), timeT());
  editT(tree, 0, 0, new CRDTTreeNode(posT(), 'p'));
  editT(tree, 1, 1, new CRDTTreeNode(posT(), 'b'));
  editT(tree, 2, 2, textNode('hello'));
  editT(tree, 8, 8, textNode(' world')); // <p> has no text after </b> yet.
  assert.equal(tree.toXML(), /*html*/ `<r><p><b>hello</b> world</p></r>`);
  return tree;
}

/**
 * `childrenOfP` lists the children of the first <p>, tombstones included, as
 * `b`, `"text"` or `~"removed text"~`.
 */
function childrenOfP(tree: CRDTTree): Array<string> {
  return tree.getRoot().children[0].allChildren.map((node) => {
    const name = node.isText ? `"${node.value}"` : node.type;
    return node.isRemoved ? `~${name}~` : name;
  });
}

describe('Tree edit at an element/text boundary', function () {
  it('inserts before the text', function () {
    const tree = newBoldHelloWorldTree();
    editT(tree, 8, 8, textNode('|'));
    assert.equal(tree.toXML(), /*html*/ `<r><p><b>hello</b>| world</p></r>`);
  });

  it('deletes the text from the boundary', function () {
    const tree = newBoldHelloWorldTree();
    editT(tree, 8, 14);
    assert.equal(tree.toXML(), /*html*/ `<r><p><b>hello</b></p></r>`);
  });

  it('skips a tombstone between the element and the text', function () {
    // <r><p><b>hello</b>[x removed] world</p></r>: the previous visible
    // sibling of " world" is still <b>.
    const tree = newBoldHelloWorldTree();
    editT(tree, 8, 8, textNode('x'));
    editT(tree, 8, 9);
    assert.equal(tree.toXML(), /*html*/ `<r><p><b>hello</b> world</p></r>`);

    editT(tree, 8, 8, textNode('|'));
    assert.equal(tree.toXML(), /*html*/ `<r><p><b>hello</b>| world</p></r>`);
  });

  it('skips a deleted head of the same text like a separate tombstone', function () {
    // Deleting " w" splits " world" into a tombstoned head and a live "orld"
    // whose insPrev is that head. The insert still anchors on <b>, before
    // the tombstone, exactly as it does when the tombstone is a separate node:
    // which kind of tombstone sits there is not visible to the user, so it
    // must not change where the edit lands.
    const tree = newBoldHelloWorldTree();
    editT(tree, 8, 10);
    assert.equal(tree.toXML(), /*html*/ `<r><p><b>hello</b>orld</p></r>`);

    editT(tree, 8, 8, textNode('|'));
    assert.equal(tree.toXML(), /*html*/ `<r><p><b>hello</b>|orld</p></r>`);
    assert.deepEqual(childrenOfP(tree), ['b', '"|"', '~" w"~', '"orld"']);

    const separate = newBoldHelloWorldTree();
    editT(separate, 8, 8, textNode('x'));
    editT(separate, 8, 9);
    editT(separate, 8, 8, textNode('|'));
    assert.deepEqual(childrenOfP(separate), ['b', '"|"', '~"x"~', '" world"']);
  });

  it('anchors a text that is the first visible child on the parent', function () {
    // <r><p>[<b>hello</b> removed] world</p></r>: " world" is now the first
    // visible child even though a tombstone precedes it.
    const tree = newBoldHelloWorldTree();
    editT(tree, 1, 8);
    assert.equal(tree.toXML(), /*html*/ `<r><p> world</p></r>`);

    const pos = tree.findPos(1);
    assert.isTrue(
      pos
        .getLeftSiblingID()
        .getCreatedAt()
        .equals(pos.getParentID().getCreatedAt()),
    );

    editT(tree, 1, 1, textNode('|'));
    assert.equal(tree.toXML(), /*html*/ `<r><p>| world</p></r>`);
  });

  it('anchors on a split element before the text itself', function () {
    // Splitting <b> at "hel|lo" gives the right half an insPrev, the shape
    // the position resolver redirects for text halves. It must not redirect
    // here: element ids always carry offset 0, so the anchor stays on the
    // right half instead of moving one sibling to the left.
    //
    //     0   1   2 3 4 5    6   7 8 9    10 11 ...
    // <r> <p> <b> h e l </b> <b> l o </b>    w ...
    const tree = newBoldHelloWorldTree();
    editT(tree, 5, 5, undefined, 1);
    assert.equal(
      tree.toXML(),
      /*html*/ `<r><p><b>hel</b><b>lo</b> world</p></r>`,
    );

    const rightHalf = tree.getRoot().children[0].children[1];
    assert.isDefined(rightHalf.insPrevID);
    const pos = tree.findPos(10);
    assert.isTrue(pos.getLeftSiblingID().equals(rightHalf.id));

    editT(tree, 10, 10, textNode('|'));
    assert.equal(
      tree.toXML(),
      /*html*/ `<r><p><b>hel</b><b>lo</b>| world</p></r>`,
    );
  });

  it('resolves a boundary between two texts to the end of the left one', function () {
    // fromTreePos relies on this: a text reached at offset 0 never has a text
    // right before it, so the previous visible sibling is an element.
    const tree = newBoldHelloWorldTree();
    editT(tree, 14, 14, textNode('!'));
    assert.equal(tree.toXML(), /*html*/ `<r><p><b>hello</b> world!</p></r>`);

    const world = tree.getRoot().children[0].children[1];
    assert.equal(world.value, ' world');
    const pos = tree.findPos(14);
    assert.isTrue(
      pos.getLeftSiblingID().getCreatedAt().equals(world.id.getCreatedAt()),
    );
    assert.equal(
      pos.getLeftSiblingID().getOffset(),
      world.id.getOffset() + ' world'.length,
    );
  });

  it('moves the text to the new paragraph when splitting at the boundary', function () {
    const tree = newBoldHelloWorldTree();
    editT(tree, 8, 8, undefined, 1);
    assert.equal(
      tree.toXML(),
      /*html*/ `<r><p><b>hello</b></p><p> world</p></r>`,
    );
  });
});

type TestDoc = Document<{ t: Tree }>;
type Batch = PbChangePack;

/**
 * `newActor` returns an empty document owned by the given actor.
 */
function newActor(actor: string): TestDoc {
  const doc: TestDoc = new Document('d');
  doc.setActor(actor);
  return doc;
}

/**
 * `grab` takes a document's pending local changes through the protobuf
 * converter and acknowledges them, so they can be replayed into other
 * documents in any order.
 */
function grab(doc: TestDoc): Batch {
  const pack = doc.createChangePack();
  const changes = pack.getChanges();
  const lastSeq = changes.length
    ? changes[changes.length - 1].getID().getClientSeq()
    : 0;
  const pb = converter.toChangePack(pack);
  doc.applyChangePack(
    ChangePack.create(
      pack.getDocumentKey(),
      Checkpoint.of(0n, lastSeq),
      false,
      [],
      InitialVersionVector,
    ),
  );
  return pb;
}

/**
 * `feed` applies a grabbed batch to the given document.
 */
function feed(doc: TestDoc, batch: Batch): void {
  const pack = converter.fromChangePack<Indexable>(batch);
  doc.applyChangePack(
    ChangePack.create(
      pack.getDocumentKey(),
      Checkpoint.of(0n, 0),
      false,
      pack.getChanges(),
      InitialVersionVector,
    ),
  );
}

/**
 * `runConcurrently` seeds `<r><p><b>hello</b> world</p></r>` on two replicas,
 * runs `edit` on the first and `other` on the second without either seeing
 * the other, exchanges the changes and returns both results.
 */
function runConcurrently(
  edit: (t: Tree) => void,
  other: (t: Tree) => void,
): [string, string] {
  const seed = newActor('000000000000000000000009');
  seed.update((r) => {
    r.t = new Tree({
      type: 'r',
      children: [
        {
          type: 'p',
          children: [
            { type: 'b', children: [{ type: 'text', value: 'hello' }] },
            { type: 'text', value: ' world' },
          ],
        },
      ],
    });
  });
  const base = grab(seed);

  const editor = newActor('00000000000000000000000a');
  const second = newActor('00000000000000000000000b');
  feed(editor, base);
  feed(second, base);

  editor.update((r) => edit(r.t));
  second.update((r) => other(r.t));

  const edits = grab(editor);
  const others = grab(second);
  feed(editor, others);
  feed(second, edits);

  return [editor.getRoot().t.toXML(), second.getRoot().t.toXML()];
}

describe('Tree element/text boundary under a concurrent split', function () {
  // An index right after an element and right before a text sibling anchors
  // on the element. On a replica that has split that element concurrently,
  // the anchor has to move past the split half the editing change did not
  // know, or the edit lands between the two halves instead of before the
  // text.
  const split = (t: Tree) => t.edit(5, 5, undefined, 1); // <b>hel</b><b>lo</b>
  const tests: Array<{ name: string; edit: (t: Tree) => void; want: string }> =
    [
      {
        name: 'insert before the text',
        edit: (t) => t.edit(8, 8, { type: 'text', value: '|' }),
        want: /*html*/ `<r><p><b>hel</b><b>lo</b>| world</p></r>`,
      },
      {
        name: 'delete the text from the boundary',
        edit: (t) => t.edit(8, 14),
        want: /*html*/ `<r><p><b>hel</b><b>lo</b></p></r>`,
      },
      {
        name: 'split the paragraph at the boundary',
        edit: (t) => t.edit(8, 8, undefined, 1),
        want: /*html*/ `<r><p><b>hel</b><b>lo</b></p><p> world</p></r>`,
      },
      {
        name: 'style a range that ends at the boundary',
        edit: (t) => t.style(1, 8, { k: 'v' }),
        want: /*html*/ `<r><p><b k="v">hel</b><b k="v">lo</b> world</p></r>`,
      },
    ];

  for (const tc of tests) {
    it(tc.name, function () {
      const [editor, splitter] = runConcurrently(tc.edit, split);
      assert.equal(editor, tc.want);
      assert.equal(splitter, tc.want);
    });
  }
});

describe('Tree element/text boundary under a concurrent edit', function () {
  // The element anchor must also hold up when another replica edits that
  // boundary concurrently: removes the element the edit anchored on, or
  // inserts at the same index, so two edits share the anchor and the RGA
  // tie-break orders them.
  const insert = (t: Tree) => t.edit(8, 8, { type: 'text', value: '|' });
  const tests: Array<{ name: string; other: (t: Tree) => void; want: string }> =
    [
      {
        name: 'the anchor element is removed',
        other: (t) => t.edit(1, 8),
        want: /*html*/ `<r><p>| world</p></r>`,
      },
      {
        name: 'another insert at the same boundary',
        other: (t) => t.edit(8, 8, { type: 'text', value: 'x' }),
        want: /*html*/ `<r><p><b>hello</b>x| world</p></r>`,
      },
    ];

  for (const tc of tests) {
    it(tc.name, function () {
      const [editor, other] = runConcurrently(insert, tc.other);
      assert.equal(editor, tc.want);
      assert.equal(other, tc.want);
    });
  }
});
