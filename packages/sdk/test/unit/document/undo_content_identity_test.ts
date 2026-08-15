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
  CRDTTreeNode,
  CRDTTreePos,
} from '@yorkie-js/sdk/src/document/crdt/tree';
import { TreeEditOperation } from '@yorkie-js/sdk/src/document/operation/tree_edit_operation';
import { traverseAll } from '@yorkie-js/sdk/src/util/index_tree';

/**
 * A reverse operation that re-inserts a copy of the nodes an edit removed
 * carries their original ids. Inserting them again would put two nodes under
 * one id, which is what makes a position anchored there ambiguous. Undo gives
 * a restored value a new identity elsewhere already — `ArraySet` and `Add`
 * both take a fresh ticket in `executeUndoRedo` — and the tree's copy path is
 * the one that did not.
 */
describe('undo content identity', function () {
  /**
   * `idsOf` collects the ids of a content subtree.
   */
  function idsOf(contents: Array<CRDTTreeNode>): Array<string> {
    const ids: Array<string> = [];
    for (const content of contents) {
      traverseAll(content, (node) => ids.push(node.id.toIDString()));
    }
    return ids;
  }

  it('gives copied content a fresh identity', function () {
    const pos = CRDTTreePos.of(posT(), posT());
    const p = new CRDTTreeNode(posT(), 'p');
    p.append(new CRDTTreeNode(posT(), 'text', 'a'));
    p.append(new CRDTTreeNode(posT(), 'text', 'b'));

    const op = TreeEditOperation.create(
      timeT(),
      pos,
      pos,
      [p],
      0,
      timeT(),
      true,
    );
    const before = idsOf(op.getContents()!);

    op.reissueContentIDs(() => timeT());

    const after = idsOf(op.getContents()!);
    // The count is stated rather than derived from the same traversal the
    // reissue uses, so a traversal that skipped a node would show up here.
    assert.equal(after.length, 3, 'the <p> and its two texts');
    assert.equal(after.length, before.length);
    assert.equal(
      new Set(after).size,
      after.length,
      'every node gets its own id',
    );
    for (const id of after) {
      assert.notInclude(before, id, 'no node keeps the id it was copied from');
    }
  });

  // Deliberately over-constrained: a restore reverse is built with no contents
  // at all, so this pins the guard rather than a shape production emits.
  it('leaves a restore-mode reverse alone', function () {
    const pos = CRDTTreePos.of(posT(), posT());
    const node = new CRDTTreeNode(posT(), 'text', 'a');
    const op = TreeEditOperation.create(
      timeT(),
      pos,
      pos,
      [node],
      0,
      timeT(),
      true,
      undefined,
      undefined,
      [],
      'restore',
      [],
    );
    const before = idsOf(op.getContents()!);

    op.reissueContentIDs(() => timeT());

    assert.deepEqual(
      idsOf(op.getContents()!),
      before,
      'a restore revives nodes by identity and must keep it',
    );
  });

  it('assigns ids that a later reissue does not repeat', function () {
    const pos = CRDTTreePos.of(posT(), posT());
    const first = new CRDTTreeNode(posT(), 'text', 'a');
    const second = new CRDTTreeNode(posT(), 'text', 'a');

    const opA = TreeEditOperation.create(
      timeT(),
      pos,
      pos,
      [first],
      0,
      timeT(),
      true,
    );
    const opB = TreeEditOperation.create(
      timeT(),
      pos,
      pos,
      [second],
      0,
      timeT(),
      true,
    );

    opA.reissueContentIDs(() => timeT());
    opB.reissueContentIDs(() => timeT());

    assert.notDeepEqual(idsOf(opA.getContents()!), idsOf(opB.getContents()!));
  });
});
