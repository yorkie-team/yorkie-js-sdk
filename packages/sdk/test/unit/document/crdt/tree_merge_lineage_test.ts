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
import {
  CRDTTree,
  CRDTTreeNode,
  CRDTTreeNodeID,
  CRDTTreePos,
} from '@yorkie-js/sdk/src/document/crdt/tree';

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
