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
  CRDTTextElement,
} from '@yorkie-js-sdk/src/document/crdt/element';
import { CRDTObject } from '@yorkie-js-sdk/src/document/crdt/object';

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
  private rootObject: CRDTObject;
  private elementPairMapByCreatedAt: Map<string, CRDTElementPair>;
  private removedElementSetByCreatedAt: Set<string>;
  private textWithGarbageSetByCreatedAt: Set<string>;

  constructor(rootObject: CRDTObject) {
    this.rootObject = rootObject;
    this.elementPairMapByCreatedAt = new Map();
    this.removedElementSetByCreatedAt = new Set();
    this.textWithGarbageSetByCreatedAt = new Set();

    this.elementPairMapByCreatedAt.set(
      this.rootObject.getCreatedAt().toIDString(),
      { element: this.rootObject },
    );

    rootObject.getDescendants(
      (elem: CRDTElement, parent: CRDTContainer): boolean => {
        this.registerElement(elem, parent);
        return false;
      },
    );
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
      let subPath = pair.parent.subPathOf(createdAt);
      if (subPath === undefined) {
        logger.fatal(`cant find the given element: ${createdAt.toIDString()}`);
      } else {
        subPath = subPath.replace(/[$.]/g, '\\$&');
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
   * `registerElement` registers the given element to hash table.
   */
  public registerElement(element: CRDTElement, parent: CRDTContainer): void {
    this.elementPairMapByCreatedAt.set(element.getCreatedAt().toIDString(), {
      parent,
      element,
    });
  }

  /**
   * `deregisterElement` deregister the given element from hash table.
   */
  public deregisterElement(element: CRDTElement): void {
    this.elementPairMapByCreatedAt.delete(element.getCreatedAt().toIDString());
    this.removedElementSetByCreatedAt.delete(
      element.getCreatedAt().toIDString(),
    );
  }

  /**
   * `registerRemovedElement` registers the given element to the hash set.
   */
  public registerRemovedElement(element: CRDTElement): void {
    this.removedElementSetByCreatedAt.add(element.getCreatedAt().toIDString());
  }

  /**
   * `registerTextWithGarbage` registers the given text to hash set.
   */
  public registerTextWithGarbage(text: CRDTTextElement): void {
    this.textWithGarbageSetByCreatedAt.add(text.getCreatedAt().toIDString());
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

    for (const createdAt of this.removedElementSetByCreatedAt) {
      count++;
      const pair = this.elementPairMapByCreatedAt.get(createdAt)!;
      if (pair.element instanceof CRDTContainer) {
        pair.element.getDescendants(() => {
          count++;
          return false;
        });
      }
    }

    for (const createdAt of this.textWithGarbageSetByCreatedAt) {
      const pair = this.elementPairMapByCreatedAt.get(createdAt)!;
      const text = pair.element as CRDTTextElement;
      count += text.getRemovedNodesLen();
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
        count += this.garbageCollectInternal(pair.element);
      }
    }

    for (const createdAt of this.textWithGarbageSetByCreatedAt) {
      const pair = this.elementPairMapByCreatedAt.get(createdAt)!;
      const text = pair.element as CRDTTextElement;

      const removedNodeCnt = text.purgeTextNodesWithGarbage(ticket);
      if (removedNodeCnt > 0) {
        this.textWithGarbageSetByCreatedAt.delete(
          text.getCreatedAt().toIDString(),
        );
      }
      count += removedNodeCnt;
    }

    return count;
  }

  private garbageCollectInternal(element: CRDTElement): number {
    let count = 0;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const callback = (elem: CRDTElement, parent?: CRDTContainer): boolean => {
      this.deregisterElement(elem);
      count++;
      return false;
    };

    callback(element);

    if (element instanceof CRDTContainer) {
      element.getDescendants(callback);
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
