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

import { DocumentKey } from '../key/document_key';
import { Checkpoint } from '../checkpoint/checkpoint';
import { Change } from './change';
import { TimeTicket } from '../time/ticket';

/**
 * ChangePack is a unit for delivering changes in a document to the remote.
 */
export class ChangePack {
  private key: DocumentKey;
  private checkpoint: Checkpoint;
  private changes: Change[];
  private snapshot: Uint8Array;
  private minSyncedTicket: TimeTicket;

  constructor(
    key: DocumentKey,
    checkpoint: Checkpoint,
    changes: Change[],
    snapshot: Uint8Array,
    minSyncedTicket: TimeTicket,
  ) {
    this.key = key;
    this.checkpoint = checkpoint;
    this.changes = changes;
    this.snapshot = snapshot;
    this.minSyncedTicket = minSyncedTicket;
  }

  public static create(
    key: DocumentKey,
    checkpoint: Checkpoint,
    changes: Change[],
    snapshot?: Uint8Array,
    minSyncedTicket?: TimeTicket,
  ): ChangePack {
    return new ChangePack(key, checkpoint, changes, snapshot, minSyncedTicket);
  }

  public getKey(): DocumentKey {
    return this.key;
  }

  public getCheckpoint(): Checkpoint {
    return this.checkpoint;
  }

  public getChanges(): Change[] {
    return this.changes;
  }

  public hasChanges(): boolean {
    return this.changes.length > 0;
  }

  public getChangeSize(): number {
    return this.changes.length;
  }

  public hasSnapshot(): boolean {
    return !!this.snapshot && !!this.snapshot.length;
  }

  public getSnapshot(): Uint8Array {
    return this.snapshot;
  }

  public getMinSyncedTicket(): TimeTicket {
    return this.minSyncedTicket;
  }
}
