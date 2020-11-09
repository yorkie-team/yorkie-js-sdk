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

import { InitialTimeTicket, TimeTicket } from '../time/ticket';
import { JSONArray } from './array';
import { JSONContainer, JSONElement } from './element';
import { JSONObject } from './object';

/**
 * JSONRoot is a structure represents the root of JSON. It has a hash table of
 * all JSON elements to find a specific element when appling remote changes
 * received from agent.
 *
 * Every element has a unique time ticket at creation, which allows us to find
 * a particular element.
 */
export class JSONRoot {
  private rootObject: JSONObject;
  private elementMapByCreatedAt: Map<string, JSONElement>;

  constructor(rootObject: JSONObject) {
    this.rootObject = rootObject;
    this.elementMapByCreatedAt = new Map();

    this.registerElement(this.rootObject);
    rootObject.getDescendants((elem: JSONElement): boolean => {
      this.registerElement(elem);
      return false;
    })
  }

  public static create(): JSONRoot {
    return new JSONRoot(JSONObject.create(InitialTimeTicket));
  }

  /**
   * findByCreatedAt returns the element of given creation time.
   */
  public findByCreatedAt(createdAt: TimeTicket): JSONElement {
    return this.elementMapByCreatedAt.get(createdAt.toIDString());
  }

  /**
   * registerElement registers the given element to hash table.
   */
  public registerElement(element: JSONElement): void {
    this.elementMapByCreatedAt.set(element.getCreatedAt().toIDString(), element);
  }

  /**
   * deregisterElement deregister the given element from hash table.
   */
  public deregisterElement(element: JSONElement): void {
    this.elementMapByCreatedAt.delete(element.getCreatedAt().toIDString())
  }

  public getElementMapSize(): number {
    return this.elementMapByCreatedAt.size;
  }

  public getObject(): JSONObject {
    return this.rootObject;
  }

  public deepcopy(): JSONRoot {
    return new JSONRoot(this.rootObject.deepcopy());
  }

  public garbageCollect(ticket: TimeTicket): number {
    let count = 0;

    this.rootObject.getDescendants((elem: JSONElement, parent: JSONContainer): boolean => {
      const shouldGC = elem.getRemovedAt() !== undefined && ticket.after(elem.getRemovedAt());
      if (shouldGC) {
        parent.purge(elem);
        count += this._garbageCollect(elem)
      }

      return shouldGC;
    })

    return count;
  }

  private _garbageCollect(element: JSONElement): number {
    let count = 0;

    const callback = (elem: JSONElement, parent: JSONContainer): boolean => {
      this.deregisterElement(elem);
      count++;
      return false;
    };

    callback(element, null);

    if (element instanceof JSONObject) {
      element.getDescendants(callback)
    } else if (element instanceof JSONArray) {
      element.getDescendants(callback)
    }

    return count;
  }

  public toJSON(): string {
    return this.rootObject.toJSON();
  }

  public toSortedJSON(): string {
    return this.rootObject.toSortedJSON();
  }
}
