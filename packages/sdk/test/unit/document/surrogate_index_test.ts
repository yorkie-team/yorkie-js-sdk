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
import { Document, Indexable } from '@yorkie-js/sdk/src/document/document';
import { Text, Tree, TextNode } from '@yorkie-js/sdk/src/yorkie';
import { converter } from '@yorkie-js/sdk/src/api/converter';
import { ChangePack as PbChangePack } from '@yorkie-js/sdk/src/api/yorkie/v1/resources_pb';
import { ChangePack } from '@yorkie-js/sdk/src/document/change/change_pack';
import { Checkpoint } from '@yorkie-js/sdk/src/document/change/checkpoint';
import { InitialVersionVector } from '@yorkie-js/sdk/src/document/time/version_vector';
import { posT, timeT } from '@yorkie-js/sdk/test/helper/helper';
import { CRDTTree, CRDTTreeNode } from '@yorkie-js/sdk/src/document/crdt/tree';
import { CRDTText, CRDTTextValue } from '@yorkie-js/sdk/src/document/crdt/text';
import { RGATreeSplit } from '@yorkie-js/sdk/src/document/crdt/rga_tree_split';
import { CRDTRoot } from '@yorkie-js/sdk/src/document/crdt/root';
import { CRDTObject } from '@yorkie-js/sdk/src/document/crdt/object';
import { ElementRHT } from '@yorkie-js/sdk/src/document/crdt/element_rht';
import { TreeEditOperation } from '@yorkie-js/sdk/src/document/operation/tree_edit_operation';
import { OpSource } from '@yorkie-js/sdk/src/document/operation/operation';
import { isUTF16Boundary } from '@yorkie-js/sdk/src/document/json/strings';

/*
 * Text and Tree indexes count UTF-16 code units, so the index between the two
 * halves of a non-BMP character names no character boundary. Splitting a node
 * there leaves Go and JS with different text for the same operation: Go turns
 * each lone half into U+FFFD, JS keeps the raw code unit (yorkie#2065). A
 * local index inside a pair is therefore rejected where it becomes a CRDT
 * position, as yorkie#2085 does on the Go side.
 */

type TestDoc = Document<{ tree: Tree; text: Text; status?: string }>;

const midPair = /index must not split a UTF-16 surrogate pair/;

// `surrogateText` is one non-BMP character followed by a BMP one: 2
// characters, 3 UTF-16 code units. Text offset 1 (Tree index 2) is the only
// position that cuts the emoji in half.
const surrogateText = '😀x';

function textNode(value: string): TextNode {
  return { type: 'text', value };
}

function newActor(actor = '000000000000000000000001'): TestDoc {
  const doc: TestDoc = new Document('surrogate-index');
  doc.setActor(actor);
  return doc;
}

/**
 * `newSurrogateDoc` returns a document holding the Tree <r><p>😀x</p></r>
 * under "tree" and the Text "😀x" under "text".
 */
function newSurrogateDoc(actor?: string): TestDoc {
  const doc = newActor(actor);
  doc.update((root) => {
    root.tree = new Tree({
      type: 'r',
      children: [
        { type: 'p', children: [{ type: 'text', value: surrogateText }] },
      ],
    });
    root.text = new Text();
    root.text.edit(0, 0, surrogateText);
  });
  return doc;
}

function state(doc: TestDoc): [string, string] {
  return [doc.getRoot().tree.toXML(), doc.getRoot().text.toString()];
}

/**
 * `assertRejectsMidSurrogate` asserts that fn is refused and leaves the
 * document unchanged.
 */
function assertRejectsMidSurrogate(
  doc: TestDoc,
  fn: (root: TestDoc extends Document<infer R> ? R : never) => void,
): void {
  const before = doc.toSortedJSON();
  assert.throws(() => doc.update((root) => fn(root)), midPair);
  assert.equal(doc.toSortedJSON(), before, 'the refused edit left no trace');
}

/** Takes the pending local changes through the wire form and acks them. */
function grab(doc: TestDoc): PbChangePack {
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

function feed(doc: TestDoc, batch: PbChangePack): void {
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

describe('isUTF16Boundary', () => {
  // An independent definition: the boundaries are where a walk over the
  // value's code points stops, plus everything outside the value.
  const encodedBoundary = (value: string, offset: number) => {
    if (offset <= 0 || offset >= value.length) {
      return true;
    }
    let at = 0;
    for (const ch of value) {
      if (at === offset) {
        return true;
      }
      at += ch.length;
    }
    return false;
  };

  it('matches the encoded definition at every offset', () => {
    for (const value of [
      '',
      'abc',
      '가나다',
      '😀',
      '😀x',
      'x😀',
      '😀😁',
      'a😀b😁c',
      '\ud83d',
      '\ude00\ud83d',
    ]) {
      for (let offset = -1; offset <= value.length + 1; offset++) {
        assert.equal(
          isUTF16Boundary(value, offset),
          encodedBoundary(value, offset),
          `value ${JSON.stringify(value)}, offset ${offset}`,
        );
      }
    }
  });

  it('rejects only the offset inside a surrogate pair', () => {
    assert.isTrue(isUTF16Boundary('a😀b', 1));
    assert.isFalse(isUTF16Boundary('a😀b', 2));
    assert.isTrue(isUTF16Boundary('a😀b', 3));
  });
});

describe('Reject mid-surrogate-pair indexes', () => {
  it('Text.edit', () => {
    const doc = newSurrogateDoc();
    assertRejectsMidSurrogate(doc, (root) => root.text.edit(1, 1, 'y'));
  });

  it('Text.setStyle', () => {
    const doc = newSurrogateDoc();
    assertRejectsMidSurrogate(doc, (root) =>
      root.text.setStyle(0, 1, { bold: 'true' }),
    );
  });

  const y = textNode('y');
  const treeCases: Array<[string, (root: { tree: Tree }) => void]> = [
    ['Tree.edit', (root) => root.tree.edit(2, 2, y)],
    ['Tree.editBulk', (root) => root.tree.editBulk(2, 2, [y])],
    ['Tree.style', (root) => root.tree.style(1, 2, { bold: 'true' })],
    ['Tree.removeStyle', (root) => root.tree.removeStyle(1, 2, ['bold'])],
    // The last component of a path into a text node is a UTF-16 offset, so
    // [0, 1] is offset 1 of the text under the first <p>.
    ['Tree.editByPath', (root) => root.tree.editByPath([0, 1], [0, 1], y)],
    [
      'Tree.editBulkByPath',
      (root) => root.tree.editBulkByPath([0, 1], [0, 1], [y]),
    ],
    [
      'Tree.styleByPath',
      (root) => root.tree.styleByPath([0, 0], [0, 1], { bold: 'true' }),
    ],
    [
      'Tree.removeStyleByPath',
      (root) => root.tree.removeStyleByPath([0, 0], [0, 1], ['bold']),
    ],
    ['Tree.splitByPath', (root) => root.tree.splitByPath([0, 1])],
  ];
  for (const [name, fn] of treeCases) {
    it(name, () => {
      assertRejectsMidSurrogate(newSurrogateDoc(), fn);
    });
  }

  it('keeps valid Text boundaries editable', () => {
    for (const [idx, expected] of [
      [0, 'y😀x'],
      [2, '😀yx'],
      [3, '😀xy'],
    ] as const) {
      const doc = newSurrogateDoc();
      doc.update((root) => root.text.edit(idx, idx, 'y'));
      assert.equal(doc.getRoot().text.toString(), expected, `index ${idx}`);
    }
  });

  it('keeps valid Tree boundaries editable', () => {
    for (const [idx, expected] of [
      [1, '<r><p>y😀x</p></r>'],
      [3, '<r><p>😀yx</p></r>'],
      [4, '<r><p>😀xy</p></r>'],
    ] as const) {
      const doc = newSurrogateDoc();
      doc.update((root) => root.tree.edit(idx, idx, y));
      assert.equal(doc.getRoot().tree.toXML(), expected, `index ${idx}`);
    }
  });

  // Converting a position back to an index splits the text node there, with
  // no operation, so a mid-pair selection from a peer leaves this replica's
  // emoji in two nodes while every other replica keeps it in one. The seam
  // then looks like a node boundary, but an edit there still names an offset
  // inside the pair in the original node, which other replicas split.
  it('rejects a Tree index at a local seam inside a pair', () => {
    const doc = newSurrogateDoc();
    doc.update((root) => {
      const midPair = root.tree.indexRangeToPosRange([2, 2]);
      assert.deepEqual(root.tree.posRangeToIndexRange(midPair), [2, 2]);
    });

    assertRejectsMidSurrogate(doc, (root) =>
      root.tree.edit(2, 2, textNode('y')),
    );
    for (const [idx, expected] of [
      [1, '<r><p>y😀x</p></r>'],
      [3, '<r><p>😀yx</p></r>'],
    ] as const) {
      const clone = new Document('surrogate-index') as TestDoc;
      clone.update((root) => {
        root.tree = new Tree({
          type: 'r',
          children: [
            { type: 'p', children: [{ type: 'text', value: surrogateText }] },
          ],
        });
        root.tree.posRangeToIndexRange(root.tree.indexRangeToPosRange([2, 2]));
      });
      clone.update((root) => root.tree.edit(idx, idx, textNode('y')));
      assert.equal(clone.getRoot().tree.toXML(), expected, `index ${idx}`);
    }
  });

  // The Text counterpart of the Tree seam above. An operation carrying a
  // mid-pair offset -- a style from an older client, here -- splits the node
  // there, so the emoji sits in two RGATreeSplit nodes on this replica and in
  // one on every other. `indexToPos` resolves the seam to the node on its
  // left, where the offset is at the END of the node, so the check only sees
  // the pair by reading the node that follows.
  it('rejects a Text index at a local seam inside a pair', () => {
    const text = new CRDTText(RGATreeSplit.create<CRDTTextValue>(), timeT());
    text.edit(text.indexRangeToPosRange(0, 0), surrogateText, timeT());
    assert.throws(() => text.createRange(1, 1), midPair);

    // `indexRangeToPosRange` is the unchecked lookup remote operations use.
    text.setStyle(text.indexRangeToPosRange(0, 1), { bold: 'true' }, timeT());
    assert.equal(text.toString(), surrogateText, 'the pair is still intact');
    assert.throws(() => text.createRange(1, 1), midPair);
    assert.throws(() => text.createRange(0, 1), midPair);
    assert.throws(() => text.createRange(1, 3), midPair);

    // The boundaries around the seam still resolve.
    for (const [from, to] of [
      [0, 0],
      [0, 2],
      [2, 2],
      [2, 3],
      [0, 3],
    ] as const) {
      assert.isDefined(text.createRange(from, to), `range ${from},${to}`);
    }
  });

  it('resolves Tree indexes after a split', () => {
    // An earlier edit splits <p>'s text node, so every offset has to be
    // resolved relative to the node that holds it.
    const splitDoc = () => {
      const doc = newSurrogateDoc();
      doc.update((root) => root.tree.edit(3, 3, textNode('yz')));
      return doc;
    };
    const w = textNode('w');

    assertRejectsMidSurrogate(splitDoc(), (root) => root.tree.edit(2, 2, w));

    // The seam the split created (3) and the offsets inside the inserted node
    // (4, 5) are whole-character boundaries.
    for (const [idx, expected] of [
      [3, '<r><p>😀wyzx</p></r>'],
      [4, '<r><p>😀ywzx</p></r>'],
      [5, '<r><p>😀yzwx</p></r>'],
    ] as const) {
      const doc = splitDoc();
      doc.update((root) => root.tree.edit(idx, idx, w));
      assert.equal(doc.getRoot().tree.toXML(), expected, `index ${idx}`);
    }
  });

  it('resolves Text indexes in a later node', () => {
    // Appending a second emoji leaves "😀x😀y" across two nodes, so the
    // rejected offset lives in a node that is not the first one.
    const twoNodeDoc = () => {
      const doc = newSurrogateDoc();
      doc.update((root) => root.text.edit(3, 3, '😀y'));
      return doc;
    };

    assertRejectsMidSurrogate(twoNodeDoc(), (root) =>
      root.text.edit(4, 4, 'w'),
    );

    for (const [idx, expected] of [
      [3, '😀xw😀y'],
      [5, '😀x😀wy'],
      [6, '😀x😀yw'],
    ] as const) {
      const doc = twoNodeDoc();
      doc.update((root) => root.text.edit(idx, idx, 'w'));
      assert.equal(doc.getRoot().text.toString(), expected, `index ${idx}`);
    }
  });

  it('discards earlier edits of the rejected update', () => {
    const z = textNode('z');
    const cases: Array<[string, (root: { tree: Tree; text: Text }) => void]> = [
      [
        'Text',
        (root) => {
          root.text.edit(3, 3, 'z');
          root.text.edit(1, 1, 'y');
        },
      ],
      [
        'Tree',
        (root) => {
          root.tree.edit(4, 4, z);
          root.tree.edit(2, 2, z);
        },
      ],
    ];

    for (const [name, fn] of cases) {
      const doc = newSurrogateDoc();
      const original = state(doc);

      assertRejectsMidSurrogate(doc, fn);
      assert.deepEqual(state(doc), original, name);

      doc.update((root) => {
        root.tree.edit(4, 4, z);
        root.text.edit(3, 3, 'z');
      });
      const edited: [string, string] = ['<r><p>😀xz</p></r>', '😀xz'];
      assert.deepEqual(state(doc), edited, name);

      doc.history.undo();
      assert.deepEqual(state(doc), original, name);
      doc.history.redo();
      assert.deepEqual(state(doc), edited, name);
    }
  });
});

describe('Mid-surrogate-pair indexes the document computed', () => {
  // Remote operations carry CRDT positions and never resolve an index, so an
  // operation minted by an older client with a mid-pair offset must still
  // apply, and must not break the receiver's own undo/redo afterwards.
  it('applies a remote mid-pair operation from an older client', () => {
    const sender = newSurrogateDoc('000000000000000000000001');
    const receiver = newActor('000000000000000000000002');
    feed(receiver, grab(sender));

    // The receiver makes a local edit it will later undo and redo.
    receiver.update((root) => {
      root.tree.edit(4, 4, textNode('z'));
      root.text.edit(3, 3, 'z');
    });

    // The sender inserts right after the emoji, a valid index, and the
    // operations are then moved one code unit to the left, into the middle
    // of the pair. That is what an older client would have sent.
    sender.update((root) => {
      root.tree.edit(3, 3, textNode('y'));
      root.text.edit(2, 2, 'y');
    });
    const pb = grab(sender);
    const ops = pb.changes[pb.changes.length - 1].operations;
    assert.lengthOf(ops, 2);
    for (const op of ops) {
      if (op.body.case === 'treeEdit') {
        op.body.value.from!.leftSiblingId!.offset -= 1;
        op.body.value.to!.leftSiblingId!.offset -= 1;
      } else if (op.body.case === 'edit') {
        op.body.value.from!.relativeOffset -= 1;
        op.body.value.to!.relativeOffset -= 1;
      } else {
        assert.fail(`unexpected operation ${op.body.case}`);
      }
    }
    feed(receiver, pb);

    // The edit landed inside the pair, so the emoji no longer survives. What
    // the lone halves become is the divergence yorkie#2065 describes and is
    // not pinned here.
    const applied = state(receiver);
    assert.notInclude(applied[0], '😀', 'the remote edit split the pair');
    assert.notInclude(applied[1], '😀', 'the remote edit split the pair');

    receiver.history.undo();
    assert.deepEqual(state(receiver), [
      applied[0].replace('z', ''),
      applied[1].replace('z', ''),
    ]);
    receiver.history.redo();
    assert.deepEqual(state(receiver), applied);
  });

  it('undoes and redoes around an intact pair', () => {
    const cases: Array<[string, (root: { tree: Tree; text: Text }) => void]> = [
      [
        'insert after the pair',
        (root) => {
          root.tree.edit(3, 3, textNode('y'));
          root.text.edit(2, 2, 'y');
        },
      ],
      [
        'delete the pair',
        (root) => {
          root.tree.edit(1, 3);
          root.text.edit(0, 2, '');
        },
      ],
      [
        'replace the pair',
        (root) => {
          root.tree.edit(1, 3, textNode('y'));
          root.text.edit(0, 2, 'y');
        },
      ],
    ];

    for (const [name, fn] of cases) {
      const doc = newSurrogateDoc();
      const original = state(doc);
      doc.update((root) => fn(root));
      const edited = state(doc);

      doc.history.undo();
      assert.deepEqual(state(doc), original, name);
      doc.history.redo();
      assert.deepEqual(state(doc), edited, name);
    }
  });

  /**
   * `newSectionReplicas` returns two replicas that both hold
   * <r><section><p>a😀b</p><p>c😀d</p></section></r>, and a function that
   * exchanges their pending changes.
   */
  function newSectionReplicas(): [TestDoc, TestDoc, () => void] {
    const a = newActor('000000000000000000000002');
    const b = newActor('000000000000000000000001');
    const exchange = () => {
      const packA = grab(a);
      const packB = grab(b);
      feed(a, packB);
      feed(b, packA);
    };
    a.update((root) => {
      root.tree = new Tree({
        type: 'r',
        children: [
          {
            type: 'section',
            children: [
              { type: 'p', children: [{ type: 'text', value: 'a😀b' }] },
              { type: 'p', children: [{ type: 'text', value: 'c😀d' }] },
            ],
          },
        ],
      });
    });
    exchange();
    return [a, b, exchange];
  }

  function edit(
    doc: TestDoc,
    from: number,
    to: number,
    value?: string,
    splitLevel = 0,
  ): void {
    doc.update((root) =>
      value
        ? root.tree.edit(from, to, textNode(value), splitLevel)
        : root.tree.edit(from, to, undefined, splitLevel),
    );
  }

  // Applying a change builds its reverse too, remote or not, from indexes the
  // receiver computes on its own tree. Every edit below is at a valid caller
  // index, but on A the reverse of B's emoji insert ends inside one of A's
  // emojis. Checking that index would refuse the remote change outright.
  it('applies a remote change whose reverse lands inside a pair', () => {
    const [a, b, exchange] = newSectionReplicas();

    edit(b, 1, 2, '😀');
    edit(a, 11, 11, 'x');
    edit(a, 0, 2, 'x');
    edit(a, 7, 7, '😀');
    exchange();

    assert.equal(a.getRoot().tree.toXML(), b.getRoot().tree.toXML());
    assert.equal(a.toSortedJSON(), b.toSortedJSON());
  });

  it('runs a reconciled undo whose index lands inside a pair', () => {
    // <r><p>0123456789</p></r>
    const root = new CRDTRoot(new CRDTObject(timeT(), ElementRHT.create()));
    const tree = new CRDTTree(new CRDTTreeNode(posT(), 'r'), timeT());
    tree.editT([0, 0], [new CRDTTreeNode(posT(), 'p')], 0, timeT(), timeT);
    tree.editT(
      [1, 1],
      [new CRDTTreeNode(posT(), 'text', '0123456789')],
      0,
      timeT(),
      timeT,
    );
    root.getObject().set('t', tree, timeT());
    root.registerElement(tree, root.getObject());

    // Local: insert "AB" at index 5. Its undo deletes [5,7).
    tree.editT(
      [5, 5],
      [new CRDTTreeNode(posT(), 'text', 'AB')],
      0,
      timeT(),
      timeT,
    );
    assert.equal(tree.toXML(), '<r><p>0123AB456789</p></r>');
    const undo = TreeEditOperation.create(
      tree.getCreatedAt(),
      tree.findPos(5),
      tree.findPos(7),
      undefined,
      0,
      timeT(),
      true,
      5,
      7,
    );

    // Remote: replace [4,6) ("3A") with an emoji, overlapping the start of
    // the undo range (Case 5).
    tree.editT(
      [4, 6],
      [new CRDTTreeNode(posT(), 'text', '😀')],
      0,
      timeT(),
      timeT,
    );
    assert.equal(tree.toXML(), '<r><p>012😀B456789</p></r>');

    // Case 5 places the range at the start of the remote content without
    // counting that content, so toIdx lands between the emoji's halves.
    undo.reconcileOperation(4, 6, 2);
    assert.deepEqual(undo.normalizePos(), [4, 5]);
    assert.throws(() => tree.findPos(5), midPair);

    // The undo runs instead of being refused, and splits the pair the way it
    // did before the check existed: one lone half is left where the emoji
    // was, and "B", which the undo was meant to delete, stays. That is Case
    // 5's formula, shared by both SDKs; which half survives is not pinned.
    undo.execute(root, OpSource.UndoRedo);
    assert.match(tree.toXML(), /^<r><p>012[\ud800-\udfff]B456789<\/p><\/r>$/);
  });

  it('builds reverse operations at indexes inside a pair', () => {
    const tree = new CRDTTree(new CRDTTreeNode(posT(), 'r'), timeT());
    tree.editT([0, 0], [new CRDTTreeNode(posT(), 'p')], 0, timeT(), timeT);
    const emoji = new CRDTTreeNode(posT(), 'text', '😀');
    tree.editT([1, 1], [emoji], 0, timeT(), timeT);
    assert.throws(() => tree.findPos(2), midPair);

    const op = TreeEditOperation.create(
      tree.getCreatedAt(),
      tree.findPos(1),
      tree.findPos(1),
      undefined,
      1,
      timeT(),
    ) as any;

    // The copy reverse of an insertion ends inside the pair.
    op.insertedContentSize = 1;
    assert.isDefined(op.toReverseOperation(tree, [], 1, new Set()));
    // A merge reverse (a split) starts inside it.
    assert.isDefined(op.toReverseOperation(tree, [], 2, new Set(), 1));
    // A split reverse starts or ends inside it.
    assert.isDefined(op.toSplitReverseOperation(tree, 2, 1));
    assert.isDefined(op.toSplitReverseOperation(tree, 1, 1));
  });
});
