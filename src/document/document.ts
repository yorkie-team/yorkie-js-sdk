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
import cloneDeep from 'lodash.clonedeep';
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
import { ChangeID } from '@yorkie-js-sdk/src/document/change/change_id';
import { ChangeContext } from '@yorkie-js-sdk/src/document/change/context';
import { converter } from '@yorkie-js-sdk/src/api/converter';
import { ChangePack } from '@yorkie-js-sdk/src/document/change/change_pack';
import { CRDTRoot } from '@yorkie-js-sdk/src/document/crdt/root';
import { CRDTObject } from '@yorkie-js-sdk/src/document/crdt/object';
import {
  createJSON,
  JSONElement,
  LeafElement,
  BaseArray,
  BaseObject,
} from '@yorkie-js-sdk/src/document/json/element';
import {
  Checkpoint,
  InitialCheckpoint,
} from '@yorkie-js-sdk/src/document/change/checkpoint';
import { TimeTicket } from '@yorkie-js-sdk/src/document/time/ticket';
import {
  InternalOpInfo,
  OperationInfo,
  ObjectOperationInfo,
  TextOperationInfo,
  CounterOperationInfo,
  ArrayOperationInfo,
  TreeOperationInfo,
} from '@yorkie-js-sdk/src/document/operation/operation';
import { JSONObject } from '@yorkie-js-sdk/src/document/json/object';
import { Counter } from '@yorkie-js-sdk/src/document/json/counter';
import { Text } from '@yorkie-js-sdk/src/document/json/text';
import { Tree } from '@yorkie-js-sdk/src/document/json/tree';

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
  /**
   * `PeersChanged` means that the presences of the peer clients has changed.
   */
  PeersChanged = 'peers-changed',
}

/**
 * `PeersChangedEventType` is peers changed event types
 * @public
 */
export enum PeersChangedEventType {
  /**
   * `Initialized` means that the peer list has been initialized.
   */
  Initialized = 'initialized',
  /**
   * `Watched` means that the peer has established a connection with the server,
   * enabling real-time synchronization.
   */
  Watched = 'watched',
  /**
   * `Unwatched` means that the connection has been disconnected.
   */
  Unwatched = 'unwatched',
  /**
   * `PeersChanged` means that the presences of the peer has updated.
   */
  PresenceChanged = 'presence-changed',
}

/**
 * `DocEvent` is an event that occurs in `Document`. It can be delivered
 * using `Document.subscribe()`.
 *
 * @public
 */
export type DocEvent<P extends Indexable = Indexable, T = OperationInfo> =
  | SnapshotEvent
  | LocalChangeEvent<T>
  | RemoteChangeEvent<T>
  | PeersChangedEvent<P>;

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
export interface ChangeInfo<T = OperationInfo> {
  message: string;
  operations: Array<T>;
  actor: ActorID | undefined;
}

/**
 * `LocalChangeEvent` is an event that occurs when the document is changed
 * by local changes.
 *
 * @public
 */
export interface LocalChangeEvent<T = OperationInfo> extends BaseDocEvent {
  /**
   * enum {@link DocEventType}.LocalChange
   */
  type: DocEventType.LocalChange;
  /**
   * LocalChangeEvent type
   */
  value: ChangeInfo<T>;
}

/**
 * `RemoteChangeEvent` is an event that occurs when the document is changed
 * by remote changes.
 *
 * @public
 */
export interface RemoteChangeEvent<T = OperationInfo> extends BaseDocEvent {
  /**
   * enum {@link DocEventType}.RemoteChange
   */
  type: DocEventType.RemoteChange;
  /**
   * RemoteChangeEvent type
   */
  value: ChangeInfo<T>;
}

/**
 * `PeersChangedValue` represents the value of the PeersChanged event.
 * @public
 */
export type PeersChangedValue<P extends Indexable> =
  | {
      type: PeersChangedEventType.Initialized;
      peers: Array<{ clientID: ActorID; presence: P }>;
    }
  | {
      type: PeersChangedEventType.Watched;
      peer: { clientID: ActorID; presence: P };
    }
  | {
      type: PeersChangedEventType.Unwatched;
      peer: { clientID: ActorID; presence: P };
    }
  | {
      type: PeersChangedEventType.PresenceChanged;
      peer: { clientID: ActorID; presence: P };
    };

/**
 * `PeersChangedEvent` is an event that occurs when the states of another peers
 * of the attached documents changes.
 *
 * @public
 */
export interface PeersChangedEvent<P extends Indexable> extends BaseDocEvent {
  /**
   * enum {@link DocEventType}.PeersChangedEvent
   */
  type: DocEventType.PeersChanged;
  /**
   * `PeersChangedEvent` value
   */
  value: PeersChangedValue<P>;
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
 * `OperationInfoOfElement` represents the type of the operation info of the given element.
 */
type OperationInfoOfElement<TElement> = TElement extends Text
  ? TextOperationInfo
  : TElement extends Counter
  ? CounterOperationInfo
  : TElement extends Tree
  ? TreeOperationInfo
  : TElement extends BaseArray<any>
  ? ArrayOperationInfo
  : TElement extends BaseObject<any>
  ? ObjectOperationInfo
  : OperationInfo;

/**
 * `OperationInfoOfInternal` represents the type of the operation info of the
 * given path in the Document.subscribe.
 *
 * TODO(easylogic): If the parent is optional, children cannot be inferred.
 * TODO(easylogic): Currently, the below cases of Document.subscribe are confused.
 * ```
 *  type DocType = { obj: { key: string }, text: Text }
 *  $.obj.text ->> obj's operations
 *  $.text ->> text's operations
 * ```
 */
type OperationInfoOfInternal<
  TElement,
  TKeyOrPath,
  TDepth extends number = 0,
> = TDepth extends 0
  ? TElement
  : TKeyOrPath extends `${infer TFirst}.${infer TRest}`
  ? TFirst extends keyof TElement
    ? TElement[TFirst] extends BaseArray<unknown>
      ? OperationInfoOfInternal<
          TElement[TFirst],
          number,
          DecreasedDepthOf<TDepth>
        >
      : OperationInfoOfInternal<
          TElement[TFirst],
          TRest,
          DecreasedDepthOf<TDepth>
        >
    : OperationInfo
  : TKeyOrPath extends keyof TElement
  ? TElement[TKeyOrPath] extends BaseArray<unknown>
    ? ArrayOperationInfo
    : OperationInfoOfElement<TElement[TKeyOrPath]>
  : OperationInfo;

/**
 * `DecreasedDepthOf` represents the type of the decreased depth of the given depth.
 */
type DecreasedDepthOf<Depth extends number = 0> = Depth extends 10
  ? 9
  : Depth extends 9
  ? 8
  : Depth extends 8
  ? 7
  : Depth extends 7
  ? 6
  : Depth extends 6
  ? 5
  : Depth extends 5
  ? 4
  : Depth extends 4
  ? 3
  : Depth extends 3
  ? 2
  : Depth extends 2
  ? 1
  : Depth extends 1
  ? 0
  : -1;

/**
 * `PathOfInternal` represents the type of the path of the given element.
 */
type PathOfInternal<
  TElement,
  Prefix extends string = '',
  Depth extends number = 0,
> = Depth extends 0
  ? Prefix
  : TElement extends Record<string, any>
  ? {
      [TKey in keyof TElement]: TElement[TKey] extends LeafElement
        ? `${Prefix}${TKey & string}`
        : TElement[TKey] extends BaseArray<infer TArrayElement>
        ?
            | `${Prefix}${TKey & string}`
            | `${Prefix}${TKey & string}.${number}`
            | PathOfInternal<
                TArrayElement,
                `${Prefix}${TKey & string}.${number}.`,
                DecreasedDepthOf<Depth>
              >
        :
            | `${Prefix}${TKey & string}`
            | PathOfInternal<
                TElement[TKey],
                `${Prefix}${TKey & string}.`,
                DecreasedDepthOf<Depth>
              >;
    }[keyof TElement]
  : Prefix extends `${infer TRest}.`
  ? TRest
  : Prefix;

/**
 * `OperationInfoOf` represents the type of the operation info of the given
 * path in the Document.subscribe. It is used to remove the `$.` prefix.
 */
type OperationInfoOf<
  TDocument,
  TKey extends string = '',
  TDepth extends number = 10,
> = TKey extends `$.${infer TPath}`
  ? OperationInfoOfInternal<TDocument, TPath, TDepth>
  : OperationInfoOfInternal<TDocument, TKey, TDepth>;

/**
 * `PathOf` represents the type of the all possible paths in the Document.subscribe.
 */
type PathOf<TDocument, Depth extends number = 10> = PathOfInternal<
  TDocument,
  '$.',
  Depth
>;

/**
 * `Document` is a CRDT-based data type. We can represent the model
 * of the application and edit it even while offline.
 *
 * @public
 */
export class Document<T, P extends Indexable> {
  private key: DocumentKey;
  private status: DocumentStatus;

  private root: CRDTRoot;
  private clone?: CRDTRoot;
  private changeID: ChangeID;
  private checkpoint: Checkpoint;
  private localChanges: Array<Change<P>>;

  private eventStream: Observable<DocEvent<P>>;
  private eventStreamObserver!: Observer<DocEvent<P>>;

  /**
   * `watchedPeerMap` is a map of the peers that watch the document. It is used
   * to determine whether the peer is online or offline. If the value is true
   * if the presence of the peer is stored in `peerPresenceMap`.
   */
  private watchedPeerMap: Map<ActorID, boolean>;
  private peerPresenceMap: Map<ActorID, P>;

  private changeContext: ChangeContext<P> | undefined;

  constructor(docKey: string, clientID: string) {
    this.key = docKey;
    this.status = DocumentStatus.Detached;
    this.root = CRDTRoot.create();
    this.changeID = ChangeID.initialChangeIDOf(clientID);
    this.checkpoint = InitialCheckpoint;
    this.localChanges = [];
    this.changeContext = undefined;
    this.peerPresenceMap = new Map();
    this.watchedPeerMap = new Map();
    this.eventStream = createObservable<DocEvent<P>>((observer) => {
      this.eventStreamObserver = observer;
    });
  }

  /**
   * `myClientID` returns the actor ID of the client that attaches this document.
   */
  get myClientID(): ActorID {
    // TODO(hackerwins): Consider to remove nullable from actorID.
    return this.changeID.getActorID()!;
  }

  /**
   * `create` creates a new instance of Document.
   */
  public static create<T, P extends Indexable>(
    docKey: string,
    clientID: string,
  ): Document<T, P> {
    return new Document<T, P>(docKey, clientID);
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

    if (this.changeContext) {
      try {
        const proxy = createJSON<JSONObject<T>>(
          this.changeContext,
          this.clone!.getObject(),
        );
        updater(proxy);
        return;
      } catch (err) {
        // drop clone because it is contaminated.
        this.clone = undefined;
        this.changeContext = undefined;
        logger.error(err);
        throw err;
      }
    }

    this.changeContext = ChangeContext.create<P>(
      this.changeID.next(),
      this.clone!,
      message,
    );
    try {
      const proxy = createJSON<JSONObject<T>>(
        this.changeContext,
        this.clone!.getObject(),
      );
      updater(proxy);
    } catch (err) {
      // drop clone because it is contaminated.
      this.clone = undefined;
      this.changeContext = undefined;
      logger.error(err);
      throw err;
    }

    if (!this.changeContext) return;
    if (!this.changeContext.hasChange()) {
      this.changeContext = undefined;
      return;
    }

    if (logger.isEnabled(LogLevel.Trivial)) {
      logger.trivial(`trying to update a local change: ${this.toJSON()}`);
    }

    const change = this.changeContext.getChange();
    this.localChanges.push(change);

    if (change.hasOperations()) {
      const internalOpInfos = change.execute(this.root);
      this.publish({
        type: DocEventType.LocalChange,
        value: {
          actor: this.myClientID,
          message: change.getMessage() || '',
          operations: internalOpInfos.map((internalOpInfo) =>
            this.toOperationInfo(internalOpInfo),
          ),
        },
      });
    }

    if (change.hasPresence()) {
      this.publish({
        type: DocEventType.PeersChanged,
        value: {
          type: PeersChangedEventType.PresenceChanged,
          peer: {
            clientID: this.myClientID,
            presence: this.getPresence(),
          },
        },
      });
    }

    this.changeID = change.getID();
    if (logger.isEnabled(LogLevel.Trivial)) {
      logger.trivial(`after update a local change: ${this.toJSON()}`);
    }

    this.changeContext = undefined;
  }

  /**
   * `updatePresence` updates the presence of the client who created this document.
   */
  public updatePresence(presence: Partial<P>) {
    const myPresence = this.peerPresenceMap.get(this.myClientID)!;
    for (const [key, value] of Object.entries(presence)) {
      myPresence[key as keyof P] = value as any;
    }

    if (this.changeContext) {
      this.changeContext.setPresence(cloneDeep(myPresence));
      return;
    }

    this.changeContext = ChangeContext.create<P>(
      this.changeID.next(),
      this.clone!,
    );
    this.changeContext.setPresence(cloneDeep(myPresence));
    const change = this.changeContext.getChange();
    this.localChanges.push(change);
    this.changeID = change.getID();
    this.publish({
      type: DocEventType.PeersChanged,
      value: {
        type: PeersChangedEventType.PresenceChanged,
        peer: {
          clientID: this.myClientID,
          presence: this.getPresence(),
        },
      },
    });
    this.changeContext = undefined;
  }

  /**
   * `initPresence` initializes the presence of the client who created this document.
   */
  public initPresence(presence: P) {
    this.peerPresenceMap.set(this.myClientID, cloneDeep(presence));
    this.watchedPeerMap.set(this.myClientID, true);

    const context = ChangeContext.create<P>(this.changeID.next(), this.clone!);
    context.setPresence(cloneDeep(presence));
    const change = context.getChange();
    this.localChanges.push(change);
    this.changeID = change.getID();
  }

  /**
   * `subscribe` registers a callback to subscribe to events on the document.
   * The callback will be called when the document is changed.
   */
  public subscribe(
    nextOrObserver: Observer<DocEvent<P>> | NextFn<DocEvent<P>>,
    error?: ErrorFn,
    complete?: CompleteFn,
  ): Unsubscribe;
  /**
   * `subscribe` registers a callback to subscribe to events on the document.
   * The callback will be called when the peer eestablishes or terminates a connection,
   * or updates its presence.
   */
  public subscribe(
    type: 'peers',
    next: NextFn<PeersChangedValue<P>>,
    error?: ErrorFn,
    complete?: CompleteFn,
  ): Unsubscribe;
  /**
   * `subscribe` registers a callback to subscribe to events on the document.
   * The callback will be called when the targetPath or any of its nested values change.
   */
  public subscribe<
    TPath extends PathOf<T>,
    TOperationInfo extends OperationInfoOf<T, TPath>,
  >(
    targetPath: TPath,
    next: NextFn<DocEvent<P, TOperationInfo>>,
    error?: ErrorFn,
    complete?: CompleteFn,
  ): Unsubscribe;
  /**
   * `subscribe` registers a callback to subscribe to events on the document.
   */
  public subscribe<
    TPath extends PathOf<T>,
    TOperationInfo extends OperationInfoOf<T, TPath>,
  >(
    arg1: TPath | string | Observer<DocEvent<P>> | NextFn<DocEvent<P>>,
    arg2?:
      | NextFn<DocEvent<P, TOperationInfo>>
      | NextFn<PeersChangedValue<P>>
      | ErrorFn,
    arg3?: ErrorFn | CompleteFn,
    arg4?: CompleteFn,
  ): Unsubscribe {
    if (typeof arg1 === 'string') {
      if (typeof arg2 !== 'function') {
        throw new Error('Second argument must be a callback function');
      }
      if (arg1 === 'peers') {
        const callback = arg2 as NextFn<PeersChangedValue<P>>;
        return this.eventStream.subscribe(
          (event) => {
            if (event.type === DocEventType.PeersChanged) {
              callback(event.value);
            }
          },
          arg3,
          arg4,
        );
      }
      const target = arg1;
      const callback = arg2 as NextFn<DocEvent<P>>;
      return this.eventStream.subscribe(
        (event) => {
          if (event.type === DocEventType.PeersChanged) {
            return;
          }
          if (event.type === DocEventType.Snapshot) {
            target === '$' && callback(event);
            return;
          }

          const { message, operations, actor } = event.value;
          const targetOps: Array<OperationInfo> = [];
          for (const op of operations) {
            if (this.isSameElementOrChildOf(op.path, target)) {
              targetOps.push(op);
            }
          }
          targetOps.length &&
            callback({
              type: event.type,
              value: { message, operations: targetOps, actor },
            });
        },
        arg3,
        arg4,
      );
    }
    if (typeof arg1 === 'function') {
      const callback = arg1 as NextFn<DocEvent<P>>;
      const error = arg2 as ErrorFn;
      const complete = arg3 as CompleteFn;
      return this.eventStream.subscribe(
        (event) => {
          if (event.type === DocEventType.PeersChanged) {
            return;
          }

          callback(event);
        },
        error,
        complete,
      );
    }
    throw new Error(`"${arg1}" is not a valid`);
  }

  /**
   * `publish` triggers an event in this document, which can be received by
   * callback functions from document.subscribe().
   */
  public publish(event: DocEvent<P>) {
    if (this.eventStreamObserver) {
      this.eventStreamObserver.next(event);
    }
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
  public applyChangePack(pack: ChangePack<P>): void {
    if (pack.hasSnapshot()) {
      this.applySnapshot(
        pack.getCheckpoint().getServerSeq(),
        pack.getSnapshot(),
      );
      this.applySnapshotPresence(pack.getSnapshotPresence()!);
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
  public createChangePack(): ChangePack<P> {
    const changes = Array.from(this.localChanges);
    const checkpoint = this.checkpoint.increaseClientSeq(changes.length);
    return ChangePack.create({
      key: this.key,
      checkpoint,
      isRemoved: false,
      changes,
    });
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
   * `applySnapshotPresence` applies the given presence snapshot into this document.
   */
  public applySnapshotPresence(snapshotPresence: string): void {
    this.setPeerPresenceMap(converter.fromSnapshotPresence(snapshotPresence));
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

    this.publish({
      type: DocEventType.Snapshot,
      value: snapshot,
    });
  }

  /**
   * `applyChanges` applies the given changes into this document.
   */
  public applyChanges(changes: Array<Change<P>>) {
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

    for (const change of changes) {
      const updates: {
        changeInfo?: ChangeInfo;
        peer?: PeersChangedValue<P>;
      } = {};
      const actorID = change.getID().getActorID()!;
      if (change.hasOperations()) {
        const inernalOpInfos = change.execute(this.root);
        updates.changeInfo = {
          actor: actorID,
          message: change.getMessage() || '',
          operations: inernalOpInfos.map((opInfo) =>
            this.toOperationInfo(opInfo),
          ),
        };
      }

      if (change.hasPresence()) {
        this.setPresence(actorID, change.getPresence()!);

        if (this.watchedPeerMap.has(actorID)) {
          if (this.watchedPeerMap.get(actorID) === false) {
            this.watchedPeerMap.set(actorID, true);
            updates.peer = {
              type: PeersChangedEventType.Watched,
              peer: {
                clientID: actorID,
                presence: this.getPeerPresence(actorID)!,
              },
            };
          } else {
            updates.peer = {
              type: PeersChangedEventType.PresenceChanged,
              peer: {
                clientID: actorID,
                presence: this.getPeerPresence(actorID)!,
              },
            };
          }
        }
      }
      updates.changeInfo &&
        this.publish({
          type: DocEventType.RemoteChange,
          value: updates.changeInfo,
        });
      updates.peer &&
        this.publish({
          type: DocEventType.PeersChanged,
          value: updates.peer,
        });

      this.changeID = this.changeID.syncLamport(change.getID().getLamport());
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

  /**
   * `setPresence` sets the presence of the client.
   */
  public setPresence(clientID: ActorID, presence: P) {
    this.peerPresenceMap.set(clientID, presence);
  }

  /**
   * `hasPresence` returns whether the peer presence exists regardless of
   *  whether the client is watching the document or not.
   */
  public hasPresence(clientID: ActorID): boolean {
    return this.peerPresenceMap.has(clientID);
  }

  /**
   * `setPeerPresenceMap` sets the peer presence map.
   */
  public setPeerPresenceMap(peerPresenceMap: Map<ActorID, P>) {
    this.peerPresenceMap = peerPresenceMap;
  }

  /**
   * `setWatchedPeerMap` sets the watched peer map.
   */
  public setWatchedPeerMap(watchedPeerMap: Map<ActorID, boolean>) {
    this.watchedPeerMap = watchedPeerMap;
  }

  /**
   * `addWatchedPeerMap` adds the peer to the watched peer map.
   */
  public addWatchedPeerMap(clientID: ActorID, hasPresence: boolean) {
    this.watchedPeerMap.set(clientID, hasPresence);
  }

  /**
   * `removeWatchedPeerMap` removes the peer from the watched peer map.
   */
  public removeWatchedPeerMap(clientID: ActorID) {
    this.watchedPeerMap.delete(clientID);
  }

  /**
   * `clearWatchedPeerMap` removes the other peers from the watched peer map.
   */
  public clearWatchedPeerMap() {
    const map = new Map<ActorID, boolean>();
    map.set(this.myClientID, true);
    this.watchedPeerMap = map;
  }

  /**
   * `getPresence` returns the presence of the client who created this document.
   */
  public getPresence(): P {
    return this.peerPresenceMap.get(this.myClientID)!;
  }

  /**
   * `getPeerPresence` returns the presence of the peer.
   */
  public getPeerPresence(clientID: ActorID) {
    if (!this.watchedPeerMap.get(clientID)) {
      return undefined;
    }
    return this.peerPresenceMap.get(clientID);
  }

  /**
   * `getPeers` returns the list of peers, including the client who created this document.
   */
  public getPeers(): Array<{ clientID: ActorID; presence: P }> {
    const peers: Array<{ clientID: ActorID; presence: P }> = [];
    for (const [clientID, hasPresence] of this.watchedPeerMap) {
      if (!hasPresence) continue;
      peers.push({
        clientID,
        presence: this.peerPresenceMap.get(clientID)!,
      });
    }
    return peers;
  }
}
