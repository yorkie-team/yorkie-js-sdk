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
 * `StoredChange` is one persisted local change, tagged with the `clientSeq` it
 * carries. The sequence is what lets a store drop changes a sync has already
 * acknowledged, and what lets a restore detect a hole rather than replaying a
 * discontinuous run.
 */
export interface StoredChange {
  clientSeq: number;
  bytes: Uint8Array;
}

/**
 * `StoredDoc` is everything a backend holds for one document: a base snapshot,
 * the changes appended since it, and a small mutable header.
 */
export interface StoredDoc {
  /** A `Document.toBytes()` envelope. */
  snapshot: Uint8Array;

  /**
   * Checkpoint and changeID as of the last sync. Absent until the first one.
   * Held apart from the snapshot because a sync has to advance it constantly
   * while the snapshot stays put.
   */
  meta?: Uint8Array;

  /** Changes appended since the snapshot, ascending by `clientSeq`. */
  changes: Array<StoredChange>;
}

/**
 * `DocStore` is a pluggable persistence backend for offline document state.
 *
 * It is deliberately a snapshot plus an append-only change log rather than one
 * opaque blob. Re-serializing the whole document on every edit costs time
 * proportional to the document — hundreds of milliseconds on a large one — and
 * a document is at its largest while it is being edited, which is exactly when
 * the writes happen. Appending costs the size of one change, which does not
 * grow with the document at all.
 *
 * The interface stays byte-oriented and async so a durable backend (IndexedDB,
 * say) can implement it without the client knowing which storage it talks to,
 * and so a backend is free to compress or encrypt what it is handed. The
 * default `MemoryDocStore` keeps everything in a process-local map and carries
 * no dependency.
 */
export interface DocStore {
  /**
   * `load` returns the persisted state for the given document key, or
   * `undefined` when nothing has been stored for it. `changes` must be ordered
   * by ascending `clientSeq`.
   */
  load(docKey: string): Promise<StoredDoc | undefined>;

  /**
   * `saveSnapshot` replaces the snapshot and atomically drops every appended
   * change. This is compaction: the new snapshot already contains those
   * changes, so keeping them would replay them twice.
   */
  saveSnapshot(docKey: string, bytes: Uint8Array): Promise<void>;

  /**
   * `appendChange` appends one local change. This is the hot path — frequent
   * and small — so an implementation must not rewrite the whole entry to
   * satisfy it.
   */
  appendChange(docKey: string, change: StoredChange): Promise<void>;

  /**
   * `saveMeta` records the post-sync header and drops changes at or below
   * `ackedClientSeq`, which the server has taken. It leaves the snapshot
   * alone: an online client syncs constantly, and re-snapshotting per sync
   * would reintroduce the cost this interface exists to avoid.
   *
   * It is a no-op when nothing is stored for the key.
   */
  saveMeta(
    docKey: string,
    bytes: Uint8Array,
    ackedClientSeq: number,
  ): Promise<void>;

  /**
   * `remove` deletes everything persisted for the document key. It is a no-op
   * when nothing is stored.
   */
  remove(docKey: string): Promise<void>;
}

/**
 * `MemoryDocStore` is an in-memory `DocStore`. It holds entries in a `Map` for
 * the lifetime of the process and carries no external dependency. It is the
 * default when a durable backend is not configured, and it doubles as a test
 * double for the persistence loop.
 *
 * Every byte array is copied on the way in and on the way out, so neither a
 * caller mutating what it wrote nor one mutating what it read can corrupt the
 * stored entry.
 */
export class MemoryDocStore implements DocStore {
  private store: Map<string, StoredDoc>;

  constructor() {
    this.store = new Map();
  }

  /**
   * `load` returns a deep copy of the persisted entry, or `undefined`.
   */
  public load(docKey: string): Promise<StoredDoc | undefined> {
    const entry = this.store.get(docKey);
    if (!entry) {
      return Promise.resolve(undefined);
    }
    return Promise.resolve({
      snapshot: entry.snapshot.slice(),
      meta: entry.meta ? entry.meta.slice() : undefined,
      changes: entry.changes.map((change) => ({
        clientSeq: change.clientSeq,
        bytes: change.bytes.slice(),
      })),
    });
  }

  /**
   * `saveSnapshot` stores a copy of the bytes and clears the change log.
   */
  public saveSnapshot(docKey: string, bytes: Uint8Array): Promise<void> {
    const entry = this.store.get(docKey);
    this.store.set(docKey, {
      snapshot: bytes.slice(),
      // The header survives compaction: it describes the client's position
      // against the server, which a new snapshot does not change.
      meta: entry?.meta,
      changes: [],
    });
    return Promise.resolve();
  }

  /**
   * `appendChange` appends a copy of the change, keeping the log ordered by
   * `clientSeq`.
   */
  public appendChange(docKey: string, change: StoredChange): Promise<void> {
    const entry = this.store.get(docKey);
    if (!entry) {
      return Promise.resolve();
    }
    entry.changes.push({
      clientSeq: change.clientSeq,
      bytes: change.bytes.slice(),
    });
    entry.changes.sort((a, b) => a.clientSeq - b.clientSeq);
    return Promise.resolve();
  }

  /**
   * `saveMeta` stores a copy of the header and drops acknowledged changes.
   */
  public saveMeta(
    docKey: string,
    bytes: Uint8Array,
    ackedClientSeq: number,
  ): Promise<void> {
    const entry = this.store.get(docKey);
    if (!entry) {
      return Promise.resolve();
    }
    entry.meta = bytes.slice();
    entry.changes = entry.changes.filter(
      (change) => change.clientSeq > ackedClientSeq,
    );
    return Promise.resolve();
  }

  /**
   * `remove` deletes everything persisted for the document key.
   */
  public remove(docKey: string): Promise<void> {
    this.store.delete(docKey);
    return Promise.resolve();
  }
}
