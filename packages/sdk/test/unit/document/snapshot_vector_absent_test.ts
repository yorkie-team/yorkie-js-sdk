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
import { Document } from '@yorkie-js/sdk/src/document/document';

describe('Snapshot with an absent version vector', function () {
  it('should apply a snapshot pack that omits its version vector', function () {
    // `ChangePack.versionVector` is optional on the wire, so a pack can
    // arrive without one. `applySnapshot` used to take it through a non-null
    // assertion at the call site and dereference it immediately
    // (`snapshotVector.maxLamport()`), which is a TypeError, not a decode
    // error -- the document is left half-applied and the server redelivers
    // the same pack forever.
    const doc = new Document<{ k1: string }>('test-doc');
    doc.update((root) => {
      root.k1 = 'v1';
    });
    const lamport = doc.getChangeID().getLamport();

    assert.doesNotThrow(() => doc.applySnapshot(3n, undefined, undefined));

    // With no clocks to learn from, the lamport still has to move: the
    // snapshot is a change this replica applied. (It moves twice -- once in
    // `setClocks`, once replaying the local change the snapshot does not
    // carry -- so pin the direction, not the exact value.)
    assert.isTrue(doc.getChangeID().getLamport() > lamport);
  });
});
