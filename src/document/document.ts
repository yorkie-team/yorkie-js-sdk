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
import { deepcopy } from '@yorkie-js-sdk/src/util/object';
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
import {
  Presence,
  PresenceChangeType,
} from '@yorkie-js-sdk/src/document/presence/presence';

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
 * `DocEventType` represents the type of the event that occurs in `Document`.
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
   * `Initialized` means that online clients have been loaded from the server.
   */
  Initialized = 'initialized',

  /**
   * `Watched` means that the client has established a connection with the server,
   * enabling real-time synchronization.
   */
  Watched = 'watched',

  /**
   * `Unwatched` means that the connection has been disconnected.
   */
  Unwatched = 'unwatched',

  /**
   * `PresenceChanged` means that the presences of the client has updated.
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
  | InitializedEvent<P>
  | WatchedEvent<P>
  | UnwatchedEvent<P>
  | PresenceChangedEvent<P>;

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

export interface InitializedEvent<P extends Indexable> extends BaseDocEvent {
  type: DocEventType.Initialized;
  value: Array<{ clientID: ActorID; presence: P }>;
}

export interface WatchedEvent<P extends Indexable> extends BaseDocEvent {
  type: DocEventType.Watched;
  value: { clientID: ActorID; presence: P };
}

export interface UnwatchedEvent<P extends Indexable> extends BaseDocEvent {
  type: DocEventType.Unwatched;
  value: { clientID: ActorID; presence: P };
}

export interface PresenceChangedEvent<P extends Indexable>
  extends BaseDocEvent {
  type: DocEventType.PresenceChanged;
  value: { clientID: ActorID; presence: P };
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
export class Document<T, P extends Indexable = Indexable> {
  private key: DocumentKey;
  private status: DocumentStatus;

  private changeID: ChangeID;
  private checkpoint: Checkpoint;
  private localChanges: Array<Change<P>>;

  private root: CRDTRoot;
  private clone?: {
    root: CRDTRoot;
    presences: Map<ActorID, P>;
  };

  private eventStream: Observable<DocEvent<P>>;
  private eventStreamObserver!: Observer<DocEvent<P>>;

  /**
   * `onlineClients` is a set of client IDs that are currently online.
   */
  private onlineClients: Set<ActorID>;

  /**
   * `presences` is a map of client IDs to their presence information.
   */
  private presences: Map<ActorID, P>;

  constructor(key: string) {
    this.key = key;
    this.status = DocumentStatus.Detached;
    this.root = CRDTRoot.create();

    this.changeID = InitialChangeID;
    this.checkpoint = InitialCheckpoint;
    this.localChanges = [];

    this.eventStream = createObservable<DocEvent<P>>((observer) => {
      this.eventStreamObserver = observer;
    });

    this.onlineClients = new Set();
    this.presences = new Map();
  }

  /**
   * `update` executes the given updater to update this document.
   */
  public update(
    updater: (root: JSONObject<T>, presence: Presence<P>) => void,
    message?: string,
  ): void {
    if (this.getStatus() === DocumentStatus.Removed) {
      throw new YorkieError(Code.DocumentRemoved, `${this.key} is removed`);
    }

    this.ensureClone();
    const context = ChangeContext.create<P>(
      this.changeID.next(),
      this.clone!.root,
      message,
    );
    const actorID = this.changeID.getActorID()!;

    try {
      const proxy = createJSON<JSONObject<T>>(
        context,
        this.clone!.root.getObject(),
      );

      if (!this.presences.has(actorID)) {
        this.clone!.presences.set(actorID, {} as P);
      }

      updater(
        proxy,
        new Presence(context, this.clone!.presences.get(actorID)!),
      );
    } catch (err) {
      // drop clone because it is contaminated.
      this.clone = undefined;
      logger.error(err);
      throw err;
    }

    if (context.hasChange()) {
      if (logger.isEnabled(LogLevel.Trivial)) {
        logger.trivial(`trying to update a local change: ${this.toJSON()}`);
      }

      const change = context.getChange();
      const opInfos = change.execute(this.root, this.presences);
      this.localChanges.push(change);
      this.changeID = change.getID();

      if (change.hasOperations()) {
        this.publish({
          type: DocEventType.LocalChange,
          value: {
            message: change.getMessage() || '',
            operations: opInfos,
            actor: actorID,
          },
        });
      }

      if (change.hasPresenceChange()) {
        this.publish({
          type: DocEventType.PresenceChanged,
          value: {
            clientID: actorID,
            presence: this.getPresence(actorID)!,
          },
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
   * The callback will be called when the clients watching the document
   * establishe or update its presence.
   */
  public subscribe(
    type: 'presence',
    next: NextFn<DocEvent<P>>,
    error?: ErrorFn,
    complete?: CompleteFn,
  ): Unsubscribe;
  /**
   * `subscribe` registers a callback to subscribe to events on the document.
   * The callback will be called when the current client establishes or updates its presence.
   */
  public subscribe(
    type: 'my-presence',
    next: NextFn<DocEvent<P>>,
    error?: ErrorFn,
    complete?: CompleteFn,
  ): Unsubscribe;
  /**
   * `subscribe` registers a callback to subscribe to events on the document.
   * The callback will be called when the client establishes or terminates a connection,
   * or updates its presence.
   */
  public subscribe(
    type: 'others',
    next: NextFn<DocEvent<P>>,
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
    arg2?: NextFn<DocEvent<P, TOperationInfo>> | NextFn<DocEvent<P>> | ErrorFn,
    arg3?: ErrorFn | CompleteFn,
    arg4?: CompleteFn,
  ): Unsubscribe {
    if (typeof arg1 === 'string') {
      if (typeof arg2 !== 'function') {
        throw new Error('Second argument must be a callback function');
      }
      if (arg1 === 'presence') {
        const callback = arg2 as NextFn<DocEvent<P>>;
        return this.eventStream.subscribe(
          (event) => {
            if (
              event.type !== DocEventType.Initialized &&
              event.type !== DocEventType.Watched &&
              event.type !== DocEventType.Unwatched &&
              event.type !== DocEventType.PresenceChanged
            ) {
              return;
            }

            callback(event);
          },
          arg3,
          arg4,
        );
      }
      if (arg1 === 'my-presence') {
        const callback = arg2 as NextFn<DocEvent<P>>;
        return this.eventStream.subscribe(
          (event) => {
            if (
              event.type !== DocEventType.Initialized &&
              event.type !== DocEventType.Watched &&
              event.type !== DocEventType.Unwatched &&
              event.type !== DocEventType.PresenceChanged
            ) {
              return;
            }

            if (
              event.type !== DocEventType.Initialized &&
              event.value.clientID !== this.changeID.getActorID()
            ) {
              return;
            }

            callback(event);
          },
          arg3,
          arg4,
        );
      }
      if (arg1 === 'others') {
        const callback = arg2 as NextFn<DocEvent<P>>;
        return this.eventStream.subscribe(
          (event) => {
            if (
              event.type !== DocEventType.Watched &&
              event.type !== DocEventType.Unwatched &&
              event.type !== DocEventType.PresenceChanged
            ) {
              return;
            }

            if (event.value.clientID !== this.changeID.getActorID()) {
              callback(event);
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
          if (
            event.type === DocEventType.Initialized ||
            event.type === DocEventType.Watched ||
            event.type === DocEventType.Unwatched ||
            event.type === DocEventType.PresenceChanged
          ) {
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
              value: {
                message,
                operations: targetOps,
                actor,
              },
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
          if (
            event.type === DocEventType.Initialized ||
            event.type === DocEventType.Watched ||
            event.type === DocEventType.Unwatched ||
            event.type === DocEventType.PresenceChanged
          ) {
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

    this.clone = {
      root: this.root.deepcopy(),
      presences: deepcopy(this.presences),
    };
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
  public getCloneRoot(): CRDTObject | undefined {
    if (!this.clone) {
      return;
    }

    return this.clone.root.getObject();
  }

  /**
   * `getRoot` returns a new proxy of cloned root.
   */
  public getRoot(): JSONObject<T> {
    this.ensureClone();

    const context = ChangeContext.create(
      this.changeID.next(),
      this.clone!.root,
    );
    return createJSON<T>(context, this.clone!.root.getObject());
  }

  /**
   * `garbageCollect` purges elements that were removed before the given time.
   *
   * @internal
   */
  public garbageCollect(ticket: TimeTicket): number {
    if (this.clone) {
      this.clone.root.garbageCollect(ticket);
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
    const { root, presences } = converter.bytesToSnapshot<P>(snapshot);
    this.root = new CRDTRoot(root);
    this.presences = presences;
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
  public applyChanges(changes: Array<Change<P>>): void {
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
              `${change.getID().toTestString()}\t${change.toTestString()}`,
          )
          .join('\n'),
      );
    }

    this.ensureClone();
    for (const change of changes) {
      change.execute(this.clone!.root, this.clone!.presences);

      let changeInfo: ChangeInfo | undefined;
      let docEvent: DocEvent<P> | undefined;
      const actorID = change.getID().getActorID()!;
      if (change.hasPresenceChange() && this.onlineClients.has(actorID)) {
        const presenceChange = change.getPresenceChange()!;
        switch (presenceChange.type) {
          case PresenceChangeType.Put:
            // NOTE(chacha912): When the user exists in onlineClients, but
            // their presence was initially absent, we can consider that we have
            // received their initial presence, so trigger the 'watched' event.
            docEvent = {
              type: this.presences.has(actorID)
                ? DocEventType.PresenceChanged
                : DocEventType.Watched,
              value: {
                clientID: actorID,
                presence: presenceChange.presence,
              },
            };
            break;
          case PresenceChangeType.Clear:
            // NOTE(chacha912): When the user exists in onlineClients, but
            // PresenceChange(clear) is received, we can consider it as detachment
            // occurring before unwatching.
            // Detached user is no longer participating in the document, we remove
            // them from the online clients and trigger the 'unwatched' event.
            docEvent = {
              type: DocEventType.Unwatched,
              value: {
                clientID: actorID,
                presence: this.getPresence(actorID)!,
              },
            };
            this.removeOnlineClient(actorID);
            break;
          default:
            break;
        }
      }

      const opInfos = change.execute(this.root, this.presences);
      if (change.hasOperations()) {
        changeInfo = {
          actor: actorID,
          message: change.getMessage() || '',
          operations: opInfos,
        };
      }

      // DocEvent should be emitted synchronously with applying changes.
      // This is because 3rd party model should be synced with the Document
      // after RemoteChange event is emitted. If the event is emitted
      // asynchronously, the model can be changed and breaking consistency.
      if (changeInfo) {
        this.publish({
          type: DocEventType.RemoteChange,
          value: changeInfo,
        });
      }
      if (docEvent) {
        this.publish(docEvent);
      }

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
      throw new YorkieError(Code.InvalidArgument, `path must start with "$"`);
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

  /**
   * `setOnlineClients` sets the given online client set.
   *
   * @internal
   */
  public setOnlineClients(onlineClients: Set<ActorID>) {
    this.onlineClients = onlineClients;
  }

  /**
   * `addOnlineClient` adds the given clientID into the online client set.
   *
   * @internal
   */
  public addOnlineClient(clientID: ActorID) {
    this.onlineClients.add(clientID);
  }

  /**
   * `removeOnlineClient` removes the clientID from the online client set.
   *
   * @internal
   */
  public removeOnlineClient(clientID: ActorID) {
    this.onlineClients.delete(clientID);
  }

  /**
   * `hasPresence` returns whether the given clientID has a presence or not.
   *
   * @internal
   */
  public hasPresence(clientID: ActorID): boolean {
    return this.presences.has(clientID);
  }

  /**
   * `getMyPresence` returns the presence of the current client.
   */
  public getMyPresence(): P {
    if (this.status !== DocumentStatus.Attached) {
      return {} as P;
    }

    const p = this.presences.get(this.changeID.getActorID()!)!;
    return deepcopy(p);
  }

  /**
   * `getPresence` returns the presence of the given clientID.
   */
  public getPresence(clientID: ActorID): P | undefined {
    if (!this.onlineClients.has(clientID)) return;
    const p = this.presences.get(clientID);
    return p ? deepcopy(p) : undefined;
  }

  /**
   * `getPresenceForTest` returns the presence of the given clientID
   * regardless of whether the client is online or not.
   *
   * @internal
   */
  public getPresenceForTest(clientID: ActorID): P | undefined {
    const p = this.presences.get(clientID);
    return p ? deepcopy(p) : undefined;
  }

  /**
   * `getPresences` returns the presences of online clients.
   */
  public getPresences(): Array<{ clientID: ActorID; presence: P }> {
    const presences: Array<{ clientID: ActorID; presence: P }> = [];
    for (const clientID of this.onlineClients) {
      if (this.presences.has(clientID)) {
        presences.push({
          clientID,
          presence: deepcopy(this.presences.get(clientID)!),
        });
      }
    }
    return presences;
  }
}
