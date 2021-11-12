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
  JSONContainer,
  JSONElement,
  TextElement,
} from '@yorkie-js-sdk/src/document/json/element';
import { JSONObject } from '@yorkie-js-sdk/src/document/json/object';

interface JSONElementPair {
  element: JSONElement;
  parent?: JSONContainer;
}

/**
 * `JSONRoot` is a structure represents the root of JSON. It has a hash table of
 * all JSON elements to find a specific element when applying remote changes
 * received from agent.
 *
 * Every element has a unique time ticket at creation, which allows us to find
 * a particular element.
 */
export class JSONRoot {
  private rootObject: JSONObject;
  private elementPairMapByCreatedAt: Map<string, JSONElementPair>;
  private removedElementSetByCreatedAt: Set<string>;
  private textWithGarbageSetByCreatedAt: Set<string>;

  constructor(rootObject: JSONObject) {
    this.rootObject = rootObject;
    this.elementPairMapByCreatedAt = new Map();
    this.removedElementSetByCreatedAt = new Set();
    this.textWithGarbageSetByCreatedAt = new Set();

    this.elementPairMapByCreatedAt.set(
      this.rootObject.getCreatedAt().toIDString(),
      { element: this.rootObject },
    );

    rootObject.getDescendants(
      (elem: JSONElement, parent: JSONContainer): boolean => {
        this.registerElement(elem, parent);
        return false;
      },
    );
  }

  /**
   * `create` creates a new instance of Root.
   */
  public static create(): JSONRoot {
    return new JSONRoot(JSONObject.create(InitialTimeTicket));
  }

  /**
   * `findByCreatedAt` returns the element of given creation time.
   */
  public findByCreatedAt(createdAt: TimeTicket): JSONElement | undefined {
    const pair = this.elementPairMapByCreatedAt.get(createdAt.toIDString());
    if (!pair) {
      return;
    }

    return pair.element;
  }

  /**
   * `createPath` creates path of the given element.
   */
  public createPath(createdAt: TimeTicket): string | undefined {
    let pair = this.elementPairMapByCreatedAt.get(createdAt.toIDString());
    if (!pair) {
      return;
    }

    const keys: Array<string> = [];
    while (pair.parent) {
      const createdAt = pair.element.getCreatedAt();
      let key = pair.parent.keyOf(createdAt);
      if (key === undefined) {
        logger.fatal(`cant find the given element: ${createdAt.toIDString()}`);
      } else {
        key = key.replace(/[$.]/g, '\\$&');
      }

      keys.unshift(key!);
      pair = this.elementPairMapByCreatedAt.get(
        pair.parent.getCreatedAt().toIDString(),
      )!;
    }

    keys.unshift('$');
    return keys.join('.');
  }

  /**
   * `registerElement` registers the given element to hash table.
   */
  public registerElement(element: JSONElement, parent: JSONContainer): void {
    this.elementPairMapByCreatedAt.set(element.getCreatedAt().toIDString(), {
      parent,
      element,
    });
  }

  /**
   * `deregisterElement` deregister the given element from hash table.
   */
  public deregisterElement(element: JSONElement): void {
    this.elementPairMapByCreatedAt.delete(element.getCreatedAt().toIDString());
    this.removedElementSetByCreatedAt.delete(
      element.getCreatedAt().toIDString(),
    );
  }

  /**
   * `registerRemovedElement` registers the given element to hash table.
   */
  public registerRemovedElement(element: JSONElement): void {
    this.removedElementSetByCreatedAt.add(element.getCreatedAt().toIDString());
  }

  /**
   * `registerTextWithGarbage` registers the given text to hash set.
   */
  public registerTextWithGarbage(text: TextElement): void {
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
  public getObject(): JSONObject {
    return this.rootObject;
  }

  /**
   * `getGarbageLen` returns length of nodes which should garbage collection task
   */
  public getGarbageLen(): number {
    let count = 0;

    for (const createdAt of this.removedElementSetByCreatedAt) {
      count++;
      const pair = this.elementPairMapByCreatedAt.get(createdAt)!;
      if (pair.element instanceof JSONContainer) {
        pair.element.getDescendants(() => {
          count++;
          return false;
        });
      }
    }

    for (const createdAt of this.textWithGarbageSetByCreatedAt) {
      const pair = this.elementPairMapByCreatedAt.get(createdAt)!;
      const text = pair.element as TextElement;
      count += text.getRemovedNodesLen();
    }

    return count;
  }

  /**
   * `deepcopy` copies itself deeply.
   */
  public deepcopy(): JSONRoot {
    return new JSONRoot(this.rootObject.deepcopy());
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
      const text = pair.element as TextElement;

      const removedNodeCnt = text.cleanupRemovedNodes(ticket);
      if (removedNodeCnt > 0) {
        this.textWithGarbageSetByCreatedAt.delete(
          text.getCreatedAt().toIDString(),
        );
      }
      count += removedNodeCnt;
    }

    return count;
  }

  private garbageCollectInternal(element: JSONElement): number {
    let count = 0;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const callback = (elem: JSONElement, parent?: JSONContainer): boolean => {
      this.deregisterElement(elem);
      count++;
      return false;
    };

    callback(element);

    if (element instanceof JSONContainer) {
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
