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
import { Document, Indexable } from '@yorkie-js/sdk/src/document/document';
import { Tree } from '@yorkie-js/sdk/src/yorkie';
import { converter } from '@yorkie-js/sdk/src/api/converter';
import { ChangePack as PbChangePack } from '@yorkie-js/sdk/src/api/yorkie/v1/resources_pb';
import { YorkieError } from '@yorkie-js/sdk/src/util/error';
import { TreeEditOperation } from '@yorkie-js/sdk/src/document/operation/tree_edit_operation';

/*
 * insPrevID, insNextID and mergedFrom are structural pointers only
 * `splitElement` and `edit`'s merge step are supposed to write, but the wire
 * format carries all three on every tree node, so a document rebuilt from
 * stored client changes can hold a chain that loops back on itself. An
 * unbounded walk of such a chain spins the applying task forever — and
 * `collectBetween`'s cascade also appends to nodesToBeRemoved on every turn,
 * so it burns memory while it spins.
 *
 * The converter strips the two split links from client-supplied content
 * (`fromTreeNodesWhenEdit` for operation content, `dropSplitLinksInElement`
 * for the element bytes a Set/Add/SetByIndex carries), so those chains should
 * no longer be constructible. mergedFrom is left on the wire — the server
 * reads it too, so JS may not drop it unilaterally — and the walks stay
 * bounded on their own anyway: documents stored before the strip already
 * carry whatever a client sent.
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
 * each other through insNextID, insPrevID and mergedFrom alike, and both the
 * first paragraph and its text node link into those cycles. Every chain walk
 * reachable from the first paragraph runs into one of them:
 *
 * - insNextID: `collectBetween`'s delete cascade, `unknownSplitSiblings`,
 *   `advancePastUnknownSplitSiblings`.
 * - insPrevID: `splitFamilyOf` and the two directions `declaredLineageOf`
 *   walks to decide which nodes a style reached.
 * - mergedFrom: the upward walk `declaredBoundaries` uses to decide whether a
 *   delete propagates to a merge-moved child.
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

  // The same cycle backwards, so the walks that follow the split lineage the
  // other way round meet it too.
  text.insPrevID = left.id;
  first.insPrevID = left.id;
  last.insPrevID = right.id;
  left.insPrevID = right.id;
  right.insPrevID = left.id;

  // And a mergedFrom cycle: `declaredBoundaries` prefers this pointer over the
  // physical parent when it walks upward from a position's declared parent.
  left.mergedFrom = right.id;
  right.mergedFrom = left.id;

  return tree;
}

describe('Cyclic split and merge links', function () {
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

  // `declaredBoundaries` walks upward from the element each position named as
  // its parent, preferring `mergedFrom` over the physical parent. Index 5 sits
  // inside the first cycle paragraph, so the edit's own positions put the walk
  // straight onto the mergedFrom cycle.
  it('edit declared inside the mergedFrom cycle terminates', function () {
    const tree = poisonedTree();
    const range: [CRDTTreePos, CRDTTreePos] = [
      tree.findPos(5),
      tree.findPos(7),
    ];

    tree.edit(range, undefined, 0, editedAt, () => editedAt, vector);
    assert.isString(tree.toXML());
  });

  // `declaredLineageOf` walks the ancestry of the element a style position
  // named as its parent and, for each ancestor, that ancestor's insPrevID
  // chain. A range inside the first paragraph names a parent whose chain runs
  // into the cycle; `splitFamilyOf` follows the same pointers from the other
  // end for every node the change did not know.
  it('style declared inside the insPrevID cycle terminates', function () {
    const tree = poisonedTree();
    tree.style(
      [tree.findPos(1), tree.findPos(3)],
      { b: 't' },
      editedAt,
      vector,
    );
    assert.isString(tree.toXML());
  });

  it('remove style declared inside the insPrevID cycle terminates', function () {
    const tree = poisonedTree();
    tree.removeStyle(
      [tree.findPos(1), tree.findPos(3)],
      ['b'],
      editedAt,
      vector,
    );
    assert.isString(tree.toXML());
  });
});

describe('dropSplitLinks', function () {
  it('clears the links on the node and every descendant, keeping merge stamps', function () {
    const issue = ticketer();
    const node = (type: string, value?: string) =>
      new CRDTTreeNode(CRDTTreeNodeID.of(issue(knownActor), 0), type, value);

    const root = node('r');
    const para = node('p');
    const text = node('text', 'ab');
    root.append(para);
    para.append(text);

    const other = CRDTTreeNodeID.of(issue(cycleActor), 0);
    const stamp = issue(cycleActor);
    root.insNextID = other;
    para.insPrevID = other;
    para.insNextID = other;
    text.insNextID = other;
    for (const n of [root, para, text]) {
      n.mergedFrom = other;
      n.mergedAt = stamp;
      n.mergedInto = other;
    }

    root.dropSplitLinks();

    for (const n of [root, para, text]) {
      assert.isUndefined(n.insPrevID);
      assert.isUndefined(n.insNextID);
      // The merge stamps survive: what a decoder makes of them is a
      // replicated contract the server shares, so the JS side may not drop
      // them on its own. The walks that read them are cycle-guarded, which
      // the tests above cover.
      assert.deepEqual(n.mergedFrom, other);
      assert.deepEqual(n.mergedAt, stamp);
      assert.deepEqual(n.mergedInto, other);
    }
  });
});

/*
 * A tree edit's contents are decoded node by node from depths the sender
 * wrote. Neither a content entry that holds no node nor a depth whose parent
 * was never written can come from this SDK, but both are one field edit away
 * on the wire, and a change that throws part way through decoding is one the
 * server hands back on every retry.
 */
describe('Malformed tree edit content', function () {
  /**
   * `treeEditPack` returns the wire form of a change pack whose last
   * operation is a tree edit inserting `<p>ab</p>`.
   */
  function treeEditPack(): PbChangePack {
    const doc: Document<{ t: Tree }> = new Document('d');
    doc.update((r) => {
      r.t = new Tree({ type: 'r', children: [] });
    });
    doc.update((r) =>
      r.t.edit(0, 0, {
        type: 'p',
        children: [{ type: 'text', value: 'ab' }],
      }),
    );
    return converter.toChangePack(doc.createChangePack());
  }

  /**
   * `contentsOf` returns the tree edit contents carried by the given pack.
   */
  function contentsOf(pb: PbChangePack) {
    for (const change of pb.changes) {
      for (const op of change.operations) {
        if (op.body.case === 'treeEdit') {
          return op.body.value.contents;
        }
      }
    }
    throw new Error('no tree edit in the pack');
  }

  /**
   * `lastEdit` returns the decoded tree edit operation of the given pack.
   */
  function lastEdit(pb: PbChangePack): TreeEditOperation {
    const changes = converter.fromChangePack<Indexable>(pb).getChanges();
    const ops = changes[changes.length - 1].getOperations();
    return ops[ops.length - 1] as TreeEditOperation;
  }

  it('rejects a content entry that decodes to no node', function () {
    const pb = treeEditPack();
    assert.equal(lastEdit(pb).getContents()!.length, 1);

    contentsOf(pb)[0].content = [];
    assert.throws(() => lastEdit(pb), YorkieError, /tree edit content missing/);
  });

  it('rejects a depth whose parent was never written', function () {
    const pb = treeEditPack();
    const content = contentsOf(pb)[0].content;
    // The text node, which the well-formed payload put at the paragraph's
    // depth + 1.
    content[0].depth += 2;

    assert.throws(() => lastEdit(pb), YorkieError, /invalid tree node depth/);
  });
});
