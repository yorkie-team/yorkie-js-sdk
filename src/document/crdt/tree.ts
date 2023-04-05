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
import { RGATreeList } from '@yorkie-js-sdk/src/document/crdt/rga_tree_list';
import { CRDTTreeNode } from '@yorkie-js-sdk/src/document/crdt/tree_node';
/**
 * `CRDTArray` represents an array data type containing `CRDTElement`s.
 *
 * @internal
 */
export class CRDTTree extends CRDTContainer {
  private elements: RGATreeList;

  /** @hideconstructor */
  constructor(createdAt: TimeTicket, elements: RGATreeList) {
    super(createdAt);
    this.elements = elements;
  }

  /**
   * `create` creates a new instance of Array.
   */
  public static create(createdAt: TimeTicket): CRDTTree {
    return new CRDTTree(createdAt, RGATreeList.create());
  }

  /**
   * `subPathOf` returns the sub path of the given element.
   */
  public subPathOf(createdAt: TimeTicket): string | undefined {
    return this.elements.subPathOf(createdAt);
  }

  /**
   * `purge` physically purge the given element.
   */
  public purge(element: CRDTTreeNode): void {
    this.elements.purge(element);
  }

  /**
   * `insertAfter` adds a new node after the the given node.
   */
  public insertAfter(prevCreatedAt: TimeTicket, value: CRDTElement): void {
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
  public get(createdAt: TimeTicket): CRDTTreeNode | undefined {
    const node = this.elements.get(createdAt);
    if (!node || node.isRemoved()) {
      return;
    }

    return node as CRDTTreeNode;
  }

  /**
   * `getByIndex` returns the element of the given index.
   */
  public getByIndex(index: number): CRDTTreeNode | undefined {
    const node = this.elements.getByIndex(index);
    if (!node) {
      return;
    }

    return node.getValue() as CRDTTreeNode;
  }

  /**
   * `getHead` returns dummy head element.
   */
  public getHead(): CRDTTreeNode {
    return this.elements.getHead() as CRDTTreeNode;
  }

  /**
   * `getLast` returns last element.
   */
  public getLast(): CRDTTreeNode {
    return this.elements.getLast() as CRDTTreeNode;
  }

  /**
   * `getPrevCreatedAt` returns the creation time of the previous node.
   */
  public getPrevCreatedAt(createdAt: TimeTicket): TimeTicket {
    return this.elements.getPrevCreatedAt(createdAt);
  }

  /**
   * `delete` deletes the element of the given creation time.
   */
  public delete(createdAt: TimeTicket, editedAt: TimeTicket): CRDTElement {
    return this.elements.delete(createdAt, editedAt);
  }

  /**
   * `deleteByIndex` deletes the element of given index and editedAt.
   */
  public deleteByIndex(
    index: number,
    editedAt: TimeTicket,
  ): CRDTTreeNode | undefined {
    return this.elements.deleteByIndex(index, editedAt) as CRDTTreeNode;
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

  /**
   * eslint-disable-next-line jsdoc/require-jsdoc
   * @internal
   */
  public *[Symbol.iterator](): IterableIterator<CRDTTreeNode> {
    for (const node of this.elements) {
      if (!node.isRemoved()) {
        yield node.getValue() as CRDTTreeNode;
      }
    }
  }

  /**
   * `getDescendants` traverse the descendants of this array.
   */
  public getDescendants(
    callback: (elem: CRDTTreeNode, parent: CRDTContainer) => boolean,
  ): void {
    for (const node of this.elements) {
      const element = node.getValue() as CRDTTreeNode;
      if (callback(element, this)) {
        return;
      }

      if (element instanceof CRDTTreeNode) {
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
   * `toJS` return the javascript object of this array.
   */
  public toJS(): any {
    return JSON.parse(this.toJSON());
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
  public deepcopy(): CRDTTree {
    const clone = CRDTTree.create(this.getCreatedAt());
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
