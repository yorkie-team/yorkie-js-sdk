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
import { createJSON } from '@yorkie-js-sdk/src/document/json/element';
import {
  Checkpoint,
  InitialCheckpoint,
} from '@yorkie-js-sdk/src/document/change/checkpoint';
import { TimeTicket } from '@yorkie-js-sdk/src/document/time/ticket';
import { JSONObject } from './json/object';

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
 * `ChangeInfo` represents a pair of `Change` and the JsonPath of the changed
 * element.
 */
export interface ChangeInfo {
  change: Change;
  paths: Array<string>;
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
 * `Document` is a CRDT-based data type. We can representing the model
 * of the application. And we can edit it even while offline.
 *
 * @public
 */
export class Document<T> implements Observable<DocEvent> {
  private key: string;
  private root: CRDTRoot;
  private clone?: CRDTRoot;
  private changeID: ChangeID;
  private checkpoint: Checkpoint;
  private localChanges: Array<Change>;
  private eventStream: Observable<DocEvent>;
  private eventStreamObserver!: Observer<DocEvent>;

  constructor(key: string) {
    this.key = key;
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
    return ChangePack.create(this.key, checkpoint, changes);
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
  public getRoot(): T {
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
    this.root = new CRDTRoot(obj);

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

    if (logger.isEnabled(LogLevel.Debug)) {
      logger.debug(
        `after appling ${changes.length} remote changes.` +
          `elements:${this.root.getElementMapSize()}, ` +
          ` removeds:${this.root.getRemovedElementSetSize()}`,
      );
    }
  }

  private createPaths(change: Change): Array<string> {
    const pathTree = new PathTree();
    for (const op of change.getOperations()) {
      const createdAt = op.getEffectedCreatedAt();
      if (createdAt) {
        const path = this.root.createPath(createdAt)!;
        const pathArray = path.split('.');
        pathArray.shift();
        pathTree.insert(pathArray);
      }
    }
    //return a reduced number of paths
    return pathTree.getValidPaths();
  }
}

/**
 * `PathTree` is a tree data structure to reduce the number of paths
 */
class PathTree {
  private root: PathNode;
  constructor() {
    this.root = new PathNode('$', undefined);
  }
  /**
   * `insert` inserts the paths passed as params to the PathTree
   */
  insert(keys: Array<string>) {
    let tempParentNode = this.root;
    for (const key of keys) {
      if (tempParentNode.children.length === 0) {
        const newNode = new PathNode(key, tempParentNode);
        tempParentNode.addChildrenNode(newNode);
        tempParentNode = newNode;
      } else {
        for (const child of tempParentNode.children) {
          if (child.key === key) {
            tempParentNode = child;
          }
        }
        if (tempParentNode.key !== key) {
          const newNode = new PathNode(key, tempParentNode);
          tempParentNode.addChildrenNode(newNode);
          tempParentNode = newNode;
        }
      }
    }
    tempParentNode.isLeaf = true;
  }

  /**
   * `traverseKeys` traverses the nodes and pushes valid paths to the validPaths array
   */
  traverseKeys(node: PathNode, validPaths: Array<string>): void {
    for (const child of node.children) {
      if (child.isLeaf) {
        validPaths.push(child.path);
      } else {
        this.traverseKeys(child, validPaths);
      }
    }
  }

  /**
   * `getValidPaths` returns the necessary paths
   */
  getValidPaths(): Array<string> {
    const validPaths: Array<string> = [];
    this.traverseKeys(this.root, validPaths);
    return validPaths;
  }
}

/**
 * `PathNode` is a node for `PathTree` class
 */
class PathNode {
  public key: string;
  public parent: PathNode | undefined;
  public children: Array<PathNode>;
  public path: string;
  public isLeaf: boolean;

  constructor(key: string, parent: PathNode | undefined) {
    this.key = key;
    this.children = [];
    this.parent = parent;
    if (parent) {
      this.path = parent.path.concat(`.${key}`);
    } else {
      this.path = key;
    }
    this.isLeaf = false;
  }

  /**
   * `addChildrenNode` adds the node to children
   */
  public addChildrenNode(node: PathNode): void {
    this.children.push(node);
  }
}
