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
import {
  MaxTimeTicket,
  TimeTicket,
} from '@yorkie-js/sdk/src/document/time/ticket';
import {
  CRDTTree,
  CRDTTreeNode,
  CRDTTreeNodeID,
  CRDTTreePos,
} from '@yorkie-js/sdk/src/document/crdt/tree';
import { maxVectorOf } from '@yorkie-js/sdk/test/helper/helper';

/*
 * insNextID is a structural pointer only `splitElement` is supposed to write,
 * but the wire format carries it on every tree node, so a document rebuilt
 * from stored client changes can hold a chain that loops back on itself. An
 * unbounded walk of that chain spins the applying task forever — and
 * `collectBetween`'s cascade also appends to nodesToBeRemoved on every turn,
 * so it burns memory while it spins.
 *
 * The converter now strips the field from client-supplied content
 * (`fromTreeNodesWhenEdit` for operation content, `dropSplitLinksInElement`
 * for the element bytes a Set/Add/SetByIndex carries), so these chains should
 * no longer be constructible. The walks stay bounded anyway: documents stored
 * before that already carry whatever a client sent.
 */

// `knownActor` creates the nodes the operation under test knows about.
const knownActor = '000000000000000000000001';
// `cycleActor` creates the two nodes that point at each other. They have to be
// unknown to the operation's version vector: that is the only case these walks
// follow the chain at all.
const cycleActor = '000000000000000000000002';
// `remoteActor` runs the operation.
const remoteActor = '000000000000000000000003';

/**
 * `ticketer` hands out tickets with increasing lamports for a given actor.
 */
function ticketer() {
  let lamport = 0n;

  return (actor: string): TimeTicket => {
    lamport += 1n;

    return TimeTicket.of(lamport, 0, actor);
  };
}

/**
 * `poisonedTree` builds
 *
 *     <r><p>ab</p><p></p><p></p><p>cd</p></r>
 *
 * where the two middle paragraphs were created by `cycleActor` and point at
 * each other through insNextID, and both the first paragraph and its text node
 * link into that cycle. Every insNextID walk reachable from the first
 * paragraph runs into it.
 */
function poisonedTree(): CRDTTree {
  const issue = ticketer();
  const node = (actor: string, type: string, value?: string) =>
    new CRDTTreeNode(CRDTTreeNodeID.of(issue(actor), 0), type, value);
  const issueKnown = () => issue(knownActor);

  const tree = new CRDTTree(node(knownActor, 'r'), issue(knownActor));

  const first = node(knownActor, 'p');
  tree.editT([0, 0], [first], 0, issueKnown(), issueKnown);

  const text = node(knownActor, 'text', 'ab');
  tree.editT([1, 1], [text], 0, issueKnown(), issueKnown);

  const left = node(cycleActor, 'p');
  tree.editT([4, 4], [left], 0, issueKnown(), issueKnown);

  const right = node(cycleActor, 'p');
  tree.editT([6, 6], [right], 0, issueKnown(), issueKnown);

  const last = node(knownActor, 'p');
  tree.editT([8, 8], [last], 0, issueKnown(), issueKnown);

  tree.editT(
    [9, 9],
    [node(knownActor, 'text', 'cd')],
    0,
    issueKnown(),
    issueKnown,
  );

  assert.equal(tree.toXML(), '<r><p>ab</p><p></p><p></p><p>cd</p></r>');

  text.insNextID = left.id;
  first.insNextID = left.id;
  left.insNextID = right.id;
  right.insNextID = left.id;

  return tree;
}

describe('Cyclic insNextID chains', function () {
  const editedAt = TimeTicket.of(MaxTimeTicket.getLamport(), 0, remoteActor);
  // knownActor's nodes are known, cycleActor's are not.
  const vector = maxVectorOf([knownActor, remoteActor]);

  // `edit` walks the chain twice: Phase 3 range narrowing follows fromLeft's
  // chain looking for a sibling under toParent, and `collectBetween` cascades
  // the delete to unknown split siblings of every element it removes.
  it('edit over the cycle terminates', function () {
    const tree = poisonedTree();
    const range: [CRDTTreePos, CRDTTreePos] = [
      tree.findPos(3),
      tree.findPos(11),
    ];

    tree.edit(range, undefined, 0, editedAt, () => editedAt, vector);
    assert.isString(tree.toXML());
  });

  // `style` and `removeStyle` propagate to unknown split siblings along the
  // same chain.
  it('style over the cycle terminates', function () {
    const tree = poisonedTree();
    tree.style(
      [tree.findPos(0), tree.findPos(12)],
      { b: 't' },
      editedAt,
      vector,
    );
    assert.isString(tree.toXML());
  });

  it('remove style over the cycle terminates', function () {
    const tree = poisonedTree();
    tree.removeStyle(
      [tree.findPos(0), tree.findPos(12)],
      ['b'],
      editedAt,
      vector,
    );
    assert.isString(tree.toXML());
  });
});

describe('dropSplitLinks', function () {
  it('clears the links on the node and every descendant', function () {
    const issue = ticketer();
    const node = (type: string, value?: string) =>
      new CRDTTreeNode(CRDTTreeNodeID.of(issue(knownActor), 0), type, value);

    const root = node('r');
    const para = node('p');
    const text = node('text', 'ab');
    root.append(para);
    para.append(text);

    const other = CRDTTreeNodeID.of(issue(cycleActor), 0);
    root.insNextID = other;
    para.insPrevID = other;
    para.insNextID = other;
    text.insNextID = other;

    root.dropSplitLinks();

    for (const n of [root, para, text]) {
      assert.isUndefined(n.insPrevID);
      assert.isUndefined(n.insNextID);
    }
  });
});
