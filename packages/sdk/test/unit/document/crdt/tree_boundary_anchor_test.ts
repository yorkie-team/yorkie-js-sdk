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
} from '@yorkie-js/sdk/src/document/crdt/tree';
import { VersionVector } from '@yorkie-js/sdk/src/document/time/version_vector';

const actorA = '000000000000000000000001';
const actorB = '000000000000000000000002';

/**
 * `ticketOf` issues a TimeTicket with the given lamport and actor.
 */
function ticketOf(lamport: number, actorID: string): TimeTicket {
  return TimeTicket.of(BigInt(lamport), 0, actorID);
}

describe('CRDTTree boundary anchors', function () {
  /**
   * `buildTree` returns a tree whose root holds `sibling` (created by B, with
   * its `insNextID` pointing at `own`) followed by `own` (created by A), the
   * shape `emptyRunReachesActor` walks: an unknown concurrent split sibling
   * standing right before this actor's own split product.
   */
  function buildTree(): {
    tree: CRDTTree;
    sibling: CRDTTreeNode;
    own: CRDTTreeNode;
    removedChild: CRDTTreeNode;
  } {
    const root = new CRDTTreeNode(
      CRDTTreeNodeID.of(ticketOf(1, actorA), 0),
      'r',
      [],
    );
    const sibling = new CRDTTreeNode(
      CRDTTreeNodeID.of(ticketOf(5, actorB), 0),
      'p',
      [],
    );
    const own = new CRDTTreeNode(
      CRDTTreeNodeID.of(ticketOf(6, actorA), 0),
      'p',
      [],
    );
    const removedChild = new CRDTTreeNode(
      CRDTTreeNodeID.of(ticketOf(7, actorB), 0),
      'text',
      'ab',
    );
    sibling.append(removedChild);
    root.append(sibling);
    root.append(own);
    sibling.insNextID = own.id;

    return {
      tree: new CRDTTree(root, ticketOf(1, actorA)),
      sibling,
      own,
      removedChild,
    };
  }

  /**
   * `emptyRunReachesActor` is private; the walk it performs is what decides
   * which side of a concurrent boundary a split lands on, so it is exercised
   * directly rather than through an integration-only scenario.
   */
  function emptyRunReachesActor(
    tree: CRDTTree,
    node: CRDTTreeNode,
    actorID: string,
  ): boolean {
    return (
      tree as unknown as {
        emptyRunReachesActor(
          node: CRDTTreeNode,
          actorID: string,
          versionVector: VersionVector,
        ): boolean;
      }
    ).emptyRunReachesActor(node, actorID, new VersionVector());
  }

  it('does not let a tombstone change which side a split lands on', function () {
    const { tree, sibling, removedChild } = buildTree();

    // A child stands between the boundary and our split, so the run is not
    // empty.
    assert.isFalse(emptyRunReachesActor(tree, sibling, actorA));

    // Removing that child must not flip the answer. This predicate decides
    // which side of a concurrent boundary an insertion lands on, and every
    // replica has to decide the same way; `isRemoved` is mutable and
    // delivery-order dependent, so reading `children` here would make a
    // replica that has already applied the removal place the insertion
    // differently from one that has not.
    removedChild.remove(ticketOf(8, actorA));
    assert.isFalse(emptyRunReachesActor(tree, sibling, actorA));
  });

  /**
   * `leftAnchorID` is private, and the node it guards against cannot be built
   * through the public edit API — only decoded from a remote peer.
   */
  function leftAnchorID(tree: CRDTTree, sibling: CRDTTreeNode): CRDTTreeNodeID {
    return (
      tree as unknown as {
        leftAnchorID(sibling: CRDTTreeNode): CRDTTreeNodeID;
      }
    ).leftAnchorID(sibling);
  }

  it('anchors an empty text node on its own id, never offset -1', function () {
    const { tree } = buildTree();

    const empty = new CRDTTreeNode(
      CRDTTreeNodeID.of(ticketOf(9, actorB), 0),
      'text',
      '',
    );
    const anchor = leftAnchorID(tree, empty);
    assert.equal(anchor.getOffset(), 0);
    assert.isTrue(anchor.equals(empty.id));

    // A text node with characters still anchors on its last one.
    const text = new CRDTTreeNode(
      CRDTTreeNodeID.of(ticketOf(10, actorB), 3),
      'text',
      'abc',
    );
    assert.equal(leftAnchorID(tree, text).getOffset(), 5);
  });
});
