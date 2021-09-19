/*
 * Copyright 2020 The Yorkie Authors. All rights reserved.
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

import { DocumentKey } from '@yorkie-js-sdk/src/document/key/document_key';
import { Checkpoint } from '@yorkie-js-sdk/src/document/checkpoint/checkpoint';
import { Change } from '@yorkie-js-sdk/src/document/change/change';
import { TimeTicket } from '@yorkie-js-sdk/src/document/time/ticket';

/**
 * `ChangePack` is a unit for delivering changes in a document to the remote.
 *
 * @internal
 */
export class ChangePack {
  /**
   * `key` is the key of the document.
   */
  private key: DocumentKey;

  /**
   * `Checkpoint` is used to determine the client received changes.
   */
  private checkpoint: Checkpoint;

  private changes: Change[];

  /**
   * `snapshot` is a byte array that encode the document.
   */
  private snapshot?: Uint8Array;

  /**
   * `minSyncedTicket` is the minimum logical time taken by clients who attach
   * the document. It used to collect garbage on the replica on the client.
   */
  private minSyncedTicket?: TimeTicket;

  constructor(
    key: DocumentKey,
    checkpoint: Checkpoint,
    changes: Change[],
    snapshot?: Uint8Array,
    minSyncedTicket?: TimeTicket,
  ) {
    this.key = key;
    this.checkpoint = checkpoint;
    this.changes = changes;
    this.snapshot = snapshot;
    this.minSyncedTicket = minSyncedTicket;
  }

  /**
   * `create` creates a new instance of ChangePack.
   */
  public static create(
    key: DocumentKey,
    checkpoint: Checkpoint,
    changes: Change[],
    snapshot?: Uint8Array,
    minSyncedTicket?: TimeTicket,
  ): ChangePack {
    return new ChangePack(key, checkpoint, changes, snapshot, minSyncedTicket);
  }

  /**
   * `getKey` returns the document key of this pack.
   */
  public getKey(): DocumentKey {
    return this.key;
  }

  /**
   * `getCheckpoint` returns the checkpoint of this pack.
   */
  public getCheckpoint(): Checkpoint {
    return this.checkpoint;
  }

  /**
   * `getChanges` returns the changes of this pack.
   */
  public getChanges(): Change[] {
    return this.changes;
  }

  /**
   * `hasChanges` returns the whether this pack has changes or not.
   */
  public hasChanges(): boolean {
    return this.changes.length > 0;
  }

  /**
   * `getChangeSize` returns the size of changes this pack has.
   */
  public getChangeSize(): number {
    return this.changes.length;
  }

  /**
   * `hasSnapshot` returns the whether this pack has a snapshot or not.
   */
  public hasSnapshot(): boolean {
    return !!this.snapshot && !!this.snapshot.length;
  }

  /**
   * `getSnapshot` returns the snapshot of this pack.
   */
  public getSnapshot(): Uint8Array | undefined {
    return this.snapshot;
  }

  /**
   * `getMinSyncedTicket` returns the minimum synced ticket of this pack.
   */
  public getMinSyncedTicket(): TimeTicket | undefined {
    return this.minSyncedTicket;
  }
}
