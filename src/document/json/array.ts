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
 * `JSONArray` represents JSON array data structure including logical clock.
 *
 * @public
 */
export class JSONArray extends JSONContainer {
  private elements: RGATreeList;

  constructor(createdAt: TimeTicket, elements: RGATreeList) {
    super(createdAt);
    this.elements = elements;
  }

  /**
   * `create` creates a new instance of Array.
   */
  public static create(createdAt: TimeTicket): JSONArray {
    return new JSONArray(createdAt, RGATreeList.create());
  }

  /**
   * `keyof` returns key of the given `createdAt` element.
   */
  public keyOf(createdAt: TimeTicket): string | undefined {
    return this.elements.keyOf(createdAt);
  }

  /**
   * `purge` physically purge child element.
   */
  public purge(element: JSONElement): void {
    this.elements.purge(element);
  }

  /**
   * `insertAfter` inserts the given element after the given previous element.
   */
  public insertAfter(prevCreatedAt: TimeTicket, value: JSONElement): void {
    this.elements.insertAfter(prevCreatedAt, value);
  }

  /**
   * `moveAfter` moves the given `createdAt` element after the `prevCreatedAt`.
   */
  public moveAfter(
    prevCreatedAt: TimeTicket,
    createdAt: TimeTicket,
    executedAt: TimeTicket,
  ): void {
    this.elements.moveAfter(prevCreatedAt, createdAt, executedAt);
  }

  /**
   * `get` returns the element of the given createAt.
   */
  public get(createdAt: TimeTicket): JSONElement | undefined {
    return this.elements.get(createdAt);
  }

  /**
   * `set` sets the given element.
   */
  public set(key: string, value: JSONElement): void {
    this.elements.set(key, value);
  }

  /**
   * `getByIndex` returns the element of the given index.
   */
  public getByIndex(index: number): JSONElement | undefined {
    const node = this.elements.getByIndex(index);
    if (!node) {
      return;
    }

    return node.getElementValue();
  }

  /**
   * `getHead` returns dummy head element.
   */
  public getHead(): JSONElement {
    return this.elements.getHead();
  }

  /**
   * `getLast` returns last element.
   */
  public getLast(): JSONElement {
    return this.elements.getLast();
  }

  /**
   * `getPrevCreatedAt` returns the creation time of
   * the previous element of the given element.
   */
  public getPrevCreatedAt(createdAt: TimeTicket): TimeTicket {
    return this.elements.getPrevCreatedAt(createdAt);
  }

  /**
   * `delete` deletes the element of the given index.
   */
  public delete(createdAt: TimeTicket, editedAt: TimeTicket): JSONElement {
    return this.elements.delete(createdAt, editedAt);
  }

  /**
   * `deleteByIndex` deletes the element of given index and editedAt.
   */
  public deleteByIndex(
    index: number,
    editedAt: TimeTicket,
  ): JSONElement | undefined {
    return this.elements.deleteByIndex(index, editedAt);
  }

  /**
   * `getLastCreatedAt` get last created element.
   */
  public getLastCreatedAt(): TimeTicket {
    return this.elements.getLastCreatedAt();
  }

  /**
   * `length` returns length of this elements.
   */
  public get length(): number {
    return this.elements.length;
  }

  // eslint-disable-next-line jsdoc/require-jsdoc
  public *[Symbol.iterator](): IterableIterator<JSONElement> {
    for (const node of this.elements) {
      if (!node.isRemoved()) {
        yield node.getElementValue();
      }
    }
  }

  /**
   * `getDescendants` traverse the descendants of this array.
   */
  public getDescendants(
    callback: (elem: JSONElement, parent: JSONContainer) => boolean,
  ): void {
    for (const node of this.elements) {
      const element = node.getElementValue();
      if (callback(element, this)) {
        return;
      }

      if (element instanceof JSONContainer) {
        element.getDescendants(callback);
      }
    }
  }

  /**
   * `toJSON` returns the JSON encoding of this array.
   */
  public toJSON(): string {
    const json = [];
    for (const value of this) {
      json.push(value.toJSON());
    }
    return `[${json.join(',')}]`;
  }

  /**
   * `toSortedJSON` returns the sorted JSON encoding of this array.
   */
  public toSortedJSON(): string {
    return this.toJSON();
  }

  /**
   * `getElements` returns an array of elements contained in this RGATreeList.
   */
  public getElements(): RGATreeList {
    return this.elements;
  }

  /**
   * `deepcopy` copies itself deeply.
   */
  public deepcopy(): JSONArray {
    const clone = JSONArray.create(this.getCreatedAt());
    for (const node of this.elements) {
      clone.elements.insertAfter(
        clone.getLastCreatedAt(),
        node.getElementValue().deepcopy(),
      );
    }
    clone.remove(this.getRemovedAt());
    return clone;
  }
}
