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

// The SDK ships only the `DocStore` interface and the dependency-free
// `MemoryDocStore`; it deliberately does NOT ship an IndexedDB backend so the
// core carries no browser-storage coupling. But IndexedDB is the real backend
// apps will implement, so this test keeps an IndexedDB-backed `DocStore` as a
// fixture and verifies both the DocStore contract and the full persist/restore
// document loop against a real IndexedDB (via the `fake-indexeddb` shim). It is
// the reference implementation apps can copy.
import 'fake-indexeddb/auto';
import { describe, it, assert } from 'vitest';
import { DocStore } from '@yorkie-js/sdk/src/client/doc-store';
import { Document } from '@yorkie-js/sdk/src/document/document';
import { Counter, Text } from '@yorkie-js/sdk/src/yorkie';

/**
 * `IndexedDBDocStore` is a browser-durable `DocStore` fixture backed by the raw
 * IndexedDB API (no runtime dependency). It mirrors what an application would
 * implement to persist offline documents across reloads.
 */
class IndexedDBDocStore implements DocStore {
  private dbPromise?: Promise<IDBDatabase>;

  constructor(
    private dbName = 'yorkie',
    private storeName = 'documents',
  ) {}

  public async load(docKey: string): Promise<Uint8Array | undefined> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const req = db
        .transaction(this.storeName, 'readonly')
        .objectStore(this.storeName)
        .get(docKey);
      req.onsuccess = () =>
        resolve(
          req.result === undefined ? undefined : new Uint8Array(req.result),
        );
      req.onerror = () => reject(req.error);
    });
  }

  public async save(docKey: string, bytes: Uint8Array): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      tx.objectStore(this.storeName).put(bytes.slice(), docKey);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  public async remove(docKey: string): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      tx.objectStore(this.storeName).delete(docKey);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  private open(): Promise<IDBDatabase> {
    if (this.dbPromise) return this.dbPromise;
    this.dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.dbPromise;
  }
}

describe('DocStore against IndexedDB', () => {
  it('round-trips, overwrites, and removes', async () => {
    const store = new IndexedDBDocStore('yorkie-contract');
    const bytes = new Uint8Array([1, 2, 3]);

    assert.isUndefined(await store.load('missing'));

    await store.save('a', bytes);
    assert.deepEqual(Array.from((await store.load('a'))!), [1, 2, 3]);

    await store.save('a', new Uint8Array([9]));
    assert.deepEqual(Array.from((await store.load('a'))!), [9]);

    await store.remove('a');
    assert.isUndefined(await store.load('a'));
    await store.remove('a'); // no-op on a missing key
  });

  it('isolates stored bytes from later caller mutation', async () => {
    const store = new IndexedDBDocStore('yorkie-isolation');
    const bytes = new Uint8Array([1, 2, 3]);
    await store.save('a', bytes);
    bytes[0] = 99;
    assert.deepEqual(Array.from((await store.load('a'))!), [1, 2, 3]);
  });

  it('persists across a fresh store instance on the same database', async () => {
    await new IndexedDBDocStore('yorkie-reload').save(
      'a',
      new Uint8Array([7, 8]),
    );
    // A new instance models a page reload reopening the same IndexedDB.
    const reloaded = await new IndexedDBDocStore('yorkie-reload').load('a');
    assert.deepEqual(Array.from(reloaded!), [7, 8]);
  });

  it('drives the full persist/restore document loop through IndexedDB', async () => {
    type R = { text: Text; counter: Counter; n?: number };
    const store = new IndexedDBDocStore('yorkie-doc-loop');
    const docKey = 'doc-loop';
    const actor = '000000000000000000000001';

    // Author a document with pending local changes and persist its bytes.
    const doc = new Document<R>(docKey);
    doc.setActor(actor);
    doc.update((root) => {
      root.text = new Text();
      root.text.edit(0, 0, 'hello');
      root.counter = new Counter(0);
      root.counter.increase(5);
      root.n = 42;
    });
    await store.save(docKey, doc.toBytes());

    // Reload: a brand-new document restored from IndexedDB must match.
    const bytes = await store.load(docKey);
    assert.isDefined(bytes);
    const restored = Document.fromBytes<R>(docKey, bytes!);

    assert.equal(restored.toSortedJSON(), doc.toSortedJSON());
    assert.equal(restored.getChangeID().getActorID(), actor);
    assert.deepEqual(
      restored
        .createChangePack()
        .getChanges()
        .map((c) => c.toStruct()),
      doc
        .createChangePack()
        .getChanges()
        .map((c) => c.toStruct()),
    );
  });
});
