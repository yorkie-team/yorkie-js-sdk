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
import { RGA } from './rga';

/**
 * JSONArray represents JSON array data structure including logical clock.
 */
export class JSONArray extends JSONContainer {
  private elements: RGA;

  constructor(createdAt: TimeTicket, elements: RGA) {
    super(createdAt);
    this.elements = elements;
  }

  public static create(createdAt: TimeTicket): JSONArray {
    return new JSONArray(createdAt, RGA.create());
  }

  public insertAfter(prevCreatedAt: TimeTicket, value: JSONElement): void {
    this.elements.insertAfter(prevCreatedAt, value);
  }

  public get(createdAt: TimeTicket): JSONElement {
    return this.elements.get(createdAt);
  }

  public getLast(): JSONElement {
    return this.elements.getLast();
  }

  public remove(createdAt: TimeTicket): JSONElement {
    return this.elements.remove(createdAt);
  }

  public removeByIndex(index: number): JSONElement {
    return this.elements.removeByIndex(index);
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

  public *getDescendants(): IterableIterator<JSONElement> {
    for (const node of this.elements) {
      const element = node.getValue();
      if (element instanceof JSONContainer) {
        for (const descendant of element.getDescendants()) {
          yield descendant;
        }
      } 

      yield element;
    }
  }

  public toJSON(): string {
    const json = []
    for (const value of this) {
      json.push(value.toJSON());
    }
    return `[${json.join(',')}]`;
  }

  public toSortedJSON(): string {
    return this.toJSON();
  }

  public getElements(): RGA {
    return this.elements;
  }

  public deepcopy(): JSONArray {
    const clone = JSONArray.create(this.getCreatedAt());
    for (const node of this.elements) {
      clone.elements.insertAfter(
        clone.getLastCreatedAt(),
        node.getValue().deepcopy()
      );
    }
    clone.delete(this.getDeletedAt())
    return clone;
  }
}
