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

      const [pairs] = tree.retombstone(spans, ticketOf(11));
      assert.isEmpty(pairs, 'retombstone skips it too');
      assert.equal(tree.toXML(), '<r><p>hello</p></r>');
    });
  }
});
