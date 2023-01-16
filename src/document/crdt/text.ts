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

import { TimeTicket } from '@yorkie-js-sdk/src/document/time/ticket';
import { RHT } from '@yorkie-js-sdk/src/document/crdt/rht';
import { CRDTTextElement } from '@yorkie-js-sdk/src/document/crdt/element';
import {
  TextChangeWithAttrs,
  TextChangeType,
  RGATreeSplit,
  RGATreeSplitNodeRange,
  Selection,
} from '@yorkie-js-sdk/src/document/crdt/rga_tree_split';
import { escapeString } from '@yorkie-js-sdk/src/document/json/strings';

export interface CRDTTextVal<A> {
  attributes: A;
  value: string;
}

/**
 * `CRDTTextValue` is a value of Text
 * which has a attributes that expresses the text style.
 *
 * @internal
 */
export class CRDTTextValue {
  private attributes: RHT;
  private value: string;

  /** @hideconstructor */
  constructor(value: string) {
    this.attributes = RHT.create();
    this.value = value;
  }

  /**
   * `create` creates a instance of CRDTTextValue.
   */
  public static create(value: string): CRDTTextValue {
    return new CRDTTextValue(value);
  }

  /**
   * `length` returns the length of value.
   */
  public get length(): number {
    return this.value.length;
  }

  /**
   * `substring` returns a sub-string value of the given range.
   */
  public substring(indexStart: number, indexEnd: number): CRDTTextValue {
    const value = new CRDTTextValue(this.value.substring(indexStart, indexEnd));
    value.attributes = this.attributes.deepcopy();
    return value;
  }

  /**
   * `setAttr` sets attribute of the given key, updated time and value.
   */
  public setAttr(key: string, value: string, updatedAt: TimeTicket): void {
    this.attributes.set(key, value, updatedAt);
  }

  /**
   * `getAttr` returns the attributes of this value.
   */
  public getAttrs(): RHT {
    return this.attributes;
  }

  /**
   * `toString` returns the string representation of this value.
   */
  public toString(): string {
    return this.value;
  }

  /**
   * `toJSON` returns the JSON encoding of this value.
   */
  public toJSON(): string {
    const content = escapeString(this.value);
    const attrsObj = this.attributes.toObject();
    const attrs = [];
    for (const [key, v] of Object.entries(attrsObj)) {
      const value = JSON.parse(v);
      const item =
        typeof value === 'string'
          ? `"${key}":"${escapeString(value)}"`
          : `"${key}":${String(value)}`;
      attrs.push(item);
    }
    attrs.sort();
    if (attrs.length === 0) {
      return `{"val":"${content}"}`;
    }
    return `{"attrs":{${attrs.join(',')}},"val":"${content}"}`;
  }

  /**
   * `getAttributes` returns the attributes of this value.
   */
  public getAttributes(): Record<string, string> {
    return this.attributes.toObject();
  }

  /**
   * `getValue` returns the internal value.
   */
  public getValue(): string {
    return this.value;
  }
}

/**
 *  `CRDTText` is a custom CRDT data type to represent the contents of text editors.
 *
 * @internal
 */
export class CRDTText<A> extends CRDTTextElement {
  private onChangesHandler?: (changes: Array<TextChangeWithAttrs<A>>) => void;
  private rgaTreeSplit: RGATreeSplit<CRDTTextValue>;
  private selectionMap: Map<string, Selection>;
  private remoteChangeLock: boolean;

  constructor(
    rgaTreeSplit: RGATreeSplit<CRDTTextValue>,
    createdAt: TimeTicket,
  ) {
    super(createdAt);
    this.rgaTreeSplit = rgaTreeSplit;
    this.selectionMap = new Map();
    this.remoteChangeLock = false;
  }

  /**
   * `create` a instance of Text.
   */
  public static create<A>(
    rgaTreeSplit: RGATreeSplit<CRDTTextValue>,
    createdAt: TimeTicket,
  ): CRDTText<A> {
    return new CRDTText<A>(rgaTreeSplit, createdAt);
  }

  /**
   * `edit` edits the given range with the given value and attributes.
   *
   * @internal
   */
  public edit(
    range: RGATreeSplitNodeRange,
    value: string,
    editedAt: TimeTicket,
    attributes?: Record<string, string>,
    latestCreatedAtMapByActor?: Map<string, TimeTicket>,
  ): Map<string, TimeTicket> {
    const val = value ? CRDTTextValue.create(value) : undefined;
    if (value && attributes) {
      for (const [k, v] of Object.entries(attributes)) {
        val!.setAttr(k, v, editedAt);
      }
    }

    const [caretPos, latestCreatedAtMap, changes] = this.rgaTreeSplit.edit(
      range,
      editedAt,
      val,
      latestCreatedAtMapByActor,
    );
    if (value && attributes) {
      const change = changes[changes.length - 1] as TextChangeWithAttrs<A>;
      change.attributes = this.parseAttributes(attributes);
    }

    const selectionChange = this.selectPriv([caretPos, caretPos], editedAt);
    if (selectionChange) {
      changes.push(selectionChange);
    }

    if (this.onChangesHandler) {
      this.remoteChangeLock = true;
      this.onChangesHandler(changes);
      this.remoteChangeLock = false;
    }

    return latestCreatedAtMap;
  }

  /**
   * `setStyle` applies the style of the given range.
   * 01. split nodes with from and to
   * 02. style nodes between from and to
   *
   * @param range - range of RGATreeSplitNode
   * @param attributes - style attributes
   * @param editedAt - edited time
   * @internal
   */
  public setStyle(
    range: RGATreeSplitNodeRange,
    attributes: Record<string, string>,
    editedAt: TimeTicket,
  ): void {
    // 01. split nodes with from and to
    const [, toRight] = this.rgaTreeSplit.findNodeWithSplit(range[1], editedAt);
    const [, fromRight] = this.rgaTreeSplit.findNodeWithSplit(
      range[0],
      editedAt,
    );

    // 02. style nodes between from and to
    const changes = [];
    const nodes = this.rgaTreeSplit.findBetween(fromRight, toRight);
    for (const node of nodes) {
      if (node.isRemoved()) {
        continue;
      }

      const [fromIdx, toIdx] = this.rgaTreeSplit.findIndexesFromRange(
        node.createRange(),
      );
      changes.push({
        type: TextChangeType.Style,
        actor: editedAt.getActorID()!,
        from: fromIdx,
        to: toIdx,
        attributes: this.parseAttributes(attributes),
      });

      for (const [key, value] of Object.entries(attributes)) {
        node.getValue().setAttr(key, value, editedAt);
      }
    }

    if (this.onChangesHandler) {
      this.remoteChangeLock = true;
      this.onChangesHandler(changes);
      this.remoteChangeLock = false;
    }
  }

  /**
   * `select` stores that the given range has been selected.
   *
   * @internal
   */
  public select(range: RGATreeSplitNodeRange, updatedAt: TimeTicket): void {
    if (this.remoteChangeLock) {
      return;
    }

    const change = this.selectPriv(range, updatedAt);
    if (this.onChangesHandler && change) {
      this.remoteChangeLock = true;
      this.onChangesHandler([change]);
      this.remoteChangeLock = false;
    }
  }

  /**
   * `hasRemoteChangeLock` checks whether remoteChangeLock has.
   */
  public hasRemoteChangeLock(): boolean {
    return this.remoteChangeLock;
  }

  /**
   * `onChanges` registers a handler of onChanges event.
   */
  public onChanges(
    handler: (changes: Array<TextChangeWithAttrs<A>>) => void,
  ): void {
    this.onChangesHandler = handler;
  }

  /**
   * `createRange` returns pair of RGATreeSplitNodePos of the given integer offsets.
   */
  public createRange(fromIdx: number, toIdx: number): RGATreeSplitNodeRange {
    const fromPos = this.rgaTreeSplit.findNodePos(fromIdx);
    if (fromIdx === toIdx) {
      return [fromPos, fromPos];
    }

    return [fromPos, this.rgaTreeSplit.findNodePos(toIdx)];
  }

  /**
   * `length` returns size of RGATreeList.
   */
  public get length(): number {
    return this.rgaTreeSplit.length;
  }

  /**
   * `checkWeight` returns false when there is an incorrect weight node.
   * for debugging purpose.
   */
  public checkWeight(): boolean {
    return this.rgaTreeSplit.checkWeight();
  }

  /**
   * `toJSON` returns the JSON encoding of this text.
   */
  public toJSON(): string {
    const json = [];

    for (const node of this.rgaTreeSplit) {
      if (!node.isRemoved()) {
        json.push(node.getValue().toJSON());
      }
    }

    return `[${json.join(',')}]`;
  }

  /**
   * `toSortedJSON` returns the sorted JSON encoding of this text.
   */
  public toSortedJSON(): string {
    return this.toJSON();
  }

  /**
   * `toString` returns the string representation of this text.
   */
  public toString(): string {
    return this.rgaTreeSplit.toString();
  }

  /**
   * `values` returns value array of this CRDTTextVal.
   */
  public values(): Array<CRDTTextVal<A>> {
    const values = [];

    for (const node of this.rgaTreeSplit) {
      if (!node.isRemoved()) {
        const value = node.getValue();
        values.push({
          attributes: this.parseAttributes(value.getAttributes()),
          value: value.getValue(),
        });
      }
    }

    return values;
  }

  /**
   * `getRGATreeSplit` returns rgaTreeSplit.
   *
   * @internal
   */
  public getRGATreeSplit(): RGATreeSplit<CRDTTextValue> {
    return this.rgaTreeSplit;
  }

  /**
   * `getStructureAsString` returns a String containing the meta data of this value
   * for debugging purpose.
   */
  public getStructureAsString(): string {
    return this.rgaTreeSplit.getStructureAsString();
  }

  /**
   * `getRemovedNodesLen` returns length of removed nodes
   */
  public getRemovedNodesLen(): number {
    return this.rgaTreeSplit.getRemovedNodesLen();
  }

  /**
   * `purgeTextNodesWithGarbage` physically purges nodes that have been removed.
   *
   * @internal
   */
  public purgeTextNodesWithGarbage(ticket: TimeTicket): number {
    return this.rgaTreeSplit.purgeTextNodesWithGarbage(ticket);
  }

  /**
   * `deepcopy` copies itself deeply.
   */
  public deepcopy(): CRDTText<A> {
    const text = new CRDTText<A>(
      this.rgaTreeSplit.deepcopy(),
      this.getCreatedAt(),
    );
    text.remove(this.getRemovedAt());
    return text;
  }

  private selectPriv(
    range: RGATreeSplitNodeRange,
    updatedAt: TimeTicket,
  ): TextChangeWithAttrs<A> | undefined {
    if (!this.selectionMap.has(updatedAt.getActorID()!)) {
      this.selectionMap.set(
        updatedAt.getActorID()!,
        Selection.of(range, updatedAt),
      );
      return;
    }

    const prevSelection = this.selectionMap.get(updatedAt.getActorID()!);
    if (updatedAt.after(prevSelection!.getUpdatedAt())) {
      this.selectionMap.set(
        updatedAt.getActorID()!,
        Selection.of(range, updatedAt),
      );

      const [from, to] = this.rgaTreeSplit.findIndexesFromRange(range);
      return {
        type: TextChangeType.Selection,
        actor: updatedAt.getActorID()!,
        from,
        to,
      };
    }
  }

  /**
   * `stringifyAttributes` makes values of attributes to JSON parsable string.
   */
  public stringifyAttributes(attributes: A): Record<string, string> {
    const attrs: Record<string, string> = {};
    for (const [key, value] of Object.entries(attributes)) {
      attrs[key] = JSON.stringify(value);
    }
    return attrs;
  }

  /**
   * `parseAttributes` returns the JSON parsable string values to the origin states.
   */
  private parseAttributes(attrs: Record<string, string>): A {
    const attributes: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(attrs)) {
      attributes[key] = JSON.parse(value);
    }
    return attributes as A;
  }
}
