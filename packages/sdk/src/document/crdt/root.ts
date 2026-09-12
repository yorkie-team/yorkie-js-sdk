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

import {
  InitialTimeTicket,
  TimeTicket,
  TimeTicketSize,
} from '@yorkie-js/sdk/src/document/time/ticket';
import {
  CRDTContainer,
  CRDTElement,
} from '@yorkie-js/sdk/src/document/crdt/element';
import { CRDTObject } from '@yorkie-js/sdk/src/document/crdt/object';
import { GCPair } from '@yorkie-js/sdk/src/document/crdt/gc';
import { CRDTText } from '@yorkie-js/sdk/src/document/crdt/text';
import { CRDTTree } from '@yorkie-js/sdk/src/document/crdt/tree';
import { CRDTArray } from '@yorkie-js/sdk/src/document/crdt/array';
import { Code, YorkieError } from '@yorkie-js/sdk/src/util/error';
import { VersionVector } from '../time/version_vector';
import {
  DataSize,
  addDataSizes,
  subDataSize,
  DocSize,
} from '@yorkie-js/sdk/src/util/resource';
import { RHTNode } from '@yorkie-js/sdk/src/document/crdt/rht';

/**
 * `CRDTElementPair` is a structure that represents a pair of element and its
 * parent. It is used to find the parent of a specific element to perform
 * garbage collection and to find the path of a specific element.
 */
interface CRDTElementPair {
  element: CRDTElement;
  parent?: CRDTContainer;
}

/**
 * `GCCharge` is what `docSize.gc` is holding on behalf of one element, and
 * which element that is. See `Root.sizeInGC` for why the identity matters.
 */
interface GCCharge {
  element: CRDTElement;
  size: DataSize;
}

/**
 * `RootStats` is a structure that represents the statistics of the root object.
 */
export interface RootStats {
  /**
   * `elements` is the number of elements in the root object.
   */
  elements?: number;

  /**
   * `gcElements` is the number of elements that can be garbage collected.
   */
  gcElements?: number;

  /**
   * `gcPairs` is the number of garbage collection pairs.
   */
  gcPairs?: number;
}

/**
 * `CRDTRoot` is a structure that represents the root. It has a hash table of
 * all elements to find a specific element when applying remote changes
 * received from server.
 *
 * Every element has a unique `TimeTicket` at creation, which allows us to find
 * a particular element.
 */
export class CRDTRoot {
  /**
   * `rootObject` is the root object of the document.
   */
  private rootObject: CRDTObject;

  /**
   * `elementPairMapByCreatedAt` is a hash table that maps the creation time of
   * an element to the element itself and its parent.
   */
  private elementPairMapByCreatedAt: Map<string, CRDTElementPair>;

  /**
   * `gcElementSetByCreatedAt` is a hash set that contains the creation
   * time of the removed element. It is used to find the removed element when
   * executing garbage collection.
   */
  private gcElementSetByCreatedAt: Set<string>;

  /**
   * `sizeInGC` maps the creation time of every registered element whose size
   * counts toward `docSize.gc` rather than `docSize.live`, to the exact amount
   * charged and to the element it is charged for. Each element's size belongs
   * to exactly one of the two, and an element reaches gc by more routes than it
   * has removals: it can be removed itself, or be a descendant of a removed
   * container. Recording the amount rather than a flag keeps the two sides
   * symmetric even though `getDataSize` is not stable over an element's
   * lifetime -- it grows by a ticket the moment `removedAt` is set, which can
   * happen after the size has already moved.
   *
   * The identity is load-bearing. A createdAt is meant to name one element, but
   * it does not for the whole of a document's life: undo restores a `deepcopy`
   * of a removed element, and the copy keeps the original's createdAt while the
   * original is still a tombstone. Charging or releasing by key alone then
   * bills whichever of the two occupies the slot, and a size can be taken out
   * of `docSize.live` that live was never holding -- which is how docSize goes
   * negative.
   *
   * A zero size is not the same as no record. It says this element has been
   * released: charged to neither side, because its subtree was orphaned by a
   * restore and nothing will ever collect it. Anything that later charges it
   * again has to know live is not the side to take it from.
   */
  private sizeInGC: Map<string, GCCharge>;

  /**
   * `gcPairMap` is a hash table that maps the IDString of GCChild to the
   * element itself and its parent.
   */
  private gcPairMap: Map<string, GCPair>;

  /**
   * `docSize` is a structure that represents the size of the document.
   */
  private docSize: DocSize;

  constructor(rootObject: CRDTObject) {
    this.rootObject = rootObject;
    this.elementPairMapByCreatedAt = new Map();
    this.gcElementSetByCreatedAt = new Set();
    this.sizeInGC = new Map();
    this.gcPairMap = new Map();
    this.docSize = { live: { data: 0, meta: 0 }, gc: { data: 0, meta: 0 } };
    this.registerElement(rootObject, undefined);

    rootObject.getDescendants((elem) => {
      if (elem.getRemovedAt()) {
        this.registerRemovedElement(elem);
      }
      if (elem instanceof CRDTText || elem instanceof CRDTTree) {
        for (const pair of elem.getGCPairs()) {
          this.registerGCPair(pair);
        }
      }
      if (elem instanceof CRDTArray) {
        // Register dead position nodes for GC.
        for (const node of elem.getAllRGANodes()) {
          if (!node.getElementEntry() && node.getRemovedAt()) {
            this.registerGCPair({
              parent: elem.getRGATreeList(),
              child: node,
            });
          }
        }
      }
      return false;
    });
  }

  /**
   * `create` creates a new instance of Root.
   */
  public static create(): CRDTRoot {
    return new CRDTRoot(CRDTObject.create(InitialTimeTicket));
  }

  /**
   * `findByCreatedAt` returns the element of given creation time.
   */
  public findByCreatedAt(createdAt: TimeTicket): CRDTElement | undefined {
    const pair = this.elementPairMapByCreatedAt.get(createdAt.toIDString());
    if (!pair) {
      return;
    }

    return pair.element;
  }

  /**
   * `findElementPairByCreatedAt` returns the element and parent pair
   * of given creation time.
   */
  public findElementPairByCreatedAt(
    createdAt: TimeTicket,
  ): CRDTElementPair | undefined {
    return this.elementPairMapByCreatedAt.get(createdAt.toIDString());
  }

  /**
   * `createSubPaths` creates an array of the sub paths for the given element.
   */
  public createSubPaths(createdAt: TimeTicket): Array<string> {
    let pair = this.elementPairMapByCreatedAt.get(createdAt.toIDString());
    if (!pair) {
      return [];
    }

    const subPaths: Array<string> = [];
    while (pair.parent) {
      const createdAt = pair.element.getCreatedAt();
      const subPath = pair.parent.subPathOf(createdAt);
      if (subPath === undefined) {
        throw new YorkieError(
          Code.ErrInvalidArgument,
          `cant find the given element: ${createdAt.toIDString()}`,
        );
      }

      subPaths.unshift(subPath!);
      pair = this.elementPairMapByCreatedAt.get(
        pair.parent.getCreatedAt().toIDString(),
      )!;
    }

    subPaths.unshift('$');
    return subPaths;
  }

  /**
   * `createPath` creates path of the given element.
   */
  public createPath(createdAt: TimeTicket): string {
    return this.createSubPaths(createdAt).join('.');
  }

  /**
   * `registerElement` registers the given element and its descendants to hash table.
   */
  public registerElement(element: CRDTElement, parent?: CRDTContainer): void {
    this.elementPairMapByCreatedAt.set(element.getCreatedAt().toIDString(), {
      parent,
      element,
    });
    addDataSizes(this.docSize.live, element.getDataSize());

    if (element instanceof CRDTContainer) {
      element.getDescendants((elem, par) => {
        this.elementPairMapByCreatedAt.set(elem.getCreatedAt().toIDString(), {
          parent: par,
          element: elem,
        });
        addDataSizes(this.docSize.live, elem.getDataSize());
        return false;
      });
    }
  }

  /**
   * `deregisterElement` deregister the given element and its descendants from hash table.
   */
  public deregisterElement(element: CRDTElement): number {
    let count = 0;

    const deregisterElementInternal = (elem: CRDTElement) => {
      const createdAt = elem.getCreatedAt().toIDString();
      // Subtract the size from wherever it is actually counted, and by the
      // amount actually charged. A descendant created inside an
      // already-removed container never passed through a removal, so it still
      // sits in live; subtracting it from gc would push gc below zero and
      // leave its cost in live forever.
      // A charge recorded against some other element that shares this
      // createdAt says nothing about this one, which is still in live.
      const charged = this.sizeInGC.get(createdAt);
      if (charged && charged.element === elem) {
        subDataSize(this.docSize.gc, charged.size);
        this.sizeInGC.delete(createdAt);
      } else {
        subDataSize(this.docSize.live, elem.getDataSize());
      }

      // NOTE(hackerwins): Drop the index entries by identity, not by key. A
      // createdAt is meant to name one element, but undo breaks that: it
      // restores a `deepcopy` of a removed container, and the copy keeps every
      // descendant's createdAt while the original is still a tombstone. Only
      // the top level of an undone array set gets a fresh ticket, so the
      // descendants below it are answered by the live copy while the tombstone
      // is still the one being collected here. Deleting by key would evict the
      // live element's entry, and every later operation addressed at it throws
      // `fail to find` -- inside `applyChangePack`, which is the permanent
      // desync this release exists to stop.
      //
      // The tombstone loses nothing by it: it is already unlinked from the
      // tree, and whatever now owns the slot will clear it when its own turn
      // comes. `gcElementSetByCreatedAt` carries no element of its own, so the
      // pair map is what decides the identity for both.
      if (this.elementPairMapByCreatedAt.get(createdAt)?.element === elem) {
        this.elementPairMapByCreatedAt.delete(createdAt);
        this.gcElementSetByCreatedAt.delete(createdAt);
      }
      count++;
    };

    deregisterElementInternal(element);
    if (element instanceof CRDTContainer) {
      element.getDescendants((e) => {
        deregisterElementInternal(e);
        return false;
      });
    }

    return count;
  }

  /**
   * `registerRemovedElement` registers the given element to the hash set.
   */
  public registerRemovedElement(element: CRDTElement): void {
    const moved = this.moveSizeToGC(element);

    // NOTE(hackerwins): registerElement books a container and every descendant
    // into live, and deregisterElement subtracts both when the tombstone is
    // collected. Removing a container therefore has to move its descendants as
    // well: booking only the container itself would strand their size in live
    // forever and drive gc negative once the collection subtracted them.
    if (element instanceof CRDTContainer) {
      element.getDescendants((elem) => {
        this.moveSizeToGC(elem);
        return false;
      });
    }

    // NOTE(hackerwins): When an element is removed, parent sets the removedAt
    // to mark the child as removed. That ticket is part of the size charged to
    // gc just now, but it was not part of what live held -- registerElement ran
    // before the removal -- so live gets it back. Only on the move that carried
    // it: a size already in gc, or one moved as a descendant while its own
    // removedAt is still unset, did not.
    //
    // This holds for the incremental path. The constructor instead registers an
    // already-tombstoned element at its post-removal size, so live did hold the
    // ticket and the refund over-credits it by one per tombstone. That drift is
    // pre-existing and unchanged here.
    if (moved && element.getRemovedAt()) {
      this.docSize.live.meta += TimeTicketSize;
    }

    this.gcElementSetByCreatedAt.add(element.getCreatedAt().toIDString());
  }

  /**
   * `moveSizeToGC` moves the size of the given element from live to gc, and
   * reports whether it moved a size live was holding. A size already charged to
   * gc for this same element -- because it was removed before, because a
   * container above it was, or because a restore released it -- only has its
   * charge topped up: getDataSize grows by a ticket when removedAt is set,
   * which can happen after the move.
   *
   * A charge recorded against a different element that shares this createdAt is
   * not this element's: this one is still in live and moves in full. The record
   * it displaces is a released one (zero), so nothing charged is lost.
   */
  private moveSizeToGC(element: CRDTElement): boolean {
    const createdAt = element.getCreatedAt().toIDString();
    const size = element.getDataSize();

    const charged = this.sizeInGC.get(createdAt);
    if (charged && charged.element === element) {
      addDataSizes(this.docSize.gc, {
        data: size.data - charged.size.data,
        meta: size.meta - charged.size.meta,
      });
      this.sizeInGC.set(createdAt, { element, size });
      return false;
    }

    addDataSizes(this.docSize.gc, size);
    subDataSize(this.docSize.live, size);
    this.sizeInGC.set(createdAt, { element, size });
    return true;
  }

  /**
   * `unregisterRemovedElementPair` drops the collection entry registered under
   * the given createdAt, if there is one, and releases the charge it holds. It
   * reports whether an entry was dropped.
   *
   * It is the narrow counterpart of `registerRemovedElement`, for the one
   * caller that has to retire a tombstone without collecting it: a `Set` that
   * restores an element under a createdAt a tombstone already answers to.
   * `ElementRHT.set` has by then re-pointed `nodeMapByCreatedAt` at the
   * restored copy, so the entry the removal left behind now resolves, through
   * that index, to live data -- and collection would purge it.
   *
   * Deliberately narrow. The obvious alternative, deregistering the tombstone
   * and its descendants outright, reaches past the entry that is stale: the
   * tombstone's descendant set can be a strict superset of the restored copy's
   * -- a peer may have added a child into the container after the undoing
   * replica took its copy -- and deregistering evicts those descendants from
   * `elementPairMapByCreatedAt` with nothing to put them back. A later change
   * addressed at one of them then throws inside `applyChangePack` on every
   * replica, and permanently on the server, which replays the same change log
   * to rebuild the document and its snapshots.
   *
   * What it still does reach is the accounting, and it has to. The subtree is
   * orphaned by the restore, so dropping the entry is dropping the only thing
   * that would ever have collected it. Its cost is released from wherever it
   * sits -- `docSize.gc` for anything a removal moved there, `docSize.live` for
   * a member a peer added into the container after it was already removed.
   */
  public unregisterRemovedElementPair(createdAt: TimeTicket): boolean {
    const key = createdAt.toIDString();
    if (!this.gcElementSetByCreatedAt.has(key)) {
      return false;
    }

    const element = this.elementPairMapByCreatedAt.get(key)?.element;
    if (!element) {
      // The worklist carries no element of its own; with nothing to resolve it
      // through there is no charge to release and no identity to compare.
      // Dropping the entry is still right -- it can never be collected.
      this.gcElementSetByCreatedAt.delete(key);
      return true;
    }

    this.release(element);
    if (element instanceof CRDTContainer) {
      element.getDescendants((elem) => {
        this.release(elem);
        return false;
      });
    }

    this.gcElementSetByCreatedAt.delete(key);
    return true;
  }

  /**
   * `release` forgets the cost of an element that has become unreachable
   * without being collected, and any collection entry naming it. It leaves
   * `elementPairMapByCreatedAt` alone: the slot may since have been taken over
   * by a live element restored under this same createdAt, and that element's
   * registration has to stand.
   */
  private release(element: CRDTElement): void {
    const createdAt = element.getCreatedAt().toIDString();

    // Subtract from whichever side is actually holding it, by the amount
    // actually charged -- the same split `deregisterElement` makes. A member
    // added into an already-removed container never passed through a removal,
    // so it still sits in live.
    const charged = this.sizeInGC.get(createdAt);
    if (charged && charged.element === element) {
      subDataSize(this.docSize.gc, charged.size);
    } else {
      subDataSize(this.docSize.live, element.getDataSize());
    }

    // Record the release rather than forgetting it. This element stays
    // addressable -- that is the whole point of not deregistering it -- so a
    // peer that has not seen the restore can still remove something inside this
    // subtree, and `moveSizeToGC` would then take its size out of live for a
    // second time and drive docSize negative. A zero charge says live is not
    // holding it, and the identity says which element that is about, so a copy
    // restored under the same createdAt is still charged normally.
    this.sizeInGC.set(createdAt, { element, size: { data: 0, meta: 0 } });

    if (this.elementPairMapByCreatedAt.get(createdAt)?.element === element) {
      this.gcElementSetByCreatedAt.delete(createdAt);
    }
  }

  /**
   * `registerGCPair` registers the given pair to hash table.
   */
  public registerGCPair(pair: GCPair): void {
    const prev = this.gcPairMap.get(pair.child.toIDString());
    if (prev) {
      this.gcPairMap.delete(pair.child.toIDString());
      return;
    }

    this.gcPairMap.set(pair.child.toIDString(), pair);

    if (pair.gcOnlySize) {
      // NOTE: The child's size was never counted in docSize.live (it was
      // born removed, or it was registered by the snapshot-load scan where
      // live only counts visible nodes), so there is nothing to move out
      // of live. Only the given size is added to gc; purge subtracts the
      // child's size from gc as usual.
      addDataSizes(this.docSize.gc, pair.gcOnlySize);
      return;
    }

    const size = this.gcPairMap
      .get(pair.child.toIDString())!
      .child.getDataSize();
    addDataSizes(this.docSize.gc, size);
    subDataSize(this.docSize.live, size);

    // NOTE(hackerwins): In general cases, when removing a node, its size
    // includes removedAt, so when subtracting the node size from docSize.Live,
    // we need to subtract the removedAt size. However, RHTNode doesn't have
    // removedAt, so we don't need to subtract it from the Live size.
    if (!(pair.child instanceof RHTNode)) {
      this.docSize.live.meta += TimeTicketSize;
    }
  }

  /**
   * `unregisterGCPair` removes the given pair from the hash table. Called
   * when a tombstoned node is revived (un-tombstoned) by an
   * identity-preserving undo, so that a later re-registration (redo) is
   * not swallowed by the toggle in `registerGCPair`.
   *
   * NOTE: must be called AFTER the node's removedAt has been cleared, so
   * `getDataSize()` no longer includes the tombstone ticket.
   */
  public unregisterGCPair(pair: GCPair): void {
    const registered = this.gcPairMap.get(pair.child.toIDString());
    if (!registered) {
      return;
    }

    this.gcPairMap.delete(pair.child.toIDString());

    // Mirror registerGCPair's accounting: move the node's size back from
    // gc to live, and drop the tombstone ticket counted at register time.
    const size = pair.child.getDataSize();
    subDataSize(this.docSize.gc, size);
    addDataSizes(this.docSize.live, size);
    if (!(pair.child instanceof RHTNode)) {
      this.docSize.gc.meta -= TimeTicketSize;
    }
  }

  /**
   * `getElementMapSize` returns the size of element map.
   */
  public getElementMapSize(): number {
    return this.elementPairMapByCreatedAt.size;
  }

  /**
   * `getGarbageElementSetSize()` returns the size of removed element set.
   */
  public getGarbageElementSetSize(): number {
    const seen = new Set<string>();

    for (const createdAt of this.gcElementSetByCreatedAt) {
      seen.add(createdAt);
      const pair = this.elementPairMapByCreatedAt.get(createdAt);
      if (pair?.element instanceof CRDTContainer) {
        pair.element.getDescendants((el) => {
          seen.add(el.getCreatedAt().toIDString());
          return false;
        });
      }
    }
    return seen.size;
  }

  /**
   * `getObject` returns root object.
   */
  public getObject(): CRDTObject {
    return this.rootObject;
  }

  /**
   * `getGarbageLen` returns length of nodes which can be garbage collected.
   */
  public getGarbageLen(): number {
    return this.getGarbageElementSetSize() + this.gcPairMap.size;
  }

  /**
   * `getDocSize` returns the size of the document.
   */
  getDocSize(): DocSize {
    return this.docSize;
  }

  /**
   * `deepcopy` copies itself deeply.
   */
  public deepcopy(): CRDTRoot {
    return new CRDTRoot(this.rootObject.deepcopy());
  }

  /**
   * `garbageCollect` purges elements that were removed before the given time.
   */
  public garbageCollect(minSyncedVersionVector: VersionVector): number {
    let count = 0;

    for (const createdAt of this.gcElementSetByCreatedAt) {
      // NOTE(hackerwins): Neither lookup is guaranteed to hit. A document
      // written by an SDK that registered an element without its parent, or
      // that left two elements under one createdAt, holds a member of this set
      // that cannot be reached for purging. Dereferencing either one throws
      // inside `applyChangePack`, and because that is where every sync applies
      // the server's change pack, the same pass throws again on the next sync:
      // the client stops syncing the document for good (#1340).
      //
      // Skip it rather than drop it. The element is still in the document and
      // its size is still charged to `docSize.gc`, which only
      // `deregisterElement` releases; forgetting the member would leave that
      // charge counted against the size limit with nothing left reporting it
      // as garbage. `getGCElementPairs` already guards the same lookup.
      const pair = this.elementPairMapByCreatedAt.get(createdAt);
      if (!pair || !pair.parent) {
        continue;
      }
      const removedAt = pair.element.getRemovedAt();

      if (removedAt && minSyncedVersionVector?.afterOrEqual(removedAt)) {
        pair.parent.purge(pair.element);
        count += this.deregisterElement(pair.element);
      }
    }

    for (const [, pair] of this.gcPairMap) {
      const removedAt = pair.child.getRemovedAt();
      if (!removedAt) {
        // Node was revived but its pair was not unregistered. Reverse the
        // GC accounting (gc → live) and drop the stale entry via
        // unregisterGCPair so the registerGCPair toggle can't be tripped
        // later and docSize.gc/live stay consistent.
        this.unregisterGCPair(pair);
        continue;
      }
      if (removedAt && minSyncedVersionVector?.afterOrEqual(removedAt)) {
        pair.parent.purge(pair.child);

        subDataSize(this.docSize.gc, pair.child.getDataSize());
        this.gcPairMap.delete(pair.child.toIDString());
        count += 1;
      }
    }

    return count;
  }

  /**
   * `toJSON` returns the JSON encoding of this root object.
   */
  public toJSON(): string {
    return this.rootObject.toJSON();
  }

  /**
   * `toSortedJSON` returns the sorted JSON encoding of this root object.
   */
  public toSortedJSON(): string {
    return this.rootObject.toSortedJSON();
  }

  /**
   * `getStats` returns the current statistics of the root object.
   * This includes counts of various types of elements and structural information.
   */
  public getStats(): RootStats {
    return {
      elements: this.getElementMapSize(),
      gcPairs: this.gcPairMap.size,
      gcElements: this.getGarbageElementSetSize(),
    };
  }

  /**
   * `acc` accumulates the given DataSize to Live.
   */
  public acc(diff: DataSize) {
    addDataSizes(this.docSize.live, diff);
  }

  /**
   * `getGCElementPairs` returns an iterator for all GC element pairs.
   * This is similar to Go's GCElementPairMap() functionality.
   */
  public *getGCElementPairs(): IterableIterator<CRDTElementPair> {
    for (const createdAt of this.gcElementSetByCreatedAt) {
      const pair = this.elementPairMapByCreatedAt.get(createdAt);
      if (pair) {
        yield pair;
      }
    }
  }
}
