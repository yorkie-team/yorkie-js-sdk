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

import { logger, LogLevel } from '../util/logger';
import {
  Observer,
  Observable,
  createObservable,
  Unsubscribe,
} from '../util/observable';
import { ActorID } from './time/actor_id';
import { DocumentKey } from './key/document_key';
import { Change } from './change/change';
import { ChangeID, InitialChangeID } from './change/change_id';
import { ChangeContext } from './change/context';
import { converter } from '../api/converter';
import { ChangePack } from './change/change_pack';
import { JSONRoot } from './json/root';
import { JSONObject } from './json/object';
import { createProxy } from './proxy/proxy';
import { Checkpoint, InitialCheckpoint } from './checkpoint/checkpoint';
import { TimeTicket } from './time/ticket';

export enum DocEventType {
  Snapshot = 'snapshot',
  LocalChange = 'local-change',
  RemoteChange = 'remote-change',
}

export interface DocEvent {
  name: DocEventType;
  value: any;
}

/**
 * Document represents a document in MongoDB and contains logical clocks.
 */
export class Document implements Observable<DocEvent> {
  private key: DocumentKey;
  private root: JSONRoot;
  private clone: JSONRoot;
  private changeID: ChangeID;
  private checkpoint: Checkpoint;
  private localChanges: Change[];
  private eventStream: Observable<DocEvent>;
  private eventStreamObserver: Observer<DocEvent>;

  constructor(collection: string, document: string) {
    this.key = DocumentKey.of(collection, document);
    this.root = JSONRoot.create();
    this.changeID = InitialChangeID;
    this.checkpoint = InitialCheckpoint;
    this.localChanges = [];
    this.eventStream = createObservable<DocEvent>((observer) => {
      this.eventStreamObserver = observer;
    });
  }

  /**
   * create creates a new instance of Document.
   */
  public static create(collection: string, document: string): Document {
    return new Document(collection, document);
  }

  /**
   * update executes the given updater to update this document.
   */
  public update(updater: (root: JSONObject) => void, message?: string): void {
    this.ensureClone();
    const context = ChangeContext.create(
      this.changeID.next(),
      message,
      this.clone,
    );

    try {
      const proxy = createProxy(context, this.clone.getObject());
      updater(proxy);
    } catch (err) {
      // drop clone because it is contaminated.
      this.clone = null;
      logger.error(err);
      throw err;
    }

    if (context.hasOperations()) {
      if (logger.isEnabled(LogLevel.Trivial)) {
        logger.trivial(`trying to update a local change: ${this.toJSON()}`);
      }

      const change = context.getChange();
      change.execute(this.root);
      this.localChanges.push(change);
      this.changeID = change.getID();

      if (this.eventStreamObserver) {
        this.eventStreamObserver.next({
          name: DocEventType.LocalChange,
          value: [change],
        });
      }

      if (logger.isEnabled(LogLevel.Trivial)) {
        logger.trivial(`after update a local change: ${this.toJSON()}`);
      }
    }
  }

  public subscribe(nextOrObserver, error?, complete?): Unsubscribe {
    return this.eventStream.subscribe(nextOrObserver, error, complete);
  }

  /**
   * applyChangePack applies the given change pack into this document.
   */
  public applyChangePack(pack: ChangePack): void {
    if (pack.hasSnapshot()) {
      this.applySnapshot(
        pack.getSnapshot(),
        pack.getCheckpoint().getServerSeq(),
      );
    } else if (pack.hasChanges()) {
      this.applyChanges(pack.getChanges());
    }

    // 02. Remove local changes applied to server.
    while (this.localChanges.length) {
      const change = this.localChanges[0];
      if (change.getID().getClientSeq() > pack.getCheckpoint().getClientSeq()) {
        break;
      }
      this.localChanges.shift();
    }

    // 03. Update the checkpoint.
    this.checkpoint = this.checkpoint.forward(pack.getCheckpoint());

    // 04. Do Garbage collection.
    this.garbageCollect(pack.getMinSyncedTicket());

    if (logger.isEnabled(LogLevel.Trivial)) {
      logger.trivial(`${this.root.toJSON()}`);
    }
  }

  public getCheckpoint(): Checkpoint {
    return this.checkpoint;
  }

  public hasLocalChanges(): boolean {
    return this.localChanges.length > 0;
  }

  public ensureClone(): void {
    if (this.clone) {
      return;
    }

    this.clone = this.root.deepcopy();
  }

  /**
   * createChangePack create change pack of the local changes to send to the remote server.
   */
  public createChangePack(): ChangePack {
    const changes = this.localChanges;
    const checkpoint = this.checkpoint.increaseClientSeq(changes.length);
    return ChangePack.create(this.key, checkpoint, changes);
  }

  /**
   * setActor sets actor into this document. This is also applied in the local
   * changes the document has.
   */
  public setActor(actorID: ActorID): void {
    for (const change of this.localChanges) {
      change.setActor(actorID);
    }
    this.changeID = this.changeID.setActor(actorID);

    // TODO also apply into root.
  }

  public getKey(): DocumentKey {
    return this.key;
  }

  public getClone(): JSONObject {
    return this.clone.getObject();
  }

  public getRootObject(): JSONObject {
    this.ensureClone();

    const context = ChangeContext.create(this.changeID.next(), '', this.clone);
    return createProxy(context, this.clone.getObject());
  }

  public garbageCollect(ticket: TimeTicket): number {
    if (this.clone) {
      this.clone.garbageCollect(ticket);
    }
    return this.root.garbageCollect(ticket);
  }

  public getRoot(): JSONObject {
    return this.root.getObject();
  }

  public getGarbageLen(): number {
    return this.root.getGarbageLen();
  }

  public toJSON(): string {
    return this.root.toJSON();
  }

  public toSortedJSON(): string {
    return this.root.toSortedJSON();
  }

  private applySnapshot(snapshot: Uint8Array, serverSeq: Long): void {
    const obj = converter.bytesToObject(snapshot);
    this.root = new JSONRoot(obj);

    for (const change of this.localChanges) {
      change.execute(this.root);
    }
    this.changeID = this.changeID.syncLamport(serverSeq);

    // drop clone because it is contaminated.
    this.clone = null;

    if (this.eventStreamObserver) {
      this.eventStreamObserver.next({
        name: DocEventType.Snapshot,
        value: snapshot,
      });
    }
  }

  private applyChanges(changes: Array<Change>): void {
    logger.debug(`trying to apply ${changes.length} remote changes`);

    if (logger.isEnabled(LogLevel.Trivial)) {
      logger.trivial(
        changes
          .map(
            (change) =>
              `${change
                .getID()
                .getAnnotatedString()}\t${change.getAnnotatedString()}`,
          )
          .join('\n'),
      );
    }

    this.ensureClone();
    for (const change of changes) {
      change.execute(this.clone);
    }

    for (const change of changes) {
      change.execute(this.root);
      this.changeID = this.changeID.syncLamport(change.getID().getLamport());
    }

    if (changes.length && this.eventStreamObserver) {
      this.eventStreamObserver.next({
        name: DocEventType.RemoteChange,
        value: changes,
      });
    }

    logger.debug(`after appling ${changes.length} remote changes`);
  }
}
