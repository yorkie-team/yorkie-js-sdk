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
import { Tree, TimeTicket } from '@yorkie-js/sdk/src/yorkie';
import { History } from '@yorkie-js/sdk/src/document/history';
import { TreeStyleOperation } from '@yorkie-js/sdk/src/document/operation/tree_style_operation';
import {
  CRDTTreeNodeID,
  CRDTTreePos,
} from '@yorkie-js/sdk/src/document/crdt/tree';
import { converter } from '@yorkie-js/sdk/src/api/converter';
import { ChangePack as PbChangePack } from '@yorkie-js/sdk/src/api/yorkie/v1/resources_pb';
import { ChangePack } from '@yorkie-js/sdk/src/document/change/change_pack';
import { Checkpoint } from '@yorkie-js/sdk/src/document/change/checkpoint';
import { InitialVersionVector } from '@yorkie-js/sdk/src/document/time/version_vector';
import { maxVectorOf } from '@yorkie-js/sdk/test/helper/helper';

type TestDoc = Document<{ t: Tree }>;

function newActor(actor: string): TestDoc {
  const doc: TestDoc = new Document('d');
  doc.setActor(actor);
  return doc;
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

/** `hello world` in an inline in a paragraph — two levels to split. */
function seed(doc: TestDoc): void {
  doc.update((r) => {
    r.t = new Tree({
      type: 'root',
      children: [
        {
          type: 'paragraph',
          children: [
            {
              type: 'inline',
              children: [{ type: 'text', value: 'hello world' }],
            },
          ],
        },
      ],
    });
  });
}

/** `<p>ab</p><p>cd</p>` — two blocks to merge and split again. */
function seedBlocks(doc: TestDoc): void {
  doc.update((r) => {
    r.t = new Tree({
      type: 'root',
      children: [
        { type: 'p', children: [{ type: 'text', value: 'ab' }] },
        { type: 'p', children: [{ type: 'text', value: 'cd' }] },
      ],
    });
  });
}

/** Purges the tombstones both replicas have seen. */
function collectBoth(a: TestDoc, b: TestDoc): void {
  const vector = maxVectorOf([
    a.getChangeID().getActorID(),
    b.getChangeID().getActorID(),
  ]);
  a.garbageCollect(vector);
  b.garbageCollect(vector);
}

describe('Tree redo of a split and a style in one change', () => {
  const cases: Array<{ name: string; edit: (t: Tree) => void }> = [
    {
      name: 'split in the middle, bold the right piece',
      edit: (t) => {
        t.editByPath([0, 0, 6], [0, 0, 6], undefined, 1);
        t.styleByPath([0, 1], { bold: 'true' });
      },
    },
    {
      name: 'split at the end, bold the empty piece',
      edit: (t) => {
        t.editByPath([0, 0, 11], [0, 0, 11], undefined, 1);
        t.styleByPath([0, 1], { bold: 'true' });
      },
    },
    {
      // Two levels: the split mints an inline AND a paragraph, so the
      // `replacedIDs` -> split-ticket pairing has to line up innermost first.
      name: 'split two levels, bold the new paragraph',
      edit: (t) => {
        t.editByPath([0, 0, 6], [0, 0, 6], undefined, 2);
        t.styleByPath([1], { bold: 'true' });
      },
    },
    {
      // ... and here the style names the inner element the second ticket did
      // NOT mint, which only resolves if the pairing is right.
      name: 'split two levels, bold the new inline',
      edit: (t) => {
        t.editByPath([0, 0, 6], [0, 0, 6], undefined, 2);
        t.styleByPath([1, 0], { bold: 'true' });
      },
    },
    {
      // A tree EDIT, not a style, follows the split: its reverse travels as
      // identity-preserving restore spans, which name the split-created
      // element as their parent and have to be re-pointed too.
      name: 'split, then insert into the new element',
      edit: (t) => {
        t.editByPath([0, 0, 6], [0, 0, 6], undefined, 1);
        t.editByPath([0, 1, 0], [0, 1, 0], { type: 'text', value: 'X' });
      },
    },
  ];

  for (const { name, edit } of cases)
    for (const collect of [false, true]) {
      it(`lets a peer apply the redo: ${name}${collect ? ', after GC' : ''}`, () => {
        const a = newActor('000000000000000000000001');
        const b = newActor('000000000000000000000002');
        seed(a);
        a.clearHistory();
        feed(b, grab(a));

        a.update((r) => edit(r.t));
        const edited = a.getRoot().t.toXML();
        feed(b, grab(a));
        assert.equal(b.getRoot().t.toXML(), edited, 'edit');

        a.history.undo();
        feed(b, grab(a));
        const undone = a.getRoot().t.toXML();
        assert.equal(b.getRoot().t.toXML(), undone, 'undo');
        // Both have seen the undo, so its tombstones can be purged.
        if (collect) collectBoth(a, b);

        a.history.redo();
        assert.equal(a.getRoot().t.toXML(), edited, 'redo, locally');
        feed(b, grab(a));
        assert.equal(b.getRoot().t.toXML(), edited, 'redo, on the peer');

        // A second round trip: the redo re-minted the split elements, so the
        // entry it pushed onto the undo stack has to name the new ones.
        a.history.undo();
        feed(b, grab(a));
        assert.equal(a.getRoot().t.toXML(), undone, 'second undo, locally');
        assert.equal(b.getRoot().t.toXML(), undone, 'second undo, on the peer');
        a.history.redo();
        feed(b, grab(a));
        assert.equal(a.getRoot().t.toXML(), edited, 'second redo, locally');
        assert.equal(b.getRoot().t.toXML(), edited, 'second redo, on the peer');
      });
    }

  // The split and the operation naming its elements are in DIFFERENT history
  // entries here, so nothing in the popped entry re-points the latter: only
  // `History.reconcileTreeNodeID`, sweeping the stacks, can.
  for (const collect of [false, true]) {
    it(`re-points another history entry at the re-split elements${
      collect ? ', after GC' : ''
    }`, () => {
      const a = newActor('000000000000000000000001');
      const b = newActor('000000000000000000000002');
      seed(a);
      a.clearHistory();
      feed(b, grab(a));

      // Entry 1: the split. Entry 2: a style naming what it created.
      a.update((r) => r.t.editByPath([0, 0, 6], [0, 0, 6], undefined, 1));
      const split = a.getRoot().t.toXML();
      a.update((r) => r.t.styleByPath([0, 1], { bold: 'true' }));
      const styled = a.getRoot().t.toXML();
      feed(b, grab(a));
      assert.equal(b.getRoot().t.toXML(), styled, 'edits');

      // Undo the style, then the split. The redo stack now holds a re-split
      // entry and, above it, a style entry naming the pre-split element.
      a.history.undo();
      feed(b, grab(a));
      a.history.undo();
      feed(b, grab(a));
      const merged = a.getRoot().t.toXML();
      assert.equal(b.getRoot().t.toXML(), merged, 'both undone');
      if (collect) collectBoth(a, b);

      // Redoing the split mints new elements; the style entry still on the
      // stack has to follow them, or the peer cannot apply it.
      a.history.redo();
      feed(b, grab(a));
      assert.equal(a.getRoot().t.toXML(), split, 'redo split, locally');
      assert.equal(b.getRoot().t.toXML(), split, 'redo split, on the peer');
      if (collect) collectBoth(a, b);

      a.history.redo();
      assert.equal(a.getRoot().t.toXML(), styled, 'redo style, locally');
      feed(b, grab(a));
      assert.equal(b.getRoot().t.toXML(), styled, 'redo style, on the peer');
    });
  }
});

// Not an undo/redo: a peer merges two blocks, then a plain split separates
// them again, re-creating the merged-away block under a new id. A history
// entry naming the old block has to follow it, whichever replica split.
describe('Tree split that re-creates a block a merge took away', () => {
  it('re-points the history when the split is a local edit', () => {
    const a = newActor('000000000000000000000001');
    const b = newActor('000000000000000000000002');
    seedBlocks(a);
    a.clearHistory();
    feed(b, grab(a));

    // a's entry names the second block; b merges it into the first.
    a.update((r) => r.t.styleByPath([1], { bold: 'true' }));
    feed(b, grab(a));
    b.update((r) => r.t.editByPath([0, 2], [1, 0]));
    feed(a, grab(b));

    // a splits the blocks apart again, then the merged-away block is purged.
    a.update((r) => r.t.editByPath([0, 2], [0, 2], undefined, 1));
    feed(b, grab(a));
    collectBoth(a, b);

    a.history.undo();
    feed(b, grab(a));
    a.history.undo();
    feed(b, grab(a));
    assert.equal(b.getRoot().t.toXML(), a.getRoot().t.toXML());
  });

  it('re-points the history when the split arrives from a peer', () => {
    const a = newActor('000000000000000000000001');
    const b = newActor('000000000000000000000002');
    seedBlocks(a);
    a.clearHistory();
    feed(b, grab(a));

    // b's entry names the second block; a merges it away and splits again.
    b.update((r) => r.t.styleByPath([1], { bold: 'true' }));
    feed(a, grab(b));
    a.update((r) => r.t.editByPath([0, 2], [1, 0]));
    a.update((r) => r.t.editByPath([0, 2], [0, 2], undefined, 1));
    feed(b, grab(a));
    collectBoth(a, b);

    b.history.undo();
    feed(a, grab(b));
    assert.equal(a.getRoot().t.toXML(), b.getRoot().t.toXML());
  });
});

// A node id is only unique inside its own tree, and the pairs that drive the
// sweep arrive from a peer's change as well as this replica's own. An entry
// recorded against a DIFFERENT tree element must come through untouched, or a
// split in one tree silently re-addresses pending work in another.
describe('History.reconcileTreeNodeID', () => {
  it('re-points only the entries targeting the same tree', () => {
    const actor = '000000000000000000000001';
    const tick = (lamport: number) => TimeTicket.of(BigInt(lamport), 0, actor);
    const treeA = tick(1);
    const treeB = tick(2);
    const prev = CRDTTreeNodeID.of(tick(10), 0);
    const curr = CRDTTreeNodeID.of(tick(20), 0);
    const posAt = (id: CRDTTreeNodeID) => CRDTTreePos.of(id, id);
    const styleOn = (parentCreatedAt: TimeTicket) =>
      TreeStyleOperation.create(
        parentCreatedAt,
        posAt(prev),
        posAt(prev),
        new Map([['bold', 'true']]),
        tick(30),
      );

    const history = new History<Indexable>();
    const onA = styleOn(treeA);
    const onB = styleOn(treeB);
    history.pushUndo([onA, onB]);

    history.reconcileTreeNodeID(treeA, prev, curr);

    const parentOf = (op: TreeStyleOperation) =>
      op.getFromPos().getParentID().getCreatedAt();
    assert.equal(
      parentOf(onA).compare(curr.getCreatedAt()),
      0,
      'the entry on the split tree follows the new id',
    );
    assert.equal(
      parentOf(onB).compare(prev.getCreatedAt()),
      0,
      'the entry on another tree keeps its own id',
    );
  });
});
