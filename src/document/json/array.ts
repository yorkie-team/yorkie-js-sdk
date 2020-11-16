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

import { TimeTicket } from '../time/ticket';
import { JSONContainer, JSONElement } from './element';
import { RGATreeList } from './rga_tree_list';

/**
 * JSONArray represents JSON array data structure including logical clock.
 */
export class JSONArray extends JSONContainer {
  private elements: RGATreeList;

  constructor(createdAt: TimeTicket, elements: RGATreeList) {
    super(createdAt);
    this.elements = elements;
  }

  public static create(createdAt: TimeTicket): JSONArray {
    return new JSONArray(createdAt, RGATreeList.create());
  }

  public purge(element: JSONElement): void {
    this.elements.purge(element);
  }

  public insertAfter(prevCreatedAt: TimeTicket, value: JSONElement): void {
    this.elements.insertAfter(prevCreatedAt, value);
  }

  public moveAfter(
    prevCreatedAt: TimeTicket,
    createdAt: TimeTicket,
    executedAt: TimeTicket,
  ): void {
    this.elements.moveAfter(prevCreatedAt, createdAt, executedAt);
  }

  public get(createdAt: TimeTicket): JSONElement {
    return this.elements.get(createdAt);
  }

  public getByIndex(index: number): JSONElement {
    return this.elements.getByIndex(index).getValue();
  }

  public getLast(): JSONElement {
    return this.elements.getLast();
  }

  public getPrevCreatedAt(createdAt: TimeTicket): TimeTicket {
    return this.elements.getPrevCreatedAt(createdAt);
  }

  public delete(createdAt: TimeTicket, editedAt: TimeTicket): JSONElement {
    return this.elements.delete(createdAt, editedAt);
  }

  public deleteByIndex(index: number, editedAt: TimeTicket): JSONElement {
    return this.elements.deleteByIndex(index, editedAt);
  }

  public getLastCreatedAt(): TimeTicket {
    return this.elements.getLastCreatedAt();
  }

  public get length(): number {
    return this.elements.length;
  }

  public *[Symbol.iterator](): IterableIterator<JSONElement> {
    for (const node of this.elements) {
      if (!node.isRemoved()) {
        yield node.getValue();
      }
    }
  }

  public getDescendants(
    callback: (elem: JSONElement, parent: JSONContainer) => boolean,
  ): void {
    for (const node of this.elements) {
      const element = node.getValue();
      if (callback(element, this)) {
        return;
      }

      if (element instanceof JSONContainer) {
        element.getDescendants(callback);
      }
    }
  }

  public toJSON(): string {
    const json = [];
    for (const value of this) {
      json.push(value.toJSON());
    }
    return `[${json.join(',')}]`;
  }

  public toSortedJSON(): string {
    return this.toJSON();
  }

  public getElements(): RGATreeList {
    return this.elements;
  }

  public deepcopy(): JSONArray {
    const clone = JSONArray.create(this.getCreatedAt());
    for (const node of this.elements) {
      clone.elements.insertAfter(
        clone.getLastCreatedAt(),
        node.getValue().deepcopy(),
      );
    }
    clone.remove(this.getRemovedAt());
    return clone;
  }
}
