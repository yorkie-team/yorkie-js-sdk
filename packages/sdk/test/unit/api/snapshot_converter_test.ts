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
import { converter } from '@yorkie-js/sdk/src/api/converter';
import { Counter, Text } from '@yorkie-js/sdk/src/yorkie';

describe('snapshotToBytes', function () {
  it('should round-trip root and presences', function () {
    const doc = new Document<
      {
        obj: { nested: boolean; count: number };
        arr: Array<number | string>;
        text: Text;
        counter: Counter;
      },
      { cursor: number; name: string }
    >('test-doc');

    doc.update((root, presence) => {
      root.obj = { nested: true, count: 42 };
      root.arr = [1, 2, 'three'];
      root.text = new Text();
      root.text.edit(0, 0, 'hello');
      root.counter = new Counter(0);
      root.counter.increase(5);
      presence.set({ cursor: 7, name: 'alice' });
    });

    const rootObj = doc.getRootObject();
    const presences = new Map([
      [doc.getChangeID().getActorID(), doc.getMyPresence()],
    ]);

    const bytes = converter.snapshotToBytes(rootObj, presences);
    const restored = converter.bytesToSnapshot<{
      cursor: number;
      name: string;
    }>(bytes);

    assert.equal(rootObj.toSortedJSON(), restored.root.toSortedJSON());
    assert.deepEqual(
      Array.from(presences.entries()),
      Array.from(restored.presences.entries()),
    );
  });

  it('should round-trip an empty document', function () {
    const doc = new Document<Record<string, never>>('empty-doc');
    const rootObj = doc.getRootObject();
    const presences = new Map();

    const bytes = converter.snapshotToBytes(rootObj, presences);
    const restored = converter.bytesToSnapshot(bytes);

    assert.equal(rootObj.toSortedJSON(), restored.root.toSortedJSON());
    assert.equal(restored.presences.size, 0);
  });
});
