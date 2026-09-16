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
  MaxReplay,
  MinLogBytes,
  shouldCompact,
} from '@yorkie-js/sdk/src/client/persist-policy';

describe('compaction policy', () => {
  it('holds while the log is small against its snapshot', () => {
    assert.isFalse(
      shouldCompact({
        snapshotBytes: 2_770_000,
        logBytes: 70_000,
        changeCount: 200,
      }),
    );
  });

  it('compacts a small document sooner than a large one', () => {
    // This asymmetry is why the threshold cannot be a constant. Measured, an
    // 8,000-cell sheet's log reaches its snapshot size after ~6,300 edits; a
    // 5,000-character note's after ~50. Two orders of magnitude apart.
    const log = { logBytes: 70_000, changeCount: 200 };

    // A note: ~15 KB snapshot. Compacting is cheap precisely because the
    // snapshot is small — about a millisecond to serialize.
    assert.isTrue(shouldCompact({ snapshotBytes: 15_000, ...log }));

    // A sheet: 2.77 MB snapshot, ~286 ms to serialize. The same log is
    // nowhere near worth paying that.
    assert.isFalse(shouldCompact({ snapshotBytes: 2_770_000, ...log }));
  });

  it('holds a floor so a tiny snapshot does not compact every few edits', () => {
    // Without the floor, a 500-byte document would compact after two changes,
    // and the ratio alone would make the smallest documents the busiest.
    assert.isFalse(
      shouldCompact({ snapshotBytes: 500, logBytes: 2_000, changeCount: 5 }),
    );
    assert.isTrue(
      shouldCompact({
        snapshotBytes: 500,
        logBytes: MinLogBytes + 1,
        changeCount: 5,
      }),
    );
  });

  it('compacts on replay count even when the log is small', () => {
    // A separate budget from bytes: this one bounds how long a restore takes
    // to replay, which the byte rule says nothing about.
    assert.isTrue(
      shouldCompact({
        snapshotBytes: 10_000_000,
        logBytes: 1_000,
        changeCount: MaxReplay + 1,
      }),
    );
    assert.isFalse(
      shouldCompact({
        snapshotBytes: 10_000_000,
        logBytes: 1_000,
        changeCount: MaxReplay,
      }),
    );
  });

  it('does not compact an empty log', () => {
    // Covered by the floor rather than by a special case: 0 is below
    // MinLogBytes like any other small number.
    assert.isFalse(
      shouldCompact({ snapshotBytes: 0, logBytes: 0, changeCount: 0 }),
    );
  });
});
