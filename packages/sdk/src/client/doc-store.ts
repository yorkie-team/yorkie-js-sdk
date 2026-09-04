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

/**
 * `DocStore` is a pluggable persistence backend for offline document state.
 * The client serializes a document with `Document.toBytes()` and hands the
 * resulting envelope to `save`; on a later attach it calls `load` and, when
 * bytes are present, rehydrates the document via `Document.fromBytes` so
 * un-pushed local changes survive a reload.
 *
 * The interface is intentionally byte-oriented and async so that a durable
 * backend (e.g. IndexedDB) can implement it without the client knowing which
 * storage it talks to. The default `MemoryDocStore` keeps everything in a
 * process-local map and is dependency-free.
 */
export interface DocStore {
  /**
   * `load` returns the persisted bytes for the given document key, or
   * `undefined` when nothing has been stored for it.
   */
  load(docKey: string): Promise<Uint8Array | undefined>;

  /**
   * `save` persists the given bytes for the document key, overwriting any
   * previously stored value.
   */
  save(docKey: string, bytes: Uint8Array): Promise<void>;

  /**
   * `remove` deletes any persisted bytes for the document key. It is a no-op
   * when nothing is stored.
   */
  remove(docKey: string): Promise<void>;
}

/**
 * `MemoryDocStore` is an in-memory `DocStore` implementation. It holds the
 * persisted envelopes in a `Map` for the lifetime of the process and carries
 * no external dependency. It is the default store used when a durable backend
 * is not configured, and it doubles as a test double for the persistence loop.
 *
 * Each stored value is defensively copied on both `save` and `load` so a
 * caller mutating the returned buffer cannot corrupt the stored snapshot.
 */
export class MemoryDocStore implements DocStore {
  private store: Map<string, Uint8Array>;

  constructor() {
    this.store = new Map();
  }

  /**
   * `load` returns a copy of the persisted bytes for the document key, or
   * `undefined` when nothing is stored.
   */
  public load(docKey: string): Promise<Uint8Array | undefined> {
    const bytes = this.store.get(docKey);
    return Promise.resolve(bytes ? bytes.slice() : undefined);
  }

  /**
   * `save` stores a copy of the given bytes under the document key.
   */
  public save(docKey: string, bytes: Uint8Array): Promise<void> {
    this.store.set(docKey, bytes.slice());
    return Promise.resolve();
  }

  /**
   * `remove` deletes any persisted bytes for the document key.
   */
  public remove(docKey: string): Promise<void> {
    this.store.delete(docKey);
    return Promise.resolve();
  }
}

/**
 * `IndexedDBDocStore` is a browser-durable `DocStore` implementation backed by
 * IndexedDB. Unlike `MemoryDocStore`, the persisted envelopes survive a page
 * reload, which is what makes offline local changes recoverable across
 * sessions.
 *
 * It talks to the raw IndexedDB API and carries no runtime dependency. A single
 * object store keyed by `docKey` holds the `Uint8Array` envelopes. The database
 * connection is opened lazily on first use and reused for subsequent calls.
 *
 * IndexedDB only exists in browser-like environments. In a plain Node process
 * (or any runtime without `indexedDB` on `globalThis`) every operation rejects
 * with a clear error; use `MemoryDocStore` there instead.
 */
export class IndexedDBDocStore implements DocStore {
  private dbName: string;
  private storeName: string;
  private dbPromise?: Promise<IDBDatabase>;

  /**
   * @param dbName - IndexedDB database name. Defaults to `'yorkie'`.
   * @param storeName - Object store name. Defaults to `'documents'`.
   */
  constructor(dbName = 'yorkie', storeName = 'documents') {
    this.dbName = dbName;
    this.storeName = storeName;
  }

  /**
   * `load` returns the persisted bytes for the document key, or `undefined`
   * when nothing is stored for it.
   */
  public async load(docKey: string): Promise<Uint8Array | undefined> {
    const db = await this.open();
    return new Promise<Uint8Array | undefined>((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readonly');
      const req = tx.objectStore(this.storeName).get(docKey);
      req.onsuccess = () => {
        const value = req.result;
        resolve(value === undefined ? undefined : new Uint8Array(value));
      };
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * `save` persists the given bytes under the document key, overwriting any
   * previously stored value. A copy is stored so a later caller mutation
   * cannot corrupt the snapshot.
   */
  public async save(docKey: string, bytes: Uint8Array): Promise<void> {
    const db = await this.open();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      tx.objectStore(this.storeName).put(bytes.slice(), docKey);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  /**
   * `remove` deletes any persisted bytes for the document key. It is a no-op
   * when nothing is stored.
   */
  public async remove(docKey: string): Promise<void> {
    const db = await this.open();
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(this.storeName, 'readwrite');
      tx.objectStore(this.storeName).delete(docKey);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  /**
   * `open` lazily opens the database connection and reuses it across calls,
   * creating the object store during an upgrade. It rejects when the runtime
   * has no IndexedDB.
   */
  private open(): Promise<IDBDatabase> {
    if (this.dbPromise) {
      return this.dbPromise;
    }

    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const idb =
        typeof globalThis !== 'undefined'
          ? (globalThis as any).indexedDB
          : undefined;
      if (!idb) {
        reject(
          new Error(
            'IndexedDBDocStore requires IndexedDB, which is unavailable in ' +
              'this environment. Use MemoryDocStore outside the browser.',
          ),
        );
        return;
      }

      const req: IDBOpenDBRequest = idb.open(this.dbName);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });

    // Drop the cached promise on failure so a later call can retry the open.
    this.dbPromise.catch(() => {
      this.dbPromise = undefined;
    });

    return this.dbPromise;
  }
}
