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
import { Indexable } from '@yorkie-js-sdk/src/document/document';
import { RHT } from '@yorkie-js-sdk/src/document/crdt/rht';
import { CRDTTextElement } from '@yorkie-js-sdk/src/document/crdt/element';
import {
  RGATreeSplit,
  RGATreeSplitNodeRange,
  Selection,
  ValueChange,
} from '@yorkie-js-sdk/src/document/crdt/rga_tree_split';
import { escapeString } from '@yorkie-js-sdk/src/document/json/strings';
import { parseObjectValues } from '@yorkie-js-sdk/src/util/object';

/**
 * `TextChangeType` is the type of TextChange.
 *
 * @internal
 */
export enum TextChangeType {
  Content = 'content',
  Selection = 'selection',
  Style = 'style',
}

/**
 * `TextValueType` is a value of Text
 * which has a attributes that expresses the text style.
 */
export interface TextValueType<A> {
  attributes?: A;
  content?: string;
}

/**
 * `TextChange` is the value passed as an argument to `Document.subscribe()`.
 * `Document.subscribe()` is called when the `Text` is modified.
 */
export interface TextChange<A = Indexable>
  extends ValueChange<TextValueType<A>> {
  type: TextChangeType;
}

/**
 * `CRDTTextValue` is a value of Text
 * which has a attributes that expresses the text style.
 * Attributes are represented by RHT.
 *
 * @internal
 */
export class CRDTTextValue {
  private attributes: RHT;
  private content: string;

  /** @hideconstructor */
  constructor(content: string) {
    this.attributes = RHT.create();
    this.content = content;
  }

  /**
   * `create` creates a instance of CRDTTextValue.
   */
  public static create(content: string): CRDTTextValue {
    return new CRDTTextValue(content);
  }

  /**
   * `length` returns the length of value.
   */
  public get length(): number {
    return this.content.length;
  }

  /**
   * `substring` returns a sub-string value of the given range.
   */
  public substring(indexStart: number, indexEnd: number): CRDTTextValue {
    const value = new CRDTTextValue(
      this.content.substring(indexStart, indexEnd),
    );
    value.attributes = this.attributes.deepcopy();
    return value;
  }

  /**
   * `setAttr` sets attribute of the given key, updated time and value.
   */
  public setAttr(key: string, content: string, updatedAt: TimeTicket): void {
    this.attributes.set(key, content, updatedAt);
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
    return this.content;
  }

  /**
   * `toJSON` returns the JSON encoding of this value.
   */
  public toJSON(): string {
    const content = escapeString(this.content);
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
   * `getContent` returns the internal content.
   */
  public getContent(): string {
    return this.content;
  }
}

/**
 *  `CRDTText` is a custom CRDT data type to represent the contents of text editors.
 *
 * @internal
 */
export class CRDTText<A extends Indexable = Indexable> extends CRDTTextElement {
  private rgaTreeSplit: RGATreeSplit<CRDTTextValue>;
  private selectionMap: Map<string, Selection>;

  constructor(
    rgaTreeSplit: RGATreeSplit<CRDTTextValue>,
    createdAt: TimeTicket,
  ) {
    super(createdAt);
    this.rgaTreeSplit = rgaTreeSplit;
    this.selectionMap = new Map();
  }

  /**
   * `create` a instance of Text.
   */
  public static create<A extends Indexable>(
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
    content: string,
    editedAt: TimeTicket,
    attributes?: Record<string, string>,
    latestCreatedAtMapByActor?: Map<string, TimeTicket>,
  ): [Map<string, TimeTicket>, Array<TextChange<A>>] {
    const crdtTextValue = content ? CRDTTextValue.create(content) : undefined;
    if (crdtTextValue && attributes) {
      for (const [k, v] of Object.entries(attributes)) {
        crdtTextValue.setAttr(k, v, editedAt);
      }
    }

    const [caretPos, latestCreatedAtMap, valueChanges] = this.rgaTreeSplit.edit(
      range,
      editedAt,
      crdtTextValue,
      latestCreatedAtMapByActor,
    );

    const changes: Array<TextChange<A>> = valueChanges.map((change) => ({
      ...change,
      value: change.value
        ? {
            attributes: parseObjectValues<A>(change.value.getAttributes()),
            content: change.value.getContent(),
          }
        : {
            attributes: undefined,
            content: '',
          },
      type: TextChangeType.Content,
    }));

    const selectionChange = this.selectPriv([caretPos, caretPos], editedAt);
    if (selectionChange) {
      changes.push(selectionChange);
    }

    return [latestCreatedAtMap, changes];
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
  ): Array<TextChange<A>> {
    // 01. split nodes with from and to
    const [, toRight] = this.rgaTreeSplit.findNodeWithSplit(range[1], editedAt);
    const [, fromRight] = this.rgaTreeSplit.findNodeWithSplit(
      range[0],
      editedAt,
    );

    // 02. style nodes between from and to
    const changes: Array<TextChange<A>> = [];
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
        value: {
          attributes: parseObjectValues(attributes) as A,
        },
      });

      for (const [key, value] of Object.entries(attributes)) {
        node.getValue().setAttr(key, value, editedAt);
      }
    }

    return changes;
  }

  /**
   * `select` stores that the given range has been selected.
   *
   * @internal
   */
  public select(
    range: RGATreeSplitNodeRange,
    updatedAt: TimeTicket,
  ): TextChange<A> | undefined {
    return this.selectPriv(range, updatedAt);
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
   * `values` returns the content-attributes pair array of this text.
   */
  public values(): Array<TextValueType<A>> {
    const values = [];

    for (const node of this.rgaTreeSplit) {
      if (!node.isRemoved()) {
        const value = node.getValue();
        values.push({
          attributes: parseObjectValues<A>(value.getAttributes()),
          content: value.getContent(),
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
  ): TextChange<A> | undefined {
    const prevSelection = this.selectionMap.get(updatedAt.getActorID()!);
    if (!prevSelection || updatedAt.after(prevSelection!.getUpdatedAt())) {
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
}
