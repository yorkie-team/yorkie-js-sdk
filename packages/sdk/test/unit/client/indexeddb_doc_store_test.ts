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

// The vitest environment (node/jsdom) does not provide `indexedDB`, so we load
// the standard `fake-indexeddb` shim to make it globally available.
import 'fake-indexeddb/auto';
import { describe, it, assert } from 'vitest';
import { IndexedDBDocStore } from '@yorkie-js/sdk/src/client/doc-store';

/**
 * `newStore` returns an `IndexedDBDocStore` scoped to a unique database name so
 * the tests do not share persisted state through the process-global IndexedDB.
 */
let dbCounter = 0;
function newStore(): IndexedDBDocStore {
  return new IndexedDBDocStore(`yorkie-test-${dbCounter++}`);
}

describe('IndexedDBDocStore', function () {
  it('should round-trip bytes through save/load', async function () {
    const store = newStore();
    const bytes = new Uint8Array([1, 2, 3, 4, 5]);

    assert.isUndefined(await store.load('doc-1'));

    await store.save('doc-1', bytes);
    const loaded = await store.load('doc-1');
    assert.deepEqual(Array.from(loaded!), Array.from(bytes));
  });

  it('should return undefined for a missing key', async function () {
    const store = newStore();
    assert.isUndefined(await store.load('missing'));
  });

  it('should isolate stored bytes from later caller mutation', async function () {
    const store = newStore();
    const bytes = new Uint8Array([1, 2, 3]);
    await store.save('doc-1', bytes);

    // Mutating the source buffer after save must not corrupt the snapshot.
    bytes[0] = 99;
    const loaded = await store.load('doc-1');
    assert.deepEqual(Array.from(loaded!), [1, 2, 3]);

    // Mutating the loaded buffer must not corrupt the snapshot either.
    loaded![0] = 88;
    const reloaded = await store.load('doc-1');
    assert.deepEqual(Array.from(reloaded!), [1, 2, 3]);
  });

  it('should overwrite on repeated save', async function () {
    const store = newStore();
    await store.save('doc-1', new Uint8Array([1]));
    await store.save('doc-1', new Uint8Array([2, 3]));
    const loaded = await store.load('doc-1');
    assert.deepEqual(Array.from(loaded!), [2, 3]);
  });

  it('should remove stored bytes', async function () {
    const store = newStore();
    await store.save('doc-1', new Uint8Array([1]));
    await store.remove('doc-1');
    assert.isUndefined(await store.load('doc-1'));
    // remove on a missing key is a no-op.
    await store.remove('missing');
  });

  it('should persist across store instances on the same database', async function () {
    const dbName = `yorkie-shared-${dbCounter++}`;
    const writer = new IndexedDBDocStore(dbName);
    await writer.save('doc-1', new Uint8Array([7, 8, 9]));

    // A fresh instance opening the same database sees the persisted bytes,
    // mirroring what happens after a page reload.
    const reader = new IndexedDBDocStore(dbName);
    const loaded = await reader.load('doc-1');
    assert.deepEqual(Array.from(loaded!), [7, 8, 9]);
  });

  it('should keep keys independent across document keys', async function () {
    const store = newStore();
    await store.save('doc-a', new Uint8Array([1]));
    await store.save('doc-b', new Uint8Array([2]));

    assert.deepEqual(Array.from((await store.load('doc-a'))!), [1]);
    assert.deepEqual(Array.from((await store.load('doc-b'))!), [2]);

    await store.remove('doc-a');
    assert.isUndefined(await store.load('doc-a'));
    assert.deepEqual(Array.from((await store.load('doc-b'))!), [2]);
  });
});
