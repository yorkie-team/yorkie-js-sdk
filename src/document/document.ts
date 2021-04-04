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
  ErrorFn,
  CompleteFn,
  NextFn,
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

/**
 * @internal
 */
export enum DocEventType {
  Snapshot = 'snapshot',
  LocalChange = 'local-change',
  RemoteChange = 'remote-change',
}

/**
 * @internal
 */
export type DocEvent = SnapshotEvent | LocalChangeEvent | RemoteChangeEvent;

/**
 * @internal
 */
export interface AbstractDocEvent {
  type: DocEventType;
}

/**
 * @internal
 */
export interface SnapshotEvent extends AbstractDocEvent {
  type: DocEventType.Snapshot;
  value: Uint8Array | undefined;
}

/**
 * @internal
 */
export interface ChangeInfo {
  change: Change;
  paths: Array<string>;
}

/**
 * @internal
 */
export interface LocalChangeEvent extends AbstractDocEvent {
  type: DocEventType.LocalChange;
  value: Array<ChangeInfo>;
}

/**
 * @internal
 */
export interface RemoteChangeEvent extends AbstractDocEvent {
  type: DocEventType.RemoteChange;
  value: Array<ChangeInfo>;
}

/**
 * @internal
 */
export type Indexable = {
  [index: string]: any;
};

/**
 * `Document` represents a document in MongoDB and contains logical clocks.
 */
export class Document<T = Indexable> implements Observable<DocEvent> {
  private key: DocumentKey;
  private root: JSONRoot;
  private clone?: JSONRoot;
  private changeID: ChangeID;
  private checkpoint: Checkpoint;
  private localChanges: Change[];
  private eventStream: Observable<DocEvent>;
  private eventStreamObserver!: Observer<DocEvent>;

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
   * `create` creates a new instance of Document.
   */
  public static create<T = Indexable>(
    collection: string,
    document: string,
  ): Document<T> {
    return new Document<T>(collection, document);
  }

  /**
   * `update` executes the given updater to update this document.
   */
  public update(
    updater: (root: T & JSONObject) => void,
    message?: string,
  ): void {
    this.ensureClone();
    const context = ChangeContext.create(
      this.changeID.next(),
      this.clone!,
      message,
    );

    try {
      const proxy = createProxy<T>(context, this.clone!.getObject());
      updater(proxy);
    } catch (err) {
      // drop clone because it is contaminated.
      this.clone = undefined;
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
          type: DocEventType.LocalChange,
          value: [
            {
              change,
              paths: this.createPaths(change),
            },
          ],
        });
      }

      if (logger.isEnabled(LogLevel.Trivial)) {
        logger.trivial(`after update a local change: ${this.toJSON()}`);
      }
    }
  }

  /**
   * `subscribe` adds the given observer to the fan-out list.
   */
  public subscribe(
    nextOrObserver: Observer<DocEvent> | NextFn<DocEvent>,
    error?: ErrorFn,
    complete?: CompleteFn,
  ): Unsubscribe {
    return this.eventStream.subscribe(nextOrObserver, error, complete);
  }

  /**
   * `applyChangePack` applies the given change pack into this document.
   * 1. Remove local changes applied to server.
   * 2. Update the checkpoint.
   * 3. Do Garbage collection.
   * @param pack - change pack
   */
  public applyChangePack(pack: ChangePack): void {
    if (pack.hasSnapshot()) {
      this.applySnapshot(
        pack.getCheckpoint().getServerSeq(),
        pack.getSnapshot(),
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
    this.garbageCollect(pack.getMinSyncedTicket()!);

    if (logger.isEnabled(LogLevel.Trivial)) {
      logger.trivial(`${this.root.toJSON()}`);
    }
  }

  /**
   * `getCheckpoint` returns the checkpoint of this document.
   */
  public getCheckpoint(): Checkpoint {
    return this.checkpoint;
  }

  /**
   * `hasLocalChanges` returns whether this document has local changes or not.
   */
  public hasLocalChanges(): boolean {
    return this.localChanges.length > 0;
  }

  /**
   * `ensureClone` make a clone of root.
   */
  public ensureClone(): void {
    if (this.clone) {
      return;
    }

    this.clone = this.root.deepcopy();
  }

  /**
   * `createChangePack` create change pack of the local changes to send to the
   * remote server.
   */
  public createChangePack(): ChangePack {
    const changes = this.localChanges;
    const checkpoint = this.checkpoint.increaseClientSeq(changes.length);
    return ChangePack.create(this.key, checkpoint, changes);
  }

  /**
   * `setActor` sets actor into this document. This is also applied in the local
   * changes the document has.
   */
  public setActor(actorID: ActorID): void {
    for (const change of this.localChanges) {
      change.setActor(actorID);
    }
    this.changeID = this.changeID.setActor(actorID);

    // TODO also apply into root.
  }

  /**
   * `getKey` returns the key of this document.
   */
  public getKey(): DocumentKey {
    return this.key;
  }

  /**
   * `getClone` return clone object.
   */
  public getClone(): JSONObject | undefined {
    if (!this.clone) {
      return;
    }

    return this.clone.getObject();
  }

  /**
   * `getRoot` returns a new proxy of cloned root.
   */
  public getRoot(): T {
    this.ensureClone();

    const context = ChangeContext.create(this.changeID.next(), this.clone!);
    return createProxy<T>(context, this.clone!.getObject());
  }

  /**
   * `garbageCollect` purges elements that were removed before the given time.
   */
  public garbageCollect(ticket: TimeTicket): number {
    if (this.clone) {
      this.clone.garbageCollect(ticket);
    }
    return this.root.garbageCollect(ticket);
  }

  /**
   * `getRootObject` returns root object.
   */
  public getRootObject(): JSONObject {
    return this.root.getObject();
  }

  /**
   * `getGarbageLen` returns the length of elements should be purged.
   */
  public getGarbageLen(): number {
    return this.root.getGarbageLen();
  }

  /**
   * `toJSON` returns the JSON encoding of this array.
   */
  public toJSON(): string {
    return this.root.toJSON();
  }

  /**
   * `toJSON` returns the sorted JSON encoding of this array.
   */
  public toSortedJSON(): string {
    return this.root.toSortedJSON();
  }

  private applySnapshot(serverSeq: Long, snapshot?: Uint8Array): void {
    const obj = converter.bytesToObject(snapshot);
    this.root = new JSONRoot(obj);

    for (const change of this.localChanges) {
      change.execute(this.root);
    }
    this.changeID = this.changeID.syncLamport(serverSeq);

    // drop clone because it is contaminated.
    this.clone = undefined;

    if (this.eventStreamObserver) {
      this.eventStreamObserver.next({
        type: DocEventType.Snapshot,
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
      change.execute(this.clone!);
    }

    for (const change of changes) {
      change.execute(this.root);
      this.changeID = this.changeID.syncLamport(change.getID().getLamport());
    }

    if (changes.length && this.eventStreamObserver) {
      this.eventStreamObserver.next({
        type: DocEventType.RemoteChange,
        value: changes.map((change) => {
          return {
            change,
            paths: this.createPaths(change),
          };
        }),
      });
    }

    logger.debug(`after appling ${changes.length} remote changes`);
  }

  private createPaths(change: Change): Array<string> {
    const paths: Array<string> = [];
    for (const op of change.getOperations()) {
      const createdAt = op.getEffectedCreatedAt();
      if (createdAt) {
        paths.push(this.root.createPath(createdAt)!);
      }
    }
    return paths;
  }
}
