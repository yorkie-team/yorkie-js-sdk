/*
 * Copyright 2023 The Yorkie Authors. All rights reserved.
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

import { TimeTicket } from '@yorkie-js-sdk/src/document/time/ticket';
import {
  CRDTContainer,
  CRDTElement,
} from '@yorkie-js-sdk/src/document/crdt/element';
import { ElementRHT } from '@yorkie-js-sdk/src/document/crdt/element_rht';

/**
 * `CRDTObject` represents an object data type, but unlike regular JSON,
 * it has `TimeTicket`s which are created by logical clock.
 *
 * @internal
 */
export class CRDTObject extends CRDTContainer {
  private memberNodes: ElementRHT;

  /** @hideconstructor */
  constructor(createdAt: TimeTicket, memberNodes: ElementRHT) {
    super(createdAt);
    this.memberNodes = memberNodes;
  }

  /**
   * `create` creates a new instance of CRDTObject.
   */
  public static create(createdAt: TimeTicket): CRDTObject {
    return new CRDTObject(createdAt, ElementRHT.create());
  }

  /**
   * `subPathOf` returns the sub path of the given element.
   */
  public subPathOf(createdAt: TimeTicket): string | undefined {
    return this.memberNodes.subPathOf(createdAt);
  }

  /**
   * `purge` physically purges the given element.
   */
  public purge(value: CRDTElement): void {
    this.memberNodes.purge(value);
  }

  /**
   * `set` sets the given element of the given key.
   */
  public set(key: string, value: CRDTElement): CRDTElement | undefined {
    return this.memberNodes.set(key, value);
  }

  /**
   * `delete` deletes the element of the given key.
   */
  public delete(createdAt: TimeTicket, executedAt: TimeTicket): CRDTElement {
    return this.memberNodes.delete(createdAt, executedAt);
  }

  /**
   * `deleteByKey` deletes the element of the given key and execution time.
   */
  public deleteByKey(
    key: string,
    executedAt: TimeTicket,
  ): CRDTElement | undefined {
    return this.memberNodes.deleteByKey(key, executedAt);
  }

  /**
   * `get` returns the value of the given key.
   */
  public get(key: string): CRDTElement | undefined {
    return this.memberNodes.get(key);
  }

  /**
   * `has` returns whether the element exists of the given key or not.
   */
  public has(key: string): boolean {
    return this.memberNodes.has(key);
  }

  /**
   * `toJSON` returns the JSON encoding of this object.
   */
  public toJSON(): string {
    const json = [];
    for (const [key, value] of this) {
      json.push(`"${key}":${value.toJSON()}`);
    }
    return `{${json.join(',')}}`;
  }

  /**
   * `toJS` returns the JavaScript object of this object.
   */
  public toJS(): any {
    return JSON.parse(this.toJSON());
  }

  /**
   * `getKeys` returns array of keys in this object.
   */
  public getKeys(): Array<string> {
    const keys = Array<string>();
    for (const [key] of this) {
      keys.push(key);
    }

    return keys;
  }

  /**
   * `toSortedJSON` returns the sorted JSON encoding of this object.
   */
  public toSortedJSON(): string {
    const keys = Array<string>();
    for (const [key] of this) {
      keys.push(key);
    }

    const json = [];
    for (const key of keys.sort()) {
      const node = this.memberNodes.get(key);
      json.push(`"${key}":${node!.toSortedJSON()}`);
    }

    return `{${json.join(',')}}`;
  }

  /**
   * `getRHT` RHTNodes returns the RHTPQMap nodes.
   */
  public getRHT(): ElementRHT {
    return this.memberNodes;
  }

  /**
   * `deepcopy` copies itself deeply.
   */
  public deepcopy(): CRDTObject {
    const clone = CRDTObject.create(this.getCreatedAt());
    for (const node of this.memberNodes) {
      clone.memberNodes.set(node.getStrKey(), node.getValue().deepcopy());
    }
    clone.remove(this.getRemovedAt());
    return clone;
  }

  /**
   * `getDescendants` returns the descendants of this object by traversing.
   */
  public getDescendants(
    callback: (elem: CRDTElement, parent: CRDTContainer) => boolean,
  ): void {
    for (const node of this.memberNodes) {
      const element = node.getValue();
      if (callback(element, this)) {
        return;
      }

      if (element instanceof CRDTContainer) {
        element.getDescendants(callback);
      }
    }
  }

  /**
   * eslint-disable-next-line jsdoc/require-jsdoc
   * @internal
   */
  public *[Symbol.iterator](): IterableIterator<[string, CRDTElement]> {
    const keySet = new Set<string>();
    for (const node of this.memberNodes) {
      if (!keySet.has(node.getStrKey())) {
        keySet.add(node.getStrKey());
        if (!node.isRemoved()) {
          yield [node.getStrKey(), node.getValue()];
        }
      }
    }
  }
}
