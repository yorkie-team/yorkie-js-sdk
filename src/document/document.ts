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
import Long from 'long';
import { logger, LogLevel } from '@yorkie-js-sdk/src/util/logger';
import { Code, YorkieError } from '@yorkie-js-sdk/src/util/error';
import {
  Observer,
  Observable,
  createObservable,
  Unsubscribe,
  ErrorFn,
  CompleteFn,
  NextFn,
} from '@yorkie-js-sdk/src/util/observable';
import { ActorID } from '@yorkie-js-sdk/src/document/time/actor_id';
import { Change } from '@yorkie-js-sdk/src/document/change/change';
import {
  ChangeID,
  InitialChangeID,
} from '@yorkie-js-sdk/src/document/change/change_id';
import { ChangeContext } from '@yorkie-js-sdk/src/document/change/context';
import { converter } from '@yorkie-js-sdk/src/api/converter';
import { ChangePack } from '@yorkie-js-sdk/src/document/change/change_pack';
import { CRDTRoot } from '@yorkie-js-sdk/src/document/crdt/root';
import { CRDTObject } from '@yorkie-js-sdk/src/document/crdt/object';
import {
  createJSON,
  JSONElement,
} from '@yorkie-js-sdk/src/document/json/element';
import {
  Checkpoint,
  InitialCheckpoint,
} from '@yorkie-js-sdk/src/document/change/checkpoint';
import { TimeTicket } from '@yorkie-js-sdk/src/document/time/ticket';
import {
  InternalOpInfo,
  OperationInfo,
} from '@yorkie-js-sdk/src/document/operation/operation';
import { JSONObject } from './json/object';
import { Trie } from '../util/trie';

/**
 * `DocumentStatus` represents the status of the document.
 * @public
 */
export enum DocumentStatus {
  /**
   * Detached means that the document is not attached to the client.
   * The actor of the ticket is created without being assigned.
   */
  Detached = 'detached',
  /**
   * Attached means that this document is attached to the client.
   * The actor of the ticket is created with being assigned by the client.
   */
  Attached = 'attached',
  /**
   * Removed means that this document is removed. If the document is removed,
   * it cannot be edited.
   */
  Removed = 'removed',
}

/**
 * `DocEventType` is document event types
 * @public
 */
export enum DocEventType {
  /**
   * snapshot event type
   */
  Snapshot = 'snapshot',
  /**
   * local document change event type
   */
  LocalChange = 'local-change',
  /**
   * remote document change event type
   */
  RemoteChange = 'remote-change',
}

/**
 * `DocEvent` is an event that occurs in `Document`. It can be delivered
 * using `Document.subscribe()`.
 *
 * @public
 */
export type DocEvent = SnapshotEvent | LocalChangeEvent | RemoteChangeEvent;

/**
 * @internal
 */
export interface BaseDocEvent {
  type: DocEventType;
}

/**
 * `SnapshotEvent` is an event that occurs when a snapshot is received from
 * the server.
 *
 * @public
 */
export interface SnapshotEvent extends BaseDocEvent {
  /**
   * enum {@link DocEventType}.Snapshot
   */
  type: DocEventType.Snapshot;
  /**
   * SnapshotEvent type
   */
  value: Uint8Array | undefined;
}

/**
 * `ChangeInfo` represents the modifications made during a document update
 * and the message passed.
 */
export interface ChangeInfo {
  message: string;
  operations: Array<OperationInfo>;
  actor: ActorID | undefined;
}

/**
 * `LocalChangeEvent` is an event that occurs when the document is changed
 * by local changes.
 *
 * @public
 */
export interface LocalChangeEvent extends BaseDocEvent {
  /**
   * enum {@link DocEventType}.LocalChange
   */
  type: DocEventType.LocalChange;
  /**
   * LocalChangeEvent type
   */
  value: Array<ChangeInfo>;
}

/**
 * `RemoteChangeEvent` is an event that occurs when the document is changed
 * by remote changes.
 *
 * @public
 */
export interface RemoteChangeEvent extends BaseDocEvent {
  /**
   * enum {@link DocEventType}.RemoteChange
   */
  type: DocEventType.RemoteChange;
  /**
   * RemoteChangeEvent type
   */
  value: Array<ChangeInfo>;
}

/**
 * Indexable key, value
 * @public
 */
export type Indexable = Record<string, any>;

/**
 * Document key type
 * @public
 */
export type DocumentKey = string;

/**
 * `Document` is a CRDT-based data type. We can represent the model
 * of the application and edit it even while offline.
 *
 * @public
 */
export class Document<T> {
  private key: DocumentKey;
  private status: DocumentStatus;
  private root: CRDTRoot;
  private clone?: CRDTRoot;
  private changeID: ChangeID;
  private checkpoint: Checkpoint;
  private localChanges: Array<Change>;
  private eventStream: Observable<DocEvent>;
  private eventStreamObserver!: Observer<DocEvent>;

  constructor(key: string) {
    this.key = key;
    this.status = DocumentStatus.Detached;
    this.root = CRDTRoot.create();
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
  public static create<T>(key: string): Document<T> {
    return new Document<T>(key);
  }

  /**
   * `update` executes the given updater to update this document.
   */
  public update(
    updater: (root: JSONObject<T>) => void,
    message?: string,
  ): void {
    if (this.getStatus() === DocumentStatus.Removed) {
      throw new YorkieError(Code.DocumentRemoved, `${this.key} is removed`);
    }

    this.ensureClone();
    const context = ChangeContext.create(
      this.changeID.next(),
      this.clone!,
      message,
    );

    try {
      const proxy = createJSON<JSONObject<T>>(context, this.clone!.getObject());
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
      const internalOpInfos = change.execute(this.root);
      this.localChanges.push(change);
      this.changeID = change.getID();

      if (this.eventStreamObserver) {
        this.eventStreamObserver.next({
          type: DocEventType.LocalChange,
          value: [
            {
              message: change.getMessage() || '',
              operations: internalOpInfos.map((internalOpInfo) =>
                this.toOperationInfo(internalOpInfo),
              ),
              actor: change.getID().getActorID(),
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
   * `subscribe` registers a callback to subscribe to events on the document.
   * The callback will be called when the document is changed.
   */
  public subscribe(
    nextOrObserver: Observer<DocEvent> | NextFn<DocEvent>,
    error?: ErrorFn,
    complete?: CompleteFn,
  ): Unsubscribe;
  /**
   * `subscribe` registers a callback to subscribe to events on the document.
   * The callback will be called when the targetPath or any of its nested values change.
   */
  public subscribe(
    targetPath: string,
    next: NextFn<DocEvent>,
    error?: ErrorFn,
    complete?: CompleteFn,
  ): Unsubscribe;
  /**
   * `subscribe` registers a callback to subscribe to events on the document.
   */
  public subscribe(
    arg1: string | Observer<DocEvent> | NextFn<DocEvent>,
    arg2?: NextFn<DocEvent> | ErrorFn,
    arg3?: ErrorFn | CompleteFn,
    arg4?: CompleteFn,
  ): Unsubscribe {
    if (typeof arg1 === 'string') {
      if (typeof arg2 !== 'function') {
        throw new Error('Second argument must be a callback function');
      }
      const target = arg1;
      const callback = arg2 as NextFn<DocEvent>;
      return this.eventStream.subscribe(
        (event) => {
          if (event.type === DocEventType.Snapshot) {
            target === '$' && callback(event);
            return;
          }

          const changeInfos: Array<ChangeInfo> = [];
          for (const { message, operations, actor } of event.value) {
            const targetOps: Array<OperationInfo> = [];
            for (const op of operations) {
              if (this.isSameElementOrChildOf(op.path, target)) {
                targetOps.push(op);
              }
            }
            targetOps.length &&
              changeInfos.push({
                message,
                operations: targetOps,
                actor,
              });
          }
          changeInfos.length &&
            callback({
              type: event.type,
              value: changeInfos,
            });
        },
        arg3,
        arg4,
      );
    }
    if (typeof arg1 === 'function') {
      const error = arg2 as ErrorFn;
      const complete = arg3 as CompleteFn;
      return this.eventStream.subscribe(arg1, error, complete);
    }
    throw new Error(`"${arg1}" is not a valid`);
  }

  private isSameElementOrChildOf(elem: string, parent: string): boolean {
    if (parent === elem) {
      return true;
    }

    const nodePath = elem.split('.');
    const targetPath = parent.split('.');
    return targetPath.every((path, index) => path === nodePath[index]);
  }

  /**
   * `applyChangePack` applies the given change pack into this document.
   * 1. Remove local changes applied to server.
   * 2. Update the checkpoint.
   * 3. Do Garbage collection.
   *
   * @param pack - change pack
   * @internal
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

    // 05. Update the status.
    if (pack.getIsRemoved()) {
      this.setStatus(DocumentStatus.Removed);
    }

    if (logger.isEnabled(LogLevel.Trivial)) {
      logger.trivial(`${this.root.toJSON()}`);
    }
  }

  /**
   * `getCheckpoint` returns the checkpoint of this document.
   *
   * @internal
   */
  public getCheckpoint(): Checkpoint {
    return this.checkpoint;
  }

  /**
   * `hasLocalChanges` returns whether this document has local changes or not.
   *
   * @internal
   */
  public hasLocalChanges(): boolean {
    return this.localChanges.length > 0;
  }

  /**
   * `ensureClone` make a clone of root.
   *
   * @internal
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
   *
   * @internal
   */
  public createChangePack(): ChangePack {
    const changes = this.localChanges;
    const checkpoint = this.checkpoint.increaseClientSeq(changes.length);
    return ChangePack.create(this.key, checkpoint, false, changes);
  }

  /**
   * `setActor` sets actor into this document. This is also applied in the local
   * changes the document has.
   *
   * @internal
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
   *
   * @internal
   */
  public getKey(): string {
    return this.key;
  }

  /**
   * `setStatus` updates the status of this document.
   *
   * @internal
   */
  public setStatus(status: DocumentStatus) {
    this.status = status;
  }

  /**
   * `getStatus` returns the status of this document.
   *
   * @internal
   */
  public getStatus(): DocumentStatus {
    return this.status;
  }

  /**
   * `getClone` return clone object.
   *
   * @internal
   */
  public getClone(): CRDTObject | undefined {
    if (!this.clone) {
      return;
    }

    return this.clone.getObject();
  }

  /**
   * `getRoot` returns a new proxy of cloned root.
   */
  public getRoot(): JSONObject<T> {
    this.ensureClone();

    const context = ChangeContext.create(this.changeID.next(), this.clone!);
    return createJSON<T>(context, this.clone!.getObject());
  }

  /**
   * `garbageCollect` purges elements that were removed before the given time.
   *
   * @internal
   */
  public garbageCollect(ticket: TimeTicket): number {
    if (this.clone) {
      this.clone.garbageCollect(ticket);
    }
    return this.root.garbageCollect(ticket);
  }

  /**
   * `getRootObject` returns root object.
   *
   * @internal
   */
  public getRootObject(): CRDTObject {
    return this.root.getObject();
  }

  /**
   * `getGarbageLen` returns the length of elements should be purged.
   *
   * @internal
   */
  public getGarbageLen(): number {
    return this.root.getGarbageLen();
  }

  /**
   * `toJSON` returns the JSON encoding of this document.
   */
  public toJSON(): string {
    return this.root.toJSON();
  }

  /**
   * `toSortedJSON` returns the sorted JSON encoding of this document.
   */
  public toSortedJSON(): string {
    return this.root.toSortedJSON();
  }

  /**
   * `applySnapshot` applies the given snapshot into this document.
   */
  public applySnapshot(serverSeq: Long, snapshot?: Uint8Array): void {
    const obj = converter.bytesToObject(snapshot);
    this.root = new CRDTRoot(obj);
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

  /**
   * `applyChanges` applies the given changes into this document.
   */
  public applyChanges(changes: Array<Change>): void {
    if (logger.isEnabled(LogLevel.Debug)) {
      logger.debug(
        `trying to apply ${changes.length} remote changes.` +
          `elements:${this.root.getElementMapSize()}, ` +
          `removeds:${this.root.getRemovedElementSetSize()}`,
      );
    }
    if (logger.isEnabled(LogLevel.Trivial)) {
      logger.trivial(
        changes
          .map(
            (change) =>
              `${change
                .getID()
                .getStructureAsString()}\t${change.getStructureAsString()}`,
          )
          .join('\n'),
      );
    }

    this.ensureClone();
    for (const change of changes) {
      change.execute(this.clone!);
    }

    const changeInfos: Array<ChangeInfo> = [];
    for (const change of changes) {
      const inernalOpInfos = change.execute(this.root);
      changeInfos.push({
        message: change.getMessage() || '',
        operations: inernalOpInfos.map((opInfo) =>
          this.toOperationInfo(opInfo),
        ),
        actor: change.getID().getActorID(),
      });
      this.changeID = this.changeID.syncLamport(change.getID().getLamport());
    }

    if (changes.length && this.eventStreamObserver) {
      // NOTE: RemoteChange event should be emitted synchronously with
      // applying changes. This is because 3rd party model should be synced
      // with the Document after RemoteChange event is emitted. If the event
      // is emitted asynchronously, the model can be changed and breaking
      // consistency.
      this.eventStreamObserver.nextSync({
        type: DocEventType.RemoteChange,
        value: changeInfos,
      });
    }

    if (logger.isEnabled(LogLevel.Debug)) {
      logger.debug(
        `after appling ${changes.length} remote changes.` +
          `elements:${this.root.getElementMapSize()}, ` +
          ` removeds:${this.root.getRemovedElementSetSize()}`,
      );
    }
  }

  /**
   * `getValueByPath` returns the JSONElement corresponding to the given path.
   */
  public getValueByPath(path: string): JSONElement | undefined {
    if (!path.startsWith('$')) {
      throw new Error('The path must start with "$"');
    }
    const pathArr = path.split('.');
    pathArr.shift();
    let value: JSONObject<any> = this.getRoot();
    for (const key of pathArr) {
      value = value[key];
      if (value === undefined) return undefined;
    }
    return value;
  }

  private createPaths(change: Change): Array<string> {
    const pathTrie = new Trie<string>('$');
    for (const op of change.getOperations()) {
      const createdAt = op.getEffectedCreatedAt();
      if (createdAt) {
        const subPaths = this.root.createSubPaths(createdAt)!;
        subPaths.shift();
        pathTrie.insert(subPaths);
      }
    }
    return pathTrie.findPrefixes().map((element) => element.join('.'));
  }

  private toOperationInfo(internalOpInfo: InternalOpInfo): OperationInfo {
    const opInfo = {} as OperationInfo;
    for (const key of Object.keys(internalOpInfo)) {
      if (key === 'element') {
        opInfo.path = this.root.createSubPaths(internalOpInfo[key])!.join('.');
      } else {
        const k = key as keyof Omit<InternalOpInfo, 'element'>;
        opInfo[k] = internalOpInfo[k];
      }
    }
    return opInfo;
  }
}
