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
import { posT, timeT, vectorOf } from '@yorkie-js/sdk/test/helper/helper';
import {
  CRDTTree,
  CRDTTreeNode,
  CRDTTreeNodeID,
  CRDTTreePos,
} from '@yorkie-js/sdk/src/document/crdt/tree';
import { VersionVector } from '@yorkie-js/sdk/src/document/time/version_vector';
import { TimeTicket } from '@yorkie-js/sdk/src/document/time/ticket';

/**
 * A merge pointer (`mergedFrom`, and the `mergedInto` derived from it) is not
 * always server-derived: an element payload (Set/Add/ArraySet) keeps the
 * lineage a reverse-of-Remove legitimately carries, so both ends of a merge
 * relation can be client-supplied. Every reader therefore resolves them to
 * the exact element they name, never to a floor match or a text node. These
 * mirror yorkie's `tree_merge_lineage_test.go` (yorkie#2033).
 */

type Fixture = {
  tree: CRDTTree;
  p1: CRDTTreeNode;
  p2: CRDTTreeNode;
  p3: CRDTTreeNode;
  text: CRDTTreeNode;
};

/**
 * `buildFixture` builds <r><p></p><p>cd</p><p></p></r>: p1 is the merge
 * destination, p2 holds the text that carries a lineage, and p3 is the
 * unrelated live element a forged pointer tries to name.
 */
function buildFixture(): Fixture {
  const tree = new CRDTTree(new CRDTTreeNode(posT(), 'r'), timeT());
  const [p1ID, p2ID, p3ID, textID] = [posT(), posT(), posT(), posT()];
  tree.editT([0, 0], [new CRDTTreeNode(p1ID, 'p')], 0, timeT(), timeT);
  tree.editT([2, 2], [new CRDTTreeNode(p2ID, 'p')], 0, timeT(), timeT);
  tree.editT(
    [3, 3],
    [new CRDTTreeNode(textID, 'text', 'cd')],
    0,
    timeT(),
    timeT,
  );
  tree.editT([6, 6], [new CRDTTreeNode(p3ID, 'p')], 0, timeT(), timeT);
  assert.equal(tree.toXML(), /*html*/ `<r><p></p><p>cd</p><p></p></r>`);

  return {
    tree,
    p1: tree.findFloorNode(p1ID)!,
    p2: tree.findFloorNode(p2ID)!,
    p3: tree.findFloorNode(p3ID)!,
    text: tree.findFloorNode(textID)!,
  };
}

/**
 * `buildSplitFixture` builds <r><p><p></p><p></p></p></r> where the second
 * inner element carries a merge stamp naming the first -- the shape Fix 8 in
 * `splitElement` reads: a merge-moved child whose source is a sibling at the
 * same level. The merge ticket carries a lamport past both ids, so the
 * returned version vector knows the children but not the merge.
 */
function buildSplitFixture(approximated: boolean): {
  p: CRDTTreeNode;
  a: CRDTTreeNode;
  b: CRDTTreeNode;
  versionVector: VersionVector;
} {
  const root = new CRDTTreeNode(posT(), 'r');
  const p = new CRDTTreeNode(posT(), 'p');
  root.append(p);
  const a = new CRDTTreeNode(posT(), 'p');
  const b = new CRDTTreeNode(posT(), 'p');
  p.append(a, b);

  const createdAt = b.id.getCreatedAt();
  b.mergedFrom = a.id;
  b.mergedAt = TimeTicket.of(
    createdAt.getLamport() + 1n,
    0,
    createdAt.getActorID(),
  );
  b.mergedAtApproximated = approximated ? true : undefined;

  // Knows b's own creation -- otherwise §7.3 boundary insert migration would
  // pull b left on its own and hide what Fix 8 decided -- but not the merge.
  const versionVector = vectorOf([
    { c: createdAt.getActorID(), l: createdAt.getLamport() },
  ]);
  assert.isFalse(versionVector.afterOrEqual(b.mergedAt));

  return { p, a, b, versionVector };
}

/**
 * `buildRecreateFixture` builds <r><p><p></p></p><p>cd</p></r>: `target` is
 * the node a split cut, holding the merge source tombstone and no leftover
 * stamp, and `product` is the split product holding the moved child whole --
 * the shape `mergeSourceOf` reads as "this split reversed that merge". The
 * stamp on the moved child is varied, because that is what the reader has to
 * agree with Fix 8's split placement about.
 */
function buildRecreateFixture(stamp: 'exact' | 'approximated' | 'absent'): {
  tree: CRDTTree;
  target: CRDTTreeNode;
  product: CRDTTreeNode;
  source: CRDTTreeNode;
  moved: CRDTTreeNode;
} {
  const root = new CRDTTreeNode(posT(), 'r');
  const target = new CRDTTreeNode(posT(), 'p');
  const product = new CRDTTreeNode(posT(), 'p');
  root.append(target, product);
  const source = new CRDTTreeNode(posT(), 'p');
  target.append(source);
  const moved = new CRDTTreeNode(posT(), 'text', 'cd');
  product.append(moved);
  // A merge tombstones the boundary element before moving its children out.
  source.removedAt = timeT();

  const tree = new CRDTTree(root, timeT());
  moved.mergedFrom = source.id;
  moved.mergedAt = stamp === 'absent' ? undefined : source.removedAt;
  moved.mergedAtApproximated = stamp === 'approximated' ? true : undefined;

  return { tree, target, product, source, moved };
}

/**
 * `forgedIDOf` returns an id with the node's createdAt and an offset the node
 * never had: a floor lookup answers with the node, an exact lookup does not.
 */
function forgedIDOf(node: CRDTTreeNode): CRDTTreeNodeID {
  return CRDTTreeNodeID.of(node.id.getCreatedAt(), node.id.getOffset() + 9);
}

describe('Tree merge lineage', () => {
  it('rebuildMergeState should not plant a pointer through a forged source', () => {
    const f = buildFixture();
    // Tombstoned, so the "a live element is never a merge source" guard is
    // satisfied and the forged offset is the only thing left to reject it:
    // the test fails if `findMergeNode` here goes back to a floor lookup.
    f.p3.removedAt = timeT();
    f.text.mergedFrom = forgedIDOf(f.p3);
    f.text.mergedAt = timeT();

    // Re-read exactly as the converter re-reads an element payload.
    new CRDTTree(f.tree.getRoot(), timeT());

    assert.isUndefined(
      f.p3.mergedInto,
      'a later delete would follow this pointer and tombstone p3 children',
    );
  });

  it('rebuildMergeState should still rebuild a genuine source', () => {
    const f = buildFixture();
    // A genuine source is a tombstone: the merge removes the boundary element
    // before moving its children out of it.
    f.p3.removedAt = timeT();
    f.text.mergedFrom = f.p3.id;
    f.text.mergedAt = timeT();

    new CRDTTree(f.tree.getRoot(), timeT());

    assert.isTrue(f.p3.mergedInto?.equals(f.p2.id));
  });

  it('rebuildMergeState should not plant a pointer on a live source', () => {
    // The id is exact and names an element, so the shape checks pass; only
    // the source being live says no merge ever moved these children. Planting
    // here would arm the §6.2 cascade to tombstone p3's own children the
    // moment a later, unrelated edit removes p3.
    const f = buildFixture();
    f.text.mergedFrom = f.p3.id;
    f.text.mergedAt = timeT();
    assert.isUndefined(f.p3.removedAt);

    new CRDTTree(f.tree.getRoot(), timeT());

    assert.isUndefined(f.p3.mergedInto);
  });

  it('rebuildMergeState should not name a text node as a source', () => {
    const f = buildFixture();
    // Removed as a genuine source would be, so only its being a text node
    // rejects it: the id is exact and the child's parent is an element.
    f.text.removedAt = timeT();
    f.p2.mergedFrom = f.text.id;
    f.p2.mergedAt = timeT();

    new CRDTTree(f.tree.getRoot(), timeT());

    assert.isUndefined(f.text.mergedInto);
  });

  it('rebuildMergeState should not name a text node as a destination', () => {
    // A merge moves children under an element, so a child sitting under a
    // text node cannot be one a merge moved. `prepend` refuses the shape, so
    // plant it directly, as a decoder that did not check would.
    const f = buildFixture();
    // Exact and tombstoned, so the source passes every other guard and only
    // the destination being a text node is left to reject the pointer.
    f.p3.removedAt = timeT();
    const child = new CRDTTreeNode(posT(), 'text', 'x');
    child.mergedFrom = f.p3.id;
    child.mergedAt = timeT();
    f.text._children.push(child);
    child.parent = f.text;

    new CRDTTree(f.tree.getRoot(), timeT());

    assert.isUndefined(f.p3.mergedInto);
  });

  it('a merge should not re-derive a pointer from a forged source', () => {
    // The lineage stays on the node inside the live document, and a merge
    // re-derives `mergedInto` from it whenever it moves that node again.
    // Resolved by floor there, the forged offset would plant on p3 the
    // pointer the decode refused to.
    const f = buildFixture();
    // Tombstoned, as a genuine source is, so the merge's own "the source must
    // already be removed" guard cannot be what rejects this: the forged
    // offset has to be, which is what `findMergeNode` is here for.
    f.p3.removedAt = timeT();
    f.text.mergedFrom = forgedIDOf(f.p3);
    f.text.mergedAt = timeT();

    // An ordinary merge of p2 into p1 moves the text carrying the lineage.
    f.tree.editT([1, 3], undefined, 0, timeT(), timeT);
    assert.equal(f.tree.toXML(), /*html*/ `<r><p>cd</p></r>`);

    assert.isUndefined(
      f.p3.mergedInto,
      'an ordinary merge must not plant a pointer on an unrelated node',
    );
  });

  it('a merge should not re-derive a pointer onto a live source', () => {
    // Same path, the other half of the rule: the id is exact and names an
    // element, so only p3 still being live says no merge ever moved this
    // text out of it. Planting here would arm the §6.2 cascade to tombstone
    // p3's own children the moment a later, unrelated edit removes p3.
    const f = buildFixture();
    f.text.mergedFrom = f.p3.id;
    f.text.mergedAt = timeT();
    assert.isUndefined(f.p3.removedAt);

    f.tree.editT([1, 3], undefined, 0, timeT(), timeT);
    assert.equal(f.tree.toXML(), /*html*/ `<r><p>cd</p><p></p></r>`);

    assert.isUndefined(
      f.p3.mergedInto,
      'an ordinary merge must not plant a pointer on a live node',
    );
  });

  it('a merge should still re-derive a pointer from its own source', () => {
    // The positive control for both guards above: in a merge the engine
    // itself stamps, the source is the boundary element step 02 tombstoned,
    // named exactly, so the pointer must still be planted.
    const f = buildFixture();

    f.tree.editT([1, 3], undefined, 0, timeT(), timeT);
    assert.equal(f.tree.toXML(), /*html*/ `<r><p>cd</p><p></p></r>`);

    assert.isTrue(f.text.mergedFrom?.equals(f.p2.id));
    assert.isTrue(f.p2.isRemoved);
    assert.isTrue(f.p2.mergedInto?.equals(f.p1.id));
  });

  it('a delete should not cascade through a floor-only destination', () => {
    // p1 holds a child whose lineage names p2, and p2's pointer floors onto
    // p1 without naming it. Deleting p2 must not tombstone p1's child.
    const f = buildFixture();
    f.tree.editT(
      [1, 1],
      [new CRDTTreeNode(posT(), 'text', 'ab')],
      0,
      timeT(),
      timeT,
    );
    const ab = f.p1.allChildren[0];
    ab.mergedFrom = f.p2.id;
    ab.mergedAt = timeT();
    f.p2.mergedInto = forgedIDOf(f.p1);

    // Delete p2 whole: <r><p>ab</p>|<p>cd</p>|<p></p></r>.
    f.tree.editT([4, 8], undefined, 0, timeT(), timeT);

    assert.equal(f.tree.toXML(), /*html*/ `<r><p>ab</p><p></p></r>`);
  });

  it('a redirected insert should keep an exact merge ticket exact', () => {
    // Positive control for the two tests below: the sibling the merge moved
    // still carries the merge's own ticket, so the content copied from it is
    // a genuine witness and must not be flagged.
    const f = buildFixture();
    f.tree.editT([1, 3], undefined, 0, timeT(), timeT);
    const mergedAt = f.text.mergedAt!;

    const pos = CRDTTreePos.of(f.p2.id, f.p2.id);
    const inserted = new CRDTTreeNode(posT(), 'text', 'x');
    f.tree.edit([pos, pos], [inserted], 0, timeT(), timeT);

    assert.strictEqual(inserted.parent, f.p1);
    assert.isTrue(inserted.mergedAt?.equals(mergedAt));
    assert.isUndefined(inserted.mergedAtApproximated);
  });

  it('a redirected insert should flag a merge ticket it only approximated', () => {
    // §9.4 stamps content redirected into the merge target with the ticket it
    // reads off a sibling the merge moved. An approximation does not become
    // exact by being copied: unflagged, it would be accepted as a §4.1
    // cascade witness (`sawMergedBack`) on a replica whose own copy declines.
    const f = buildFixture();
    f.tree.editT([1, 3], undefined, 0, timeT(), timeT);
    assert.isTrue(f.text.mergedFrom?.equals(f.p2.id));
    // As `rebuildMergeState` leaves it on a pre-`mergedAt` snapshot.
    f.text.mergedAtApproximated = true;

    const pos = CRDTTreePos.of(f.p2.id, f.p2.id);
    const inserted = new CRDTTreeNode(posT(), 'text', 'x');
    f.tree.edit([pos, pos], [inserted], 0, timeT(), timeT);

    assert.strictEqual(inserted.parent, f.p1);
    assert.isTrue(inserted.mergedFrom?.equals(f.p2.id));
    assert.isTrue(inserted.mergedAtApproximated);
  });

  it('a redirected insert should flag a fallback to the source tombstone', () => {
    // No moved sibling left to read the merge's own ticket from, so the stamp
    // falls back to the source's `removedAt` -- the LWW-mutable value the flag
    // exists to reject.
    const f = buildFixture();
    f.tree.editT([1, 3], undefined, 0, timeT(), timeT);
    f.text.mergedAt = undefined;

    const pos = CRDTTreePos.of(f.p2.id, f.p2.id);
    const inserted = new CRDTTreeNode(posT(), 'text', 'y');
    f.tree.edit([pos, pos], [inserted], 0, timeT(), timeT);

    assert.isTrue(inserted.mergedAt?.equals(f.p2.removedAt!));
    assert.isTrue(inserted.mergedAtApproximated);
  });

  it('purgeBarrierAt should hold back a subtree holding a merge witness', () => {
    // `purge` unlinks the node together with its whole subtree in one
    // `removeChild`, and the collector consults the barrier only for the pair
    // it is about to purge. A witness below the node therefore has to hold
    // the node itself back, or it disappears while the source it speaks for
    // is still linked.
    const f = buildFixture();
    f.tree.editT([1, 3], undefined, 0, timeT(), timeT);
    assert.isTrue(f.text.mergedFrom?.equals(f.p2.id));
    // Tombstone the merge target itself; the witness rides along inside it.
    f.p1.remove(timeT());

    const barrier = f.tree.purgeBarrierAt(f.p1);

    assert.isTrue(
      barrier?.equals(f.p2.removedAt!),
      'the barrier must cover the removal of the source the witness speaks for',
    );
  });

  it('restore should demote the merge stamps of a witness it revives', () => {
    // A `TreeRestoreSpan` carries no merge lineage, so a replica that purged
    // the witness recreates it without stamps. The replica that still held
    // the tombstone must not come back with a genuine witness the other one
    // cannot have.
    const f = buildFixture();
    f.tree.editT([1, 3], undefined, 0, timeT(), timeT);
    assert.isTrue(f.text.mergedFrom?.equals(f.p2.id));
    assert.isUndefined(f.text.mergedAtApproximated);

    f.tree.editT([1, 3], undefined, 0, timeT(), timeT);
    assert.isTrue(f.text.isRemoved);

    f.tree.restore(
      [
        {
          id: f.text.id,
          nodeType: 'text',
          isText: true,
          length: 2,
          value: 'cd',
          parentID: f.p1.id,
        },
      ],
      timeT(),
    );

    assert.isFalse(f.text.isRemoved);
    assert.isTrue(f.text.mergedAtApproximated);
  });

  it('splitElement should keep an exact merge stamp in the left half', () => {
    // Positive control for the test below: an unflagged ticket is the merge's
    // own, the snapshot encoding carries it verbatim, so Fix 8 reads the same
    // value on every replica and holds the merge-moved child at its level.
    const f = buildSplitFixture(false);

    const [clone] = f.p.splitElement(1, timeT, f.versionVector);

    assert.deepEqual(f.p._children, [f.a, f.b]);
    assert.deepEqual(clone!._children, []);
  });

  it('splitElement should decline a merge stamp it only approximated', () => {
    // The flag is not on the wire, so `toTreeNodes` does not encode a flagged
    // ticket at all: a replica that loads the snapshot re-derives it from the
    // source's LWW-mutable `removedAt`, or -- when the source is no longer a
    // tombstone in the tree -- never gets one. Comparing it here would place
    // this child by how a replica reached its state. Declining is the one
    // answer both routes can give.
    const f = buildSplitFixture(true);

    const [clone] = f.p.splitElement(1, timeT, f.versionVector);

    assert.deepEqual(f.p._children, [f.a]);
    assert.deepEqual(clone!._children, [f.b]);
  });

  it('mergeSourceOf should name the source behind an exact merge stamp', () => {
    // Positive control for the two tests below: the split product holds the
    // source's children whole and the stamp is the merge's own, so the
    // product is the source's stand-in and undo history re-points at it.
    const f = buildRecreateFixture('exact');

    const recreated = (f.tree as any).mergeSourceOf(f.product, f.target);

    assert.isTrue(recreated?.equals(f.source.id));
  });

  it('mergeSourceOf should decline a merge stamp only approximated', () => {
    // `mergeSourceOf` reads the placement Fix 8 decides, and Fix 8 declines a
    // flagged stamp -- so a flagged child now lands in the product rather
    // than being held on the left. Reading it here as proof the split
    // reversed the merge would re-point undo history off an approximation
    // neither reader of the ticket trusts.
    const f = buildRecreateFixture('approximated');

    const recreated = (f.tree as any).mergeSourceOf(f.product, f.target);

    assert.isUndefined(recreated);
  });

  it('mergeSourceOf should decline a stamp the snapshot route has none of', () => {
    // A demoted stamp keeps a flagged ticket on the replica that applied the
    // ops, while the replica that loads the snapshot gets no ticket at all:
    // the converter does not encode a flagged one. Both shapes have to be
    // declined, or the two replicas re-point undo history differently.
    const f = buildRecreateFixture('absent');

    const recreated = (f.tree as any).mergeSourceOf(f.product, f.target);

    assert.isUndefined(recreated);
  });

  it('rebuildMergeState should keep a merge ticket inside the source lifetime', () => {
    // Positive control for the two tests below: a ticket within the window
    // the source was in the tree for is one a genuine merge could have
    // stamped, so it survives the decode as the merge's own.
    const f = buildFixture();
    f.p3.removedAt = timeT();
    f.text.mergedFrom = f.p3.id;
    f.text.mergedAt = f.p3.removedAt;

    new CRDTTree(f.tree.getRoot(), timeT());

    assert.isTrue(f.text.mergedAt?.equals(f.p3.removedAt!));
    assert.isUndefined(f.text.mergedAtApproximated);
  });

  it('rebuildMergeState should reject a merge ticket predating the source', () => {
    // `mergedAt` rides the same client-supplied element payload `mergedFrom`
    // does. A low-lamport ticket is reported as known by every replica's
    // version vector, so an unflagged one would make `sawMergedBack` answer
    // yes everywhere and drive the §4.1 cascade through a sibling into live
    // content. No merge can have removed the source before it existed.
    const f = buildFixture();
    f.p3.removedAt = timeT();
    const createdAt = f.p3.id.getCreatedAt();
    f.text.mergedFrom = f.p3.id;
    f.text.mergedAt = TimeTicket.of(
      createdAt.getLamport() - 1n,
      0,
      createdAt.getActorID(),
    );

    new CRDTTree(f.tree.getRoot(), timeT());

    // Replaced by the back-fill and flagged, so every reader declines it.
    assert.isTrue(f.text.mergedAt?.equals(f.p3.removedAt!));
    assert.isTrue(f.text.mergedAtApproximated);
    // The pointer itself is still rebuilt: the source checks all passed.
    assert.isTrue(f.p3.mergedInto?.equals(f.p2.id));
  });

  it('rebuildMergeState should reject a merge ticket past the source tombstone', () => {
    // `remove` keeps the NEWEST tombstone, so the ticket that first removed
    // the source is at or before whatever stands in `removedAt` now. A later
    // one names a merge that cannot have happened.
    const f = buildFixture();
    f.p3.removedAt = timeT();
    const removedAt = f.p3.removedAt;
    f.text.mergedFrom = f.p3.id;
    f.text.mergedAt = TimeTicket.of(
      removedAt.getLamport() + 1n,
      0,
      removedAt.getActorID(),
    );

    new CRDTTree(f.tree.getRoot(), timeT());

    assert.isTrue(f.text.mergedAt?.equals(f.p3.removedAt!));
    assert.isTrue(f.text.mergedAtApproximated);
  });

  it('resolveMergeTarget should not forward to a text node', () => {
    const f = buildFixture();
    f.p1.removedAt = timeT();
    f.p1.mergedInto = f.text.id;

    const target = (f.tree as any).resolveMergeTarget(f.p1);

    assert.strictEqual(target, f.p1);
  });

  it('an insert should not be redirected into a text node', () => {
    // §1.1 redirects an insert at the leftmost of a merged-away parent into
    // its merge target. A text node can hold no children, so a pointer naming
    // one must fall through to the normal path.
    const f = buildFixture();
    f.tree.editT([0, 2], undefined, 0, timeT(), timeT);
    assert.equal(f.tree.toXML(), /*html*/ `<r><p>cd</p><p></p></r>`);
    f.p1.mergedInto = f.text.id;

    const pos = CRDTTreePos.of(f.p1.id, f.p1.id);
    const inserted = new CRDTTreeNode(posT(), 'text', 'x');
    f.tree.edit([pos, pos], [inserted], 0, timeT(), timeT);

    // `toXML` renders a text node's own value and never walks its children,
    // so the XML is identical whether the redirect fired or not: assert on
    // where the node actually landed instead. The fall-through parks it
    // under the removed p1, where the born-dead branch tombstones it.
    assert.strictEqual(inserted.parent, f.p1);
    assert.equal(f.text.allChildren.length, 0);
    assert.equal(f.tree.toXML(), /*html*/ `<r><p>cd</p><p></p></r>`);
  });
});
