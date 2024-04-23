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

import { logger } from '@yorkie-js-sdk/src/util/logger';
import {
  InitialTimeTicket,
  TimeTicket,
} from '@yorkie-js-sdk/src/document/time/ticket';
import {
  CRDTContainer,
  CRDTElement,
  CRDTGCElement,
} from '@yorkie-js-sdk/src/document/crdt/element';
import { CRDTObject } from '@yorkie-js-sdk/src/document/crdt/object';

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
   * `removedElementSetByCreatedAt` is a hash set that contains the creation
   * time of the removed element. It is used to find the removed element when
   * executing garbage collection.
   */
  private removedElementSetByCreatedAt: Set<string>;

  /**
   * `elementHasRemovedNodesSetByCreatedAt` is a hash set that contains the
   * creation time of the element that has removed nodes. It is used to find
   * the element that has removed nodes when executing garbage collection.
   */
  private elementHasRemovedNodesSetByCreatedAt: Set<string>;

  constructor(rootObject: CRDTObject) {
    this.rootObject = rootObject;
    this.elementPairMapByCreatedAt = new Map();
    this.removedElementSetByCreatedAt = new Set();
    this.elementHasRemovedNodesSetByCreatedAt = new Set();
    this.registerElement(rootObject, undefined);
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
        logger.fatal(`cant find the given element: ${createdAt.toIDString()}`);
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

    if (element instanceof CRDTContainer) {
      element.getDescendants((elem, parent) => {
        this.registerElement(elem, parent);
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
      this.elementPairMapByCreatedAt.delete(createdAt);
      this.removedElementSetByCreatedAt.delete(createdAt);
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
    this.removedElementSetByCreatedAt.add(element.getCreatedAt().toIDString());
  }

  /**
   * `registerElementHasRemovedNodes` registers the given GC element to the
   * hash set.
   */
  public registerElementHasRemovedNodes(elem: CRDTGCElement): void {
    this.elementHasRemovedNodesSetByCreatedAt.add(
      elem.getCreatedAt().toIDString(),
    );
  }

  /**
   * `getElementMapSize` returns the size of element map.
   */
  public getElementMapSize(): number {
    return this.elementPairMapByCreatedAt.size;
  }

  /**
   * `getRemovedElementSetSize()` returns the size of removed element set.
   */
  public getRemovedElementSetSize(): number {
    return this.removedElementSetByCreatedAt.size;
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
    let count = 0;
    const seen = new Set<string>();

    for (const createdAt of this.removedElementSetByCreatedAt) {
      seen.add(createdAt);
      const pair = this.elementPairMapByCreatedAt.get(createdAt)!;
      if (pair.element instanceof CRDTContainer) {
        pair.element.getDescendants((el) => {
          seen.add(el.getCreatedAt().toIDString());
          return false;
        });
      }
    }

    count += seen.size;

    for (const createdAt of this.elementHasRemovedNodesSetByCreatedAt) {
      const pair = this.elementPairMapByCreatedAt.get(createdAt)!;
      const elem = pair.element as CRDTGCElement;
      count += elem.getRemovedNodesLen();
    }

    return count;
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
  public garbageCollect(ticket: TimeTicket): number {
    let count = 0;

    for (const createdAt of this.removedElementSetByCreatedAt) {
      const pair = this.elementPairMapByCreatedAt.get(createdAt)!;
      if (
        pair.element.getRemovedAt() &&
        ticket.compare(pair.element.getRemovedAt()!) >= 0
      ) {
        pair.parent!.purge(pair.element);
        count += this.deregisterElement(pair.element);
      }
    }

    for (const createdAt of this.elementHasRemovedNodesSetByCreatedAt) {
      const pair = this.elementPairMapByCreatedAt.get(createdAt)!;
      const elem = pair.element as CRDTGCElement;

      const removedNodeCnt = elem.purgeRemovedNodesBefore(ticket);
      if (removedNodeCnt > 0) {
        this.elementHasRemovedNodesSetByCreatedAt.delete(
          elem.getCreatedAt().toIDString(),
        );
      }
      count += removedNodeCnt;
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
}
