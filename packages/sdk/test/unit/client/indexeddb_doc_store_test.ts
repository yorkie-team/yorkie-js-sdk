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
import {
  DocStore,
  StoredChange,
  StoredDoc,
} from '@yorkie-js/sdk/src/client/doc-store';
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
    private docsStore = 'documents',
    private changesStore = 'changes',
  ) {}

  public async load(docKey: string): Promise<StoredDoc | undefined> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(
        [this.docsStore, this.changesStore],
        'readonly',
      );
      const entryReq = tx.objectStore(this.docsStore).get(docKey);
      // A key range over [docKey, 0]..[docKey, MAX] selects exactly this
      // document's log, and IndexedDB returns it in key order — which is
      // clientSeq order, the order replay needs.
      const changesReq = tx
        .objectStore(this.changesStore)
        .getAll(IDBKeyRange.bound([docKey, -Infinity], [docKey, Infinity]));
      tx.oncomplete = () => {
        const entry = entryReq.result as
          | { snapshot: ArrayBuffer; meta?: ArrayBuffer }
          | undefined;
        if (entry === undefined) {
          resolve(undefined);
          return;
        }
        resolve({
          snapshot: new Uint8Array(entry.snapshot),
          meta: entry.meta ? new Uint8Array(entry.meta) : undefined,
          changes: (
            changesReq.result as Array<{
              clientSeq: number;
              bytes: ArrayBuffer;
            }>
          ).map((row) => ({
            clientSeq: row.clientSeq,
            bytes: new Uint8Array(row.bytes),
          })),
        });
      };
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  public async saveSnapshot(docKey: string, bytes: Uint8Array): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      // One transaction spans both stores, so the snapshot write and the log
      // clear cannot be observed apart. A torn pair here would replay changes
      // the new snapshot already contains.
      const tx = db.transaction(
        [this.docsStore, this.changesStore],
        'readwrite',
      );
      // The header is dropped with the log: the new snapshot embeds its own,
      // newer checkpoint and changeID, so keeping the old one would regress
      // the client's clocks on restore.
      tx.objectStore(this.docsStore).put({ snapshot: bytes.slice() }, docKey);
      tx.objectStore(this.changesStore).delete(
        IDBKeyRange.bound([docKey, -Infinity], [docKey, Infinity]),
      );
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  public async appendChange(
    docKey: string,
    change: StoredChange,
  ): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(
        [this.docsStore, this.changesStore],
        'readwrite',
      );
      // No entry means no snapshot to append to, and a row written anyway is
      // an orphan `load` cannot see. `MemoryDocStore` answers the same way.
      const entry = tx.objectStore(this.docsStore).get(docKey);
      entry.onsuccess = () => {
        if (entry.result === undefined) {
          tx.abort();
        }
      };
      // Keyed by [docKey, clientSeq]: the append writes one small row and
      // touches nothing else, which is the property that makes this the cheap
      // hot path rather than a rewrite of the whole entry.
      tx.objectStore(this.changesStore).put(
        { clientSeq: change.clientSeq, bytes: change.bytes.slice() },
        [docKey, change.clientSeq],
      );
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      // An abort here is the no-entry guard above, not a failure.
      tx.onabort = () => resolve();
    });
  }

  public async saveMeta(docKey: string, bytes: Uint8Array): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(
        [this.docsStore, this.changesStore],
        'readwrite',
      );
      const docs = tx.objectStore(this.docsStore);
      const existing = docs.get(docKey);
      existing.onsuccess = () => {
        const prev = existing.result as { snapshot: ArrayBuffer } | undefined;
        if (prev === undefined) {
          // No entry: nothing to advance. Writing meta alone would leave a
          // header describing a snapshot that does not exist.
          return;
        }
        // Header only: the log is the delta between the snapshot and current
        // content, so trimming acked entries here would lose that content —
        // nothing brings the snapshot forward on a push-ack.
        docs.put({ snapshot: prev.snapshot, meta: bytes.slice() }, docKey);
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  public async remove(docKey: string): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(
        [this.docsStore, this.changesStore],
        'readwrite',
      );
      tx.objectStore(this.docsStore).delete(docKey);
      tx.objectStore(this.changesStore).delete(
        IDBKeyRange.bound([docKey, -Infinity], [docKey, Infinity]),
      );
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
        if (!db.objectStoreNames.contains(this.docsStore)) {
          db.createObjectStore(this.docsStore);
        }
        if (!db.objectStoreNames.contains(this.changesStore)) {
          db.createObjectStore(this.changesStore);
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

    assert.isUndefined(await store.load('missing'));

    await store.saveSnapshot('a', new Uint8Array([1, 2, 3]));
    assert.deepEqual(Array.from((await store.load('a'))!.snapshot), [1, 2, 3]);
    assert.deepEqual((await store.load('a'))!.changes, []);

    await store.saveSnapshot('a', new Uint8Array([9]));
    assert.deepEqual(Array.from((await store.load('a'))!.snapshot), [9]);

    await store.remove('a');
    assert.isUndefined(await store.load('a'));
    await store.remove('a'); // no-op on a missing key
  });

  it('returns appended changes ordered by clientSeq', async () => {
    const store = new IndexedDBDocStore('yorkie-append');
    await store.saveSnapshot('a', new Uint8Array([0]));
    await store.appendChange('a', { clientSeq: 2, bytes: new Uint8Array([2]) });
    await store.appendChange('a', { clientSeq: 1, bytes: new Uint8Array([1]) });

    const stored = await store.load('a');
    assert.deepEqual(
      stored!.changes.map((c) => c.clientSeq),
      [1, 2],
    );
    assert.deepEqual(Array.from(stored!.changes[0].bytes), [1]);
  });

  it('drops the change log when the snapshot is replaced', async () => {
    const store = new IndexedDBDocStore('yorkie-compact');
    await store.saveSnapshot('a', new Uint8Array([0]));
    await store.appendChange('a', { clientSeq: 1, bytes: new Uint8Array([1]) });
    await store.saveSnapshot('a', new Uint8Array([9]));

    const stored = await store.load('a');
    assert.deepEqual(Array.from(stored!.snapshot), [9]);
    assert.deepEqual(stored!.changes, []);
  });

  it('records meta without trimming the log', async () => {
    const store = new IndexedDBDocStore('yorkie-meta');
    await store.saveSnapshot('a', new Uint8Array([0]));
    for (const clientSeq of [1, 2, 3]) {
      await store.appendChange('a', {
        clientSeq,
        bytes: new Uint8Array([clientSeq]),
      });
    }

    await store.saveMeta('a', new Uint8Array([7]));

    const stored = await store.load('a');
    // The log is the delta between the snapshot and current content; only
    // compaction trims it, by folding the entries into a new snapshot first.
    assert.deepEqual(
      stored!.changes.map((c) => c.clientSeq),
      [1, 2, 3],
    );
    assert.deepEqual(Array.from(stored!.meta!), [7]);
    assert.deepEqual(Array.from(stored!.snapshot), [0]);
  });

  it('drops meta across a compaction', async () => {
    const store = new IndexedDBDocStore('yorkie-meta-dropped');
    await store.saveSnapshot('a', new Uint8Array([0]));
    await store.saveMeta('a', new Uint8Array([7]));
    await store.saveSnapshot('a', new Uint8Array([1]));

    // The new snapshot embeds a newer header than meta holds, so carrying the
    // old one forward would regress the client's clocks on restore.
    assert.isUndefined((await store.load('a'))!.meta);
  });

  it('treats saveMeta on an absent entry as a no-op', async () => {
    const store = new IndexedDBDocStore('yorkie-meta-absent');
    await store.saveMeta('missing', new Uint8Array([1]));
    assert.isUndefined(await store.load('missing'));
  });

  it('isolates stored bytes from later caller mutation', async () => {
    const store = new IndexedDBDocStore('yorkie-isolation');
    const bytes = new Uint8Array([1, 2, 3]);
    await store.saveSnapshot('a', bytes);
    bytes[0] = 99;
    assert.deepEqual(Array.from((await store.load('a'))!.snapshot), [1, 2, 3]);
  });

  it('persists across a fresh store instance on the same database', async () => {
    const first = new IndexedDBDocStore('yorkie-reload');
    await first.saveSnapshot('a', new Uint8Array([7, 8]));
    await first.appendChange('a', { clientSeq: 1, bytes: new Uint8Array([9]) });

    // A new instance models a page reload reopening the same IndexedDB.
    const reloaded = await new IndexedDBDocStore('yorkie-reload').load('a');
    assert.deepEqual(Array.from(reloaded!.snapshot), [7, 8]);
    assert.deepEqual(Array.from(reloaded!.changes[0].bytes), [9]);
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
    await store.saveSnapshot(docKey, doc.toBytes());

    // Reload: a brand-new document restored from IndexedDB must match.
    const stored = await store.load(docKey);
    assert.isDefined(stored);
    const restored = Document.fromBytes<R>(docKey, stored!.snapshot);

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
