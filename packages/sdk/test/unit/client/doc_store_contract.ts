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
import { DocStore } from '@yorkie-js/sdk/src/client/doc-store';

/**
 * `testDocStoreContract` runs the `DocStore` contract against an
 * implementation.
 *
 * It exists as one shared suite rather than a block each implementation copies,
 * because copies diverge: the SDK's two stores once disagreed on whether
 * `saveSnapshot` keeps `meta` and whether `saveMeta` trims the log, with each
 * suite asserting its own behavior — so both were green while an app following
 * the documented contract would have been wrong.
 *
 * `factory` must return a store backed by storage unique to that call, so cases
 * do not share state.
 */
export function testDocStoreContract(
  name: string,
  factory: (scope: string) => DocStore,
): void {
  describe(`DocStore contract (${name})`, () => {
    it('answers undefined for an unknown key', async () => {
      const store = factory('unknown');
      assert.isUndefined(await store.load('nope'));
    });

    it('round-trips a snapshot with an empty log and no meta', async () => {
      const store = factory('roundtrip');
      await store.saveSnapshot('a', new Uint8Array([1, 2, 3]));

      const stored = await store.load('a');
      assert.deepEqual(Array.from(stored!.snapshot), [1, 2, 3]);
      assert.deepEqual(stored!.changes, []);
      assert.isUndefined(stored!.meta);
    });

    it('overwrites the snapshot on repeated saveSnapshot', async () => {
      const store = factory('overwrite');
      await store.saveSnapshot('a', new Uint8Array([1]));
      await store.saveSnapshot('a', new Uint8Array([2, 3]));

      assert.deepEqual(Array.from((await store.load('a'))!.snapshot), [2, 3]);
    });

    it('returns appended changes ordered by clientSeq', async () => {
      const store = factory('order');
      await store.saveSnapshot('a', new Uint8Array([0]));
      // Out of order on purpose: the store owes an ordered log, because replay
      // applies the entries in sequence.
      await store.appendChange('a', {
        clientSeq: 2,
        bytes: new Uint8Array([2]),
      });
      await store.appendChange('a', {
        clientSeq: 1,
        bytes: new Uint8Array([1]),
      });

      const stored = await store.load('a');
      assert.deepEqual(
        stored!.changes.map((c) => c.clientSeq),
        [1, 2],
      );
      assert.deepEqual(Array.from(stored!.changes[0].bytes), [1]);
    });

    it('treats appendChange as an upsert keyed by clientSeq', async () => {
      // A retried write must not become a second entry. Replaying a duplicate
      // would apply the operation twice.
      const store = factory('upsert');
      await store.saveSnapshot('a', new Uint8Array([0]));
      await store.appendChange('a', {
        clientSeq: 1,
        bytes: new Uint8Array([1]),
      });
      await store.appendChange('a', {
        clientSeq: 1,
        bytes: new Uint8Array([9]),
      });

      const stored = await store.load('a');
      assert.equal(stored!.changes.length, 1);
      assert.deepEqual(Array.from(stored!.changes[0].bytes), [9]);
    });

    it('ignores an append for a key with no entry', async () => {
      // There is no snapshot for it to be a delta against, and a row written
      // anyway is an orphan `load` cannot see.
      const store = factory('orphan');
      await store.appendChange('a', {
        clientSeq: 1,
        bytes: new Uint8Array([1]),
      });
      assert.isUndefined(await store.load('a'));
    });

    it('drops the log and the meta when the snapshot is replaced', async () => {
      // Compaction. The new snapshot already contains those changes, and it
      // embeds a newer header than meta holds — keeping either would replay
      // operations twice or regress the client's clocks.
      const store = factory('compact');
      await store.saveSnapshot('a', new Uint8Array([0]));
      await store.appendChange('a', {
        clientSeq: 1,
        bytes: new Uint8Array([1]),
      });
      await store.saveMeta('a', new Uint8Array([7]));
      await store.saveSnapshot('a', new Uint8Array([9]));

      const stored = await store.load('a');
      assert.deepEqual(Array.from(stored!.snapshot), [9]);
      assert.deepEqual(stored!.changes, []);
      assert.isUndefined(stored!.meta);
    });

    it('records meta without touching the snapshot or the log', async () => {
      // The log is the delta between the snapshot and current content as well
      // as the queue of un-pushed changes. Trimming acked entries serves the
      // queue and destroys the delta, since a push-ack does not bring the
      // snapshot forward. Only compaction trims.
      const store = factory('meta');
      await store.saveSnapshot('a', new Uint8Array([0]));
      for (const clientSeq of [1, 2, 3]) {
        await store.appendChange('a', {
          clientSeq,
          bytes: new Uint8Array([clientSeq]),
        });
      }

      await store.saveMeta('a', new Uint8Array([7]));

      const stored = await store.load('a');
      assert.deepEqual(
        stored!.changes.map((c) => c.clientSeq),
        [1, 2, 3],
      );
      assert.deepEqual(Array.from(stored!.meta!), [7]);
      assert.deepEqual(Array.from(stored!.snapshot), [0]);
    });

    it('treats saveMeta on an absent entry as a no-op', async () => {
      const store = factory('meta-absent');
      await store.saveMeta('missing', new Uint8Array([1]));
      assert.isUndefined(await store.load('missing'));
    });

    it('clears snapshot, meta and log on remove', async () => {
      const store = factory('remove');
      await store.saveSnapshot('a', new Uint8Array([1]));
      await store.saveMeta('a', new Uint8Array([2]));
      await store.appendChange('a', {
        clientSeq: 1,
        bytes: new Uint8Array([3]),
      });

      await store.remove('a');
      assert.isUndefined(await store.load('a'));
      // remove on a missing key is a no-op.
      await store.remove('missing');
    });

    it('isolates stored bytes from caller mutation on both sides', async () => {
      const store = factory('isolation');
      const snapshot = new Uint8Array([1, 2, 3]);
      const change = new Uint8Array([4, 5]);
      await store.saveSnapshot('a', snapshot);
      await store.appendChange('a', { clientSeq: 1, bytes: change });

      snapshot[0] = 99;
      change[0] = 99;
      const first = (await store.load('a'))!;
      assert.deepEqual(Array.from(first.snapshot), [1, 2, 3]);
      assert.deepEqual(Array.from(first.changes[0].bytes), [4, 5]);

      first.snapshot[1] = 88;
      first.changes[0].bytes[1] = 88;
      const second = (await store.load('a'))!;
      assert.deepEqual(Array.from(second.snapshot), [1, 2, 3]);
      assert.deepEqual(Array.from(second.changes[0].bytes), [4, 5]);
    });
  });
}
