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
import { TimeTicket } from '@yorkie-js/sdk/src/document/time/ticket';
import {
  CRDTTree,
  CRDTTreeNode,
  CRDTTreeNodeID,
  TreeRestoreSpan,
} from '@yorkie-js/sdk/src/document/crdt/tree';

const actor = '000000000000000000000001';

/**
 * `ticketOf` issues a TimeTicket with the given lamport.
 */
function ticketOf(lamport: number): TimeTicket {
  return TimeTicket.of(BigInt(lamport), 0, actor);
}

/**
 * `helloTree` returns `<r><p>hello</p></r>` and its `<p>` and text node.
 */
function helloTree(): {
  tree: CRDTTree;
  p: CRDTTreeNode;
  text: CRDTTreeNode;
} {
  const root = new CRDTTreeNode(CRDTTreeNodeID.of(ticketOf(1), 0), 'r', []);
  const p = new CRDTTreeNode(CRDTTreeNodeID.of(ticketOf(2), 0), 'p', []);
  const text = new CRDTTreeNode(
    CRDTTreeNodeID.of(ticketOf(3), 0),
    'text',
    'hello',
  );
  p.append(text);
  root.append(p);
  return { tree: new CRDTTree(root, ticketOf(1)), p, text };
}

/**
 * `textSpan` returns the restore span an honest replica captures for `node`.
 */
function textSpan(node: CRDTTreeNode, parent: CRDTTreeNode): TreeRestoreSpan {
  return {
    id: node.id,
    nodeType: node.type,
    isText: true,
    length: node.value.length,
    value: node.value,
    parentID: parent.id,
  };
}

/**
 * Ports of the Go `TestTreeRestoreTextParentSkip` and
 * `TestTreeRestoreKindMismatchSkip` (yorkie#2175). Both SDKs must skip the
 * same spans, or a Go and a JS replica diverge on the same change.
 */
describe('CRDTTree restore span kind', function () {
  // A span whose parent ID names a text node is skipped like a missing parent
  // (B1) instead of throwing. A text node cannot hold children, and node kind
  // never changes, so every replica skips the same span.
  for (const isText of [false, true]) {
    it(`skips a span under a text parent (isText=${isText})`, function () {
      const { tree, text } = helloTree();
      const span: TreeRestoreSpan = isText
        ? {
            id: CRDTTreeNodeID.of(ticketOf(9), 0),
            nodeType: 'text',
            isText: true,
            length: 1,
            value: 'x',
            parentID: text.id,
          }
        : {
            id: CRDTTreeNodeID.of(ticketOf(9), 0),
            nodeType: 'p',
            isText: false,
            length: 0,
            parentID: text.id,
          };

      const [untombstoned, recreated, pairs] = tree.restore(
        [span],
        ticketOf(10),
      );
      assert.isEmpty(untombstoned);
      assert.isEmpty(recreated, 'a node under a text parent is skipped');
      assert.isEmpty(pairs);
      assert.equal(tree.toXML(), '<r><p>hello</p></r>', 'tree is untouched');
      const found = tree.findFloorNode(span.id);
      assert.isFalse(
        !!found && found.id.equals(span.id),
        'the node is never registered',
      );
    });
  }

  // A span whose isText disagrees with its nodeType is skipped by both restore
  // and retombstone. Recreating it would build a node of the wrong kind: a
  // zero-length text node, or an element carrying a value. The text lookup
  // cannot see such an element, so a second copy of the span inserted another
  // node under the same ID.
  for (const isText of [false, true]) {
    it(`skips a span whose kind disagrees (isText=${isText})`, function () {
      const { tree, p } = helloTree();
      const span: TreeRestoreSpan = isText
        ? {
            id: CRDTTreeNodeID.of(ticketOf(9), 0),
            nodeType: 'p',
            isText: true,
            length: 1,
            value: 'x',
            parentID: p.id,
          }
        : {
            id: CRDTTreeNodeID.of(ticketOf(9), 0),
            nodeType: 'text',
            isText: false,
            length: 0,
            parentID: p.id,
          };
      const spans = [span, span];

      const [untombstoned, recreated] = tree.restore(spans, ticketOf(10));
      assert.isEmpty(untombstoned);
      assert.isEmpty(recreated, 'a mismatched span is skipped');
      assert.equal(tree.toXML(), '<r><p>hello</p></r>');
    });
  }

  // The other half of restore's kind check: a mismatched span naming a node
  // still present as a TOMBSTONE must not revive it either. The check sits
  // before the un-tombstone branch, so without it the span would resurrect
  // content its kind does not describe.
  it('keeps a tombstone a mismatched span names', function () {
    const { tree, p, text } = helloTree();
    let lamport = 20;
    const issue = () => ticketOf(lamport++);
    tree.editT([1, 6], undefined, 0, issue(), issue);
    assert.equal(tree.toXML(), '<r><p></p></r>');

    // Same identity as the tombstoned text, but typed as an element.
    const span: TreeRestoreSpan = {
      ...textSpan(text, p),
      nodeType: 'p',
    };
    const [untombstoned, recreated] = tree.restore([span], issue());
    assert.isEmpty(untombstoned, 'a mismatched span revives nothing');
    assert.isEmpty(recreated);
    assert.equal(tree.toXML(), '<r><p></p></r>', 'the tombstone stays dead');
  });

  // The retombstone half of the kind check. The spans name a LIVE node, so
  // retombstone would find and re-remove it without the check; a span
  // carrying an identity no node holds would pass either way.
  for (const [name, isText, nodeType] of [
    ['text node in an element-flagged span', false, 'text'],
    ['text node typed as an element', true, 'p'],
  ] as Array<[string, boolean, string]>) {
    it(`retombstone skips a mismatched span: ${name}`, function () {
      const { tree, p, text } = helloTree();
      const span: TreeRestoreSpan = {
        ...textSpan(text, p),
        isText,
        nodeType,
      };
      const [pairs] = tree.retombstone([span], ticketOf(20));
      assert.isEmpty(pairs, 'a mismatched span re-tombstones nothing');
      assert.equal(tree.toXML(), '<r><p>hello</p></r>', 'tree is untouched');
    });
  }
});

/**
 * Port of the Go `TestTreeRestoreClaimedIdentitySkip` (yorkie#2175). A span is
 * skipped when the identity it would recreate is already held by a surviving
 * node. Nothing on the wire ties a span's ID to a purged node of its own
 * insertion, and registering a node under a claimed ID overwrites the live
 * registration, leaving two nodes under one identity.
 */
describe('CRDTTree restore span claimed identity', function () {
  it('skips a text span naming a live element', function () {
    const { tree, p } = helloTree();

    // findPiecesOverlapping stops at the non-text floor node, so the gap
    // branch would recreate a text node under <p>'s exact identity.
    const span: TreeRestoreSpan = {
      id: p.id,
      nodeType: 'text',
      isText: true,
      length: 1,
      value: 'x',
      parentID: tree.getRoot().id,
    };
    const [untombstoned, recreated] = tree.restore([span], ticketOf(20));
    assert.isEmpty(untombstoned);
    assert.isEmpty(recreated, 'a claimed identity is not recreated');
    assert.equal(tree.toXML(), '<r><p>hello</p></r>');
    assert.strictEqual(
      tree.findFloorNode(p.id),
      p,
      '<p> still holds its own identity',
    );
  });

  it('skips an element span inside a live text run', function () {
    const { tree, p, text } = helloTree();

    // Offset 2 falls inside "hello": the id is the one the next honest split
    // of that run mints, so creating an element there plants a duplicate that
    // split would collide with. (Such a span is now refused one step earlier,
    // as a malformed element offset -- see the offset cases below -- which
    // holds whether or not this replica still has the run.)
    const span: TreeRestoreSpan = {
      id: CRDTTreeNodeID.of(text.id.getCreatedAt(), 2),
      nodeType: 'p',
      isText: false,
      length: 0,
      parentID: p.id,
    };
    const [untombstoned, recreated] = tree.restore([span], ticketOf(20));
    assert.isEmpty(untombstoned);
    assert.isEmpty(recreated, 'an id inside a live run is not recreated');
    assert.equal(tree.toXML(), '<r><p>hello</p></r>');

    // The honest split that mints that id still works afterwards.
    let lamport = 21;
    const issue = () => ticketOf(lamport++);
    tree.editT(
      [3, 3],
      [new CRDTTreeNode(CRDTTreeNodeID.of(issue(), 0), 'text', 'Z')],
      0,
      issue(),
      issue,
    );
    assert.equal(tree.toXML(), '<r><p>heZllo</p></r>');
    assert.equal(tree.getSize(), 8, 'the length cache stays sound');
  });
});

/**
 * Shapes judged from the span ALONE, so a replica rejects them whether or not
 * it still holds the insertion they name -- unlike the claimed-identity test
 * above, which can only see what this replica has yet to garbage-collect.
 * Each span below names an insertion (lamport 9) no node in the tree belongs
 * to, so nothing is claimed and only the span's own shape can refuse it.
 */
describe('CRDTTree restore span shape', function () {
  // Element IDs are minted at offset 0 everywhere; only text offsets ever
  // advance. An element planted at a non-zero offset sits inside some text
  // insertion's offset space, where `findPiecesOverlapping` stops its walk on
  // it and hides every live piece beyond it from later restores.
  it('skips an element span with a non-zero offset', function () {
    const { tree, p } = helloTree();
    const span: TreeRestoreSpan = {
      id: CRDTTreeNodeID.of(ticketOf(9), 2),
      nodeType: 'p',
      isText: false,
      length: 0,
      parentID: p.id,
    };

    const [untombstoned, recreated] = tree.restore([span], ticketOf(20));
    assert.isEmpty(untombstoned);
    assert.isEmpty(recreated, 'an element never carries a non-zero offset');
    assert.equal(tree.toXML(), '<r><p>hello</p></r>');
    assert.isUndefined(
      tree.findFloorNode(span.id),
      'the element is never registered',
    );

    // Same refusal on the redo side, so the two stay mirror images.
    const [pairs] = tree.retombstone([span], ticketOf(21));
    assert.isEmpty(pairs);
  });

  // `length` is the text measure and is 0 on every element span. A non-zero
  // one widens `retombstone`'s probe range over offsets the span never owned.
  it('skips an element span carrying a text length', function () {
    const { tree, p } = helloTree();
    const span: TreeRestoreSpan = {
      id: CRDTTreeNodeID.of(ticketOf(9), 0),
      nodeType: 'p',
      isText: false,
      length: 3,
      parentID: p.id,
    };

    const [, recreated] = tree.restore([span], ticketOf(20));
    assert.isEmpty(recreated, 'an element span carries no length');
    assert.equal(tree.toXML(), '<r><p>hello</p></r>');
  });

  // A text span's value is the exact content of [offset, offset + length). A
  // value that does not cover the length recreates a run shorter than the one
  // the span claims -- at the extreme a zero-length text node, which
  // `findPiecesOverlapping` then hands to `isolateTextRange` as an empty
  // piece, splitting out of range and throwing inside the apply path.
  for (const [name, length, value] of [
    ['value shorter than length', 5, 'x'],
    ['value longer than length', 1, 'xyz'],
    ['zero length', 0, ''],
    ['missing value', 1, undefined],
  ] as Array<[string, number, string | undefined]>) {
    it(`skips a text span whose value disagrees: ${name}`, function () {
      const { tree, p } = helloTree();
      const span: TreeRestoreSpan = {
        id: CRDTTreeNodeID.of(ticketOf(9), 0),
        nodeType: 'text',
        isText: true,
        length,
        value,
        parentID: p.id,
      };

      const [, recreated] = tree.restore([span], ticketOf(20));
      assert.isEmpty(recreated, 'a text span must carry exactly its run');
      assert.equal(tree.toXML(), '<r><p>hello</p></r>');
      assert.equal(tree.getSize(), 7, 'the length cache stays sound');
      assert.isUndefined(
        tree.findFloorNode(span.id),
        'nothing is registered under the span ID',
      );
    });
  }
});

/**
 * `dropDuplicateContents` answers the same one-node-per-identity question as
 * `restore`'s claimed-identity test, for content arriving on the ordinary
 * insert path. Both have to read the whole run a surviving node claims:
 * content landing INSIDE a live text run is a second node under one identity
 * exactly as an exact-ID duplicate is.
 */
describe('CRDTTree duplicate content inside a live run', function () {
  it('drops content whose ID falls inside a live text run', function () {
    const { tree, text } = helloTree();
    const copy = new CRDTTreeNode(
      CRDTTreeNodeID.of(text.id.getCreatedAt(), 2),
      'text',
      'Z',
    );

    const kept = tree.dropDuplicateContents([copy], ticketOf(20));
    assert.isEmpty(kept, 'offset 2 is inside live "hello" [0, 5)');
  });

  it('keeps content whose ID merely abuts a live text run', function () {
    const { tree, text } = helloTree();
    const next = new CRDTTreeNode(
      CRDTTreeNodeID.of(text.id.getCreatedAt(), 5),
      'text',
      'Z',
    );

    const kept = tree.dropDuplicateContents([next], ticketOf(20));
    assert.lengthOf(kept, 1, 'offset 5 is past live "hello" [0, 5)');
  });

  it('leaves the tree insertable after dropping such content', function () {
    const { tree, text } = helloTree();
    let lamport = 20;
    const issue = () => ticketOf(lamport++);

    // The ID the next honest split of "hello" mints. Registering a second node
    // under it is what leaves a later change addressing the run unapplicable.
    const copy = new CRDTTreeNode(
      CRDTTreeNodeID.of(text.id.getCreatedAt(), 2),
      'text',
      'Z',
    );
    tree.editT([1, 1], [copy], 0, issue(), issue);
    assert.equal(tree.toXML(), '<r><p>hello</p></r>', 'the copy is dropped');

    // That split now mints its ID into a free slot.
    tree.editT(
      [3, 3],
      [new CRDTTreeNode(CRDTTreeNodeID.of(issue(), 0), 'text', 'Z')],
      0,
      issue(),
      issue,
    );
    assert.equal(tree.toXML(), '<r><p>heZllo</p></r>');
    assert.strictEqual(
      tree.findFloorNode(CRDTTreeNodeID.of(text.id.getCreatedAt(), 2)),
      tree.findFloorNode(CRDTTreeNodeID.of(text.id.getCreatedAt(), 3)),
      'offset 2 resolves to the split piece that owns it',
    );
  });
});
