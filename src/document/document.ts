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
import { JSONObject } from '@yorkie-js-sdk/src/document/json/object';
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
 * `DocEvent` is an event that occurs in `Document`. It can be delivered
 * using `Document.subscribe()`.
 *
 * @public
 */
export type DocEvent<P extends Indexable> =
  | SnapshotEvent
  | LocalChangeEvent<P>
  | RemoteChangeEvent<P>
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
export interface ChangeInfo<P extends Indexable> {
  message: string;
  operations: Array<OperationInfo>;
  presence: P | undefined;
  actor: ActorID | undefined;
}

/**
 * `LocalChangeEvent` is an event that occurs when the document is changed
 * by local changes.
 *
 * @public
 */
export interface LocalChangeEvent<P extends Indexable> extends BaseDocEvent {
  /**
   * enum {@link DocEventType}.LocalChange
   */
  type: DocEventType.LocalChange;
  /**
   * LocalChangeEvent type
   */
  value: Array<ChangeInfo<P>>;
}

/**
 * `RemoteChangeEvent` is an event that occurs when the document is changed
 * by remote changes.
 *
 * @public
 */
export interface RemoteChangeEvent<P extends Indexable> extends BaseDocEvent {
  /**
   * enum {@link DocEventType}.RemoteChange
   */
  type: DocEventType.RemoteChange;
  /**
   * RemoteChangeEvent type
   */
  value: Array<ChangeInfo<P>>;
}

/**
 * `PeersChangedValue` represents the value of the PeersChanged event.
 * @public
 */
export type PeersChangedValue<P extends Indexable> = {
  type: 'initialized' | 'watched' | 'unwatched' | 'presence-changed';
  peers: Array<{ clientID: ActorID; presence: P }>;
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
 * `PresenceInfo` is presence information of peer.
 */
export type PresenceInfo<P extends Indexable> = {
  clock: number;
  data: P;
};

/**
 * `Peer` represents the presence information of a peer.
 * It is used to deliver changes in peer presence to the remote.
 */
export type Peer<P extends Indexable> = {
  id: ActorID;
  presence: PresenceInfo<P>;
};

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
  private peerPresenceMap: Map<ActorID, PresenceInfo<P>>;
  private myClientID: ActorID;
  private changeContext: ChangeContext<P> | undefined;

  constructor(docKey: string, clientID: string, initialPresence: P) {
    this.key = docKey;
    this.status = DocumentStatus.Detached;
    this.root = CRDTRoot.create();
    this.changeID = ChangeID.getInitialChangeID(clientID);
    this.checkpoint = InitialCheckpoint;
    this.localChanges = [];
    this.peerPresenceMap = new Map();
    this.peerPresenceMap.set(clientID, {
      clock: 0,
      data: initialPresence,
    });
    this.myClientID = clientID;
    this.changeContext = undefined;

    this.eventStream = createObservable<DocEvent<P>>((observer) => {
      this.eventStreamObserver = observer;
    });
  }

  /**
   * `create` creates a new instance of Document.
   */
  public static create<T, P extends Indexable>(
    docKey: string,
    clientID: string,
    initialPresence: P,
  ): Document<T, P> {
    return new Document<T, P>(docKey, clientID, initialPresence);
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
    if (!this.changeContext) {
      this.changeContext = ChangeContext.create<P>(
        this.changeID.next(),
        this.clone!,
        message,
      );
    }
    try {
      const proxy = createJSON<JSONObject<T>>(
        this.changeContext,
        this.clone!.getObject(),
      );
      updater(proxy);
    } catch (err) {
      // drop clone because it is contaminated.
      this.clone = undefined;
      logger.error(err);
      throw err;
    }

    if (this.changeContext.hasChange()) {
      if (logger.isEnabled(LogLevel.Trivial)) {
        logger.trivial(`trying to update a local change: ${this.toJSON()}`);
      }

      const change = this.changeContext.getChange();
      const internalOpInfos = change.execute(this.root);
      this.localChanges.push(change);
      this.changeID = change.getID();

      this.publish({
        type: DocEventType.LocalChange,
        value: [
          {
            message: change.getMessage() || '',
            operations: internalOpInfos.map((internalOpInfo) =>
              this.toOperationInfo(internalOpInfo),
            ),
            presence: this.changeContext.hasPresence()
              ? this.getPresence()
              : undefined,
            actor: change.getID().getActorID(),
          },
        ],
      });

      if (logger.isEnabled(LogLevel.Trivial)) {
        logger.trivial(`after update a local change: ${this.toJSON()}`);
      }
    }

    this.changeContext = undefined;
  }

  /**
   * `updatePresence` updates the presence of the client who created this document.
   */
  public updatePresence<K extends keyof P>(key: K, value: P[K]) {
    const myPresence = this.peerPresenceMap.get(this.myClientID)!;
    myPresence.clock += 1;
    myPresence.data[key] = value;

    if (this.changeContext) {
      this.changeContext.setPresence(cloneDeep(myPresence));
    }
    // TODO(chacha912): handle when updatePresence is called without a changeContext
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
   * The callback will be called when the targetPath or any of its nested values change.
   */
  public subscribe(
    targetPath: string,
    next: NextFn<DocEvent<P>>,
    error?: ErrorFn,
    complete?: CompleteFn,
  ): Unsubscribe;
  /**
   * Subscribe to the peer updates.
   */
  public subscribe(
    type: 'peers',
    next: NextFn<PeersChangedValue<P>>,
    error?: ErrorFn,
    complete?: CompleteFn,
  ): Unsubscribe;
  /**
   * `subscribe` registers a callback to subscribe to events on the document.
   */
  public subscribe(
    arg1: string | Observer<DocEvent<P>> | NextFn<DocEvent<P>>,
    arg2?: NextFn<DocEvent<P>> | NextFn<PeersChangedValue<P>> | ErrorFn,
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

          const changeInfos: Array<ChangeInfo<P>> = [];
          for (const { message, operations, presence, actor } of event.value) {
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
                presence,
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

    this.clone = this.root.deepcopy();
  }

  /**
   * `createChangePack` create a change pack with local changes and presence updates
   * for sending to the remote server.
   *
   * @internal
   */
  public createChangePack(): ChangePack<P> {
    const changes = this.localChanges;
    const checkpoint = this.checkpoint.increaseClientSeq(changes.length);
    return ChangePack.create({
      key: this.key,
      checkpoint,
      isRemoved: false,
      changes,
    });
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

    const changeInfos: Array<ChangeInfo<P>> = [];
    for (const change of changes) {
      const actorID = change.getID().getActorID()!;
      const inernalOpInfos = change.execute(this.root);
      const changeInfo: ChangeInfo<P> = {
        actor: actorID,
        message: change.getMessage() || '',
        operations: inernalOpInfos.map((opInfo) =>
          this.toOperationInfo(opInfo),
        ),
        presence: undefined,
      };
      if (change.hasPresenceInfo() && this.hasPeer(actorID)) {
        this.setPresenceInfo(actorID, change.getPresenceInfo()!);
        changeInfo.presence = change.getPresenceInfo()!.data;
      }
      this.changeID = this.changeID.syncLamport(change.getID().getLamport());
      changeInfos.push(changeInfo);
    }
    this.publish({
      type: DocEventType.RemoteChange,
      value: changeInfos,
    });

    if (logger.isEnabled(LogLevel.Debug)) {
      logger.debug(
        `after appling ${changes.length} remote changes.` +
          `elements:${this.root.getElementMapSize()}, ` +
          ` removeds:${this.root.getRemovedElementSetSize()}`,
      );
    }
    return changeInfos;
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
   * `setPresenceInfo` sets the presence information of the client.
   */
  public setPresenceInfo(
    clientID: ActorID,
    presenceInfo: PresenceInfo<P>,
  ): void {
    if (
      this.peerPresenceMap.has(clientID) &&
      this.peerPresenceMap.get(clientID)!.clock > presenceInfo.clock
    ) {
      return;
    }

    this.peerPresenceMap.set(clientID, presenceInfo);
  }

  /**
   * `getPresenceInfo` returns the presence information of the client.
   */
  public getPresenceInfo(clientID: ActorID): PresenceInfo<P> {
    if (!this.peerPresenceMap.has(clientID)) {
      throw new Error(`There is no peer with the ID ${clientID}`);
    }
    return this.peerPresenceMap.get(clientID)!;
  }

  /**
   * `removePresenceInfo` removes the presence information of the client.
   */
  public removePresenceInfo(clientID: ActorID): void {
    this.peerPresenceMap.delete(clientID);
  }

  /**
   * `getPresence` returns the presence of the client who created this document.
   */
  public getPresence(): P {
    return this.peerPresenceMap.get(this.myClientID)!.data;
  }

  /**
   * `getPeerPresence` returns the presence of the peer.
   */
  public getPeerPresence(clientID: ActorID) {
    return this.peerPresenceMap.get(clientID)?.data;
  }

  /**
   * `getPeers` returns the list of peers, including the client who created this document.
   */
  public getPeers(): Array<{ clientID: ActorID; presence: P }> {
    const peers: Array<{ clientID: ActorID; presence: P }> = [];
    for (const [clientID, presenceInfo] of this.peerPresenceMap!) {
      peers.push({ clientID, presence: presenceInfo.data });
    }
    return peers;
  }

  /**
   * `hasPeer` returns whether the peer exists.
   */
  public hasPeer(clientID: ActorID): boolean {
    return this.peerPresenceMap.has(clientID);
  }
}
