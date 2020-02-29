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
import { JSONElement } from './element';
import { JSONObject } from './object';
import { PlainText } from './text';

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
    for (const elem of this.getDescendants()) {
      this.registerElement(elem);
    }
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

  public *getDescendants(): IterableIterator<JSONElement> {
    for (const descendant of this.rootObject.getDescendants()) {
      yield descendant;
    }
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

  public toJSON(): string {
    return this.rootObject.toJSON();
  }
}
