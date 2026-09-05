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
