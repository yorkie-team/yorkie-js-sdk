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

import { Checkpoint } from '@yorkie-js-sdk/src/document/change/checkpoint';
import { Change } from '@yorkie-js-sdk/src/document/change/change';
import { TimeTicket } from '@yorkie-js-sdk/src/document/time/ticket';

/**
 * `ChangePack` is a unit for delivering changes in a document to the remote.
 *
 * @internal
 */
export class ChangePack {
  /**
   * `documentKey` is the key of the document.
   */
  private documentKey: string;

  /**
   * `Checkpoint` is used to determine the client received changes.
   */
  private checkpoint: Checkpoint;
  /**
   * `isRemoved` is a flag that indicates whether the document is removed.
   */
  private isRemoved: boolean;

  private changes: Array<Change>;

  /**
   * `snapshot` is a byte array that encodes the document.
   */
  private snapshot?: Uint8Array;

  /**
   * `minSyncedTicket` is the minimum logical time taken by clients who attach
   * to the document. It is used to collect garbage on the replica on the
   * client.
   */
  private minSyncedTicket?: TimeTicket;

  constructor(
    key: string,
    checkpoint: Checkpoint,
    isRemoved: boolean,
    changes: Array<Change>,
    snapshot?: Uint8Array,
    minSyncedTicket?: TimeTicket,
  ) {
    this.documentKey = key;
    this.checkpoint = checkpoint;
    this.isRemoved = isRemoved;
    this.changes = changes;
    this.snapshot = snapshot;
    this.minSyncedTicket = minSyncedTicket;
  }

  /**
   * `create` creates a new instance of ChangePack.
   */
  public static create(
    key: string,
    checkpoint: Checkpoint,
    isRemoved: boolean,
    changes: Array<Change>,
    snapshot?: Uint8Array,
    minSyncedTicket?: TimeTicket,
  ): ChangePack {
    return new ChangePack(
      key,
      checkpoint,
      isRemoved,
      changes,
      snapshot,
      minSyncedTicket,
    );
  }

  /**
   * `getKey` returns the document key of this pack.
   */
  public getDocumentKey(): string {
    return this.documentKey;
  }

  /**
   * `getCheckpoint` returns the checkpoint of this pack.
   */
  public getCheckpoint(): Checkpoint {
    return this.checkpoint;
  }

  /**
   * `getIsRemoved` returns the whether this document is removed.
   */
  public getIsRemoved(): boolean {
    return this.isRemoved;
  }

  /**
   * `getChanges` returns the changes of this pack.
   */
  public getChanges(): Array<Change> {
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
