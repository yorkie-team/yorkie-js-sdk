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
import { ElementRHT } from '@yorkie-js-sdk/src/document/crdt/element_rht';

/**
 * `CRDTTreeNode` represents tag, attributes and children of the element.
 *
 * @internal
 */
export class CRDTTreeNode extends CRDTContainer {
  private tag: string;
  private children: RGATreeList;
  private memberNodes: ElementRHT;

  /** @hideconstructor */
  constructor(
    createdAt: TimeTicket,
    tag: string,
    attributes: ElementRHT,
    children: RGATreeList,
  ) {
    super(createdAt);
    this.tag = tag;
    this.memberNodes = attributes;
    this.children = children;
  }

  /**
   * `create` creates a new instance of TreeNode.
   */
  public static create(createdAt: TimeTicket, tag: string): CRDTTreeNode {
    return new CRDTTreeNode(
      createdAt,
      tag,
      ElementRHT.create(),
      RGATreeList.create(),
    );
  }

  /**
   * `subPathOf` returns the sub path of the given element.
   */
  public subPathOf(createdAt: TimeTicket): string | undefined {
    return this.children.subPathOf(createdAt);
  }

  /**
   * `purge` physically purge the given element.
   */
  public purge(element: CRDTElement): void {
    this.children.purge(element);
  }

  /**
   * `insertAfter` adds a new node after the the given node.
   */
  public insertAfter(prevCreatedAt: TimeTicket, value: CRDTElement): void {
    this.children.insertAfter(prevCreatedAt, value);
  }

  /**
   * `moveAfter` moves the given `createdAt` element after the `prevCreatedAt`.
   */
  public moveAfter(
    prevCreatedAt: TimeTicket,
    createdAt: TimeTicket,
    executedAt: TimeTicket,
  ): void {
    this.children.moveAfter(prevCreatedAt, createdAt, executedAt);
  }

  /**
   * `get` returns the element of the given createAt.
   */
  public get(createdAt: TimeTicket): CRDTElement | undefined {
    const node = this.children.get(createdAt);
    if (!node || node.isRemoved()) {
      return;
    }

    return node;
  }

  /**
   * `getAt` returns the child node of the given index.
   */
  public getAt(index: number): CRDTElement | undefined {
    const node = this.children.getByIndex(index);
    if (!node) {
      return;
    }

    return node.getValue();
  }

  /**
   * `getHead` returns dummy head element.
   */
  public getHead(): CRDTElement {
    return this.children.getHead();
  }

  /**
   * `getLast` returns last element.
   */
  public getLast(): CRDTElement {
    return this.children.getLast();
  }

  /**
   * `getPrevCreatedAt` returns the creation time of the previous node.
   */
  public getPrevCreatedAt(createdAt: TimeTicket): TimeTicket {
    return this.children.getPrevCreatedAt(createdAt);
  }

  /**
   * `delete` deletes the element of the given creation time.
   */
  public delete(createdAt: TimeTicket, editedAt: TimeTicket): CRDTElement {
    return this.children.delete(createdAt, editedAt);
  }

  /**
   * `removeChild` is alias of `delete`.
   */
  public removeChild(createdAt: TimeTicket, editedAt: TimeTicket): CRDTElement {
    return this.delete(createdAt, editedAt);
  }

  /**
   * `removeByIndex` deletes the element of given index and editedAt.
   */
  public removeByIndex(
    index: number,
    editedAt: TimeTicket,
  ): CRDTElement | undefined {
    return this.children.deleteByIndex(index, editedAt);
  }

  /**
   * `getLastCreatedAt` get last created element.
   */
  public getLastCreatedAt(): TimeTicket {
    return this.children.getLastCreatedAt();
  }

  /**
   * `childLength` returns length of this children.
   */
  public get length(): number {
    return this.children.length;
  }

  /**
   * `tag` returns a tag string of TreeNode
   */
  public getTag(): string {
    return this.tag;
  }

  /**
   * `subPathOf` returns the sub path of the given element.
   */
  public getAttributeKey(createdAt: TimeTicket): string | undefined {
    return this.memberNodes.subPathOf(createdAt);
  }

  /**
   * `purge` physically purges the given element.
   */
  public purgeAttribute(value: CRDTElement): void {
    this.memberNodes.purge(value);
  }

  /**
   * `removeAttribute` deletes the attribute of the given key.
   */
  public removeAttribute(
    createdAt: TimeTicket,
    executedAt: TimeTicket,
  ): CRDTElement {
    return this.memberNodes.delete(createdAt, executedAt);
  }

  /**
   * `setAttribute` sets the given element of the given key.
   */
  public setAttribute(
    key: string,
    value: CRDTElement,
  ): CRDTElement | undefined {
    return this.memberNodes.set(key, value);
  }

  /**
   * `removeAttributeByKey` deletes the attribute of the given key and execution time.
   */
  public removeAttributeByKey(
    key: string,
    executedAt: TimeTicket,
  ): CRDTElement | undefined {
    return this.memberNodes.deleteByKey(key, executedAt);
  }

  /**
   * `getAttribute` returns the value of the given key.
   */
  public getAttribute(key: string): CRDTElement | undefined {
    return this.memberNodes.get(key);
  }

  /**
   * `hasAttribute` returns whether the element exists of the given key or not.
   */
  public hasAttribute(key: string): boolean {
    return this.memberNodes.has(key);
  }

  /**
   * `getmemberNodes` RHTNodes returns the RHTPQMap nodes.
   */
  public get attributes(): ElementRHT {
    return this.memberNodes;
  }

  /**
   * `getChildren` returns an array of elements contained in this RGATreeList.
   */
  public getChildren(): RGATreeList {
    return this.children;
  }

  /**
   * `deepcopy` copies itself deeply.
   */
  public deepcopy(): CRDTTreeNode {
    const clone = CRDTTreeNode.create(this.getCreatedAt(), this.tag);

    // copy attributes
    for (const node of this.memberNodes) {
      clone.memberNodes.set(node.getStrKey(), node.getValue().deepcopy());
    }
    clone.remove(this.getRemovedAt());

    // copy children
    for (const node of this.children) {
      clone.children.insertAfter(
        clone.getLastCreatedAt(),
        node.getValue().deepcopy(),
      );
    }
    clone.remove(this.getRemovedAt());
    return clone;
  }

  /**
   * eslint-disable-next-line jsdoc/require-jsdoc
   * @internal
   */
  public *[Symbol.iterator](): IterableIterator<CRDTTreeNode> {
    for (const node of this.children) {
      if (!node.isRemoved()) {
        yield node.getValue() as CRDTTreeNode;
      }
    }
  }

  /**
   * `getDescendants` traverse the descendants of this children.
   */
  public getDescendants(
    callback: (elem: CRDTTreeNode, parent: CRDTTreeNode) => boolean,
  ): void {
    for (const node of this.children) {
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
   * eslint-disable-next-line jsdoc/require-jsdoc
   * @internal
   */
  private *getAttributeIterator(): IterableIterator<[string, CRDTElement]> {
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

  /**
   * `toJSON` returns the JSON encoding of this array.
   */
  public toJSON(): string {
    // collect attributes
    const attributesJson = [];
    for (const [key, value] of this.getAttributeIterator()) {
      attributesJson.push(`"${key}":${value.toJSON()}`);
    }

    // collect children
    const childrenJson = [];
    for (const value of this) {
      childrenJson.push(value.toJSON());
    }
    return `{"tag": ${this.tag},attributes:{${attributesJson.join(
      ',',
    )}},children:[${childrenJson.join(',')}]}`;
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
}
