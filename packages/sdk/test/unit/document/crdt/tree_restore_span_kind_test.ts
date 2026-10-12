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
    // split would collide with.
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
