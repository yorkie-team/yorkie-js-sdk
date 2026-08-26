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
import { maxVectorOf } from '@yorkie-js/sdk/test/helper/helper';
import { Document } from '@yorkie-js/sdk/src/document/document';
import { Text } from '@yorkie-js/sdk/src/yorkie';

const ACTOR = '000000000000000000000001';

/**
 * Regression for yorkie-team/yorkie-js-sdk#1327.
 *
 * `restore()`'s gap-recreate branch inserts a recreated node with
 * `insertAfter`, which only maintains the physical prev/next chain — it does
 * NOT relink the separate insertion chain (`insPrev`/`insNext`). So after a
 * purged interior fragment is recreated on undo, the surviving neighbours of
 * the same insertion still point their insertion pointers past the recreated
 * node (their pre-recreate links).
 *
 * A LATER edit whose boundary lands on that recreated node resolves its
 * absolute offset via `findFloorNodePreferToLeft`, which walks `insPrev`.
 * Because the recreated node was skipped in the insertion chain, the walk
 * lands on the wrong node and `findNodeWithSplit` miscomputes the relative
 * offset — dropping the edit silently or, as here, throwing because the
 * offset exceeds the resolved node's length.
 */
describe('Text restore relink (issue #1327)', () => {
  it('keeps a later boundary edit correct after a purged interior fragment is recreated', () => {
    const doc = new Document<{ t: Text }>('text-restore-relink-1327');
    doc.setActor(ACTOR);
    doc.update((r) => {
      r.t = new Text();
    });

    // Single insertion "0123456789": one node, id (t1:0).
    doc.update((r) => r.t.edit(0, 0, '0123456789'));
    assert.equal(doc.getRoot().t.toString(), '0123456789');

    // Delete the interior "45" (indices [4,6)). The node splits into
    // (t1:0)"0123" - {t1:4 "45"} - (t1:6)"6789"; the middle is tombstoned.
    doc.update((r) => r.t.edit(4, 6, ''));
    assert.equal(doc.getRoot().t.toString(), '01236789');

    // Purge the tombstone so undo cannot un-tombstone in place and must
    // recreate the "45" fragment through restore()'s gap branch.
    const purged = doc.garbageCollect(maxVectorOf([ACTOR]));
    assert.isAbove(purged, 0, 'the deleted "45" fragment should be purged');
    assert.equal(doc.getGarbageLen(), 0, 'nothing should remain pending GC');

    // Undo recreates (t1:4)"45" via insertAfter — physical chain is repaired
    // ("0123456789") but the insertion chain around it stays stale.
    doc.history.undo();
    assert.equal(
      doc.getRoot().t.toString(),
      '0123456789',
      'restore itself must rebuild the visible text',
    );

    // The bug bites here: an edit whose boundary (index 6) sits exactly at the
    // recreated node's right edge resolves through the stale insertion chain.
    doc.update((r) => r.t.edit(6, 6, 'X'));
    assert.equal(
      doc.getRoot().t.toString(),
      '012345X6789',
      'an edit at the recreated boundary must land at the right offset',
    );
  });
});
