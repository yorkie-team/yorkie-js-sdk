/*
 * Copyright 2024 The Yorkie Authors. All rights reserved.
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
 * Regression for the reversed-text undo (wafflebase#629). Typing character by
 * character makes each character its own single-char insertion. Deleting a
 * contiguous run and then undoing AFTER the tombstones were GC-purged forces
 * every character down restore's recreate path. Because no character shares an
 * insertion with any other, none of the same-insertion anchor rungs fire; each
 * recreated fragment must chain after the one placed just before it, or the run
 * comes back reversed ("my name" -> "eman ym"). Un-tombstoning (no GC) already
 * preserved order, which is why this only reproduced once the run was purged.
 */
describe('Text restore after GC', () => {
  it('recreates a purged multi-insertion run in document order on undo', () => {
    const doc = new Document<{ t: Text }>('text-restore-after-gc');
    doc.setActor(ACTOR);
    doc.update((r) => {
      r.t = new Text();
    });

    const s = 'hello my name is';
    for (let i = 0; i < s.length; i++) {
      doc.update((r) => r.t.edit(i, i, s[i]));
    }
    assert.equal(doc.getRoot().t.toString(), s);

    doc.update((r) => r.t.edit(6, 13, '')); // delete "my name"
    assert.equal(doc.getRoot().t.toString(), 'hello  is');

    // Purge the tombstones (as happens once the delete is synced/acked), so
    // undo cannot un-tombstone in place and must recreate from the spans.
    const purged = doc.garbageCollect(maxVectorOf([ACTOR]));
    assert.isAbove(purged, 0, 'the deleted run should be purged');

    doc.history.undo();
    assert.equal(
      doc.getRoot().t.toString(),
      s,
      'a purged run must be recreated in document order, not reversed',
    );
  });

  it('single-insertion run is unaffected (one recreate)', () => {
    const doc = new Document<{ t: Text }>('text-restore-after-gc-single');
    doc.setActor(ACTOR);
    doc.update((r) => {
      r.t = new Text();
    });
    doc.update((r) => r.t.edit(0, 0, 'hello my name is'));
    doc.update((r) => r.t.edit(6, 13, ''));
    doc.garbageCollect(maxVectorOf([ACTOR]));
    doc.history.undo();
    assert.equal(doc.getRoot().t.toString(), 'hello my name is');
  });
});
