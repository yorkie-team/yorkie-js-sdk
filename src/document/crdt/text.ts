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

import {
  InitialTimeTicket,
  MaxTimeTicket,
  TimeTicket,
} from '@yorkie-js-sdk/src/document/time/ticket';
import { Indexable } from '@yorkie-js-sdk/src/document/document';
import { RHT } from '@yorkie-js-sdk/src/document/crdt/rht';
import { CRDTGCElement } from '@yorkie-js-sdk/src/document/crdt/element';
import {
  RGATreeSplit,
  RGATreeSplitNode,
  RGATreeSplitPosRange,
  ValueChange,
} from '@yorkie-js-sdk/src/document/crdt/rga_tree_split';
import { escapeString } from '@yorkie-js-sdk/src/document/json/strings';
import { parseObjectValues } from '@yorkie-js-sdk/src/util/object';
import type * as Devtools from '@yorkie-js-sdk/src/devtools/types';

/**
 * `TextChangeType` is the type of TextChange.
 *
 */
enum TextChangeType {
  Content = 'content',
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
 * `TextChange` represents the changes to the text
 * when executing the edit, setstyle methods.
 */
interface TextChange<A = Indexable> extends ValueChange<TextValueType<A>> {
  type: TextChangeType;
}

/**
 * `CRDTTextValue` is a value of Text
 * which has a attributes that expresses the text style.
 * Attributes are represented by RHT.
 *
 */
export class CRDTTextValue {
  private attributes: RHT;
  private content: string;

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
          ? `"${escapeString(key)}":"${escapeString(value)}"`
          : `"${escapeString(key)}":${String(value)}`;
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
 */
export class CRDTText<A extends Indexable = Indexable> extends CRDTGCElement {
  private rgaTreeSplit: RGATreeSplit<CRDTTextValue>;

  constructor(
    rgaTreeSplit: RGATreeSplit<CRDTTextValue>,
    createdAt: TimeTicket,
  ) {
    super(createdAt);
    this.rgaTreeSplit = rgaTreeSplit;
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
    range: RGATreeSplitPosRange,
    content: string,
    editedAt: TimeTicket,
    attributes?: Record<string, string>,
    latestCreatedAtMapByActor?: Map<string, TimeTicket>,
  ): [Map<string, TimeTicket>, Array<TextChange<A>>, RGATreeSplitPosRange] {
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

    return [latestCreatedAtMap, changes, [caretPos, caretPos]];
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
    range: RGATreeSplitPosRange,
    attributes: Record<string, string>,
    editedAt: TimeTicket,
    latestCreatedAtMapByActor?: Map<string, TimeTicket>,
  ): [Map<string, TimeTicket>, Array<TextChange<A>>] {
    // 01. split nodes with from and to
    const [, toRight] = this.rgaTreeSplit.findNodeWithSplit(range[1], editedAt);
    const [, fromRight] = this.rgaTreeSplit.findNodeWithSplit(
      range[0],
      editedAt,
    );

    // 02. style nodes between from and to
    const changes: Array<TextChange<A>> = [];
    const nodes = this.rgaTreeSplit.findBetween(fromRight, toRight);
    const createdAtMapByActor = new Map<string, TimeTicket>();
    const toBeStyleds: Array<RGATreeSplitNode<CRDTTextValue>> = [];

    for (const node of nodes) {
      const actorID = node.getCreatedAt().getActorID();

      const latestCreatedAt = latestCreatedAtMapByActor?.size
        ? latestCreatedAtMapByActor!.has(actorID)
          ? latestCreatedAtMapByActor!.get(actorID)!
          : InitialTimeTicket
        : MaxTimeTicket;

      if (node.canStyle(editedAt, latestCreatedAt)) {
        const latestCreatedAt = createdAtMapByActor.get(actorID);
        const createdAt = node.getCreatedAt();
        if (!latestCreatedAt || createdAt.after(latestCreatedAt)) {
          createdAtMapByActor.set(actorID, createdAt);
        }
        toBeStyleds.push(node);
      }
    }

    for (const node of toBeStyleds) {
      if (node.isRemoved()) {
        continue;
      }

      const [fromIdx, toIdx] = this.rgaTreeSplit.findIndexesFromRange(
        node.createPosRange(),
      );
      changes.push({
        type: TextChangeType.Style,
        actor: editedAt.getActorID(),
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

    return [createdAtMapByActor, changes];
  }

  /**
   * `indexRangeToPosRange` returns the position range of the given index range.
   */
  public indexRangeToPosRange(
    fromIdx: number,
    toIdx: number,
  ): RGATreeSplitPosRange {
    const fromPos = this.rgaTreeSplit.indexToPos(fromIdx);
    if (fromIdx === toIdx) {
      return [fromPos, fromPos];
    }

    return [fromPos, this.rgaTreeSplit.indexToPos(toIdx)];
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
   * `toJSForTest` returns value with meta data for testing.
   */
  public toJSForTest(): Devtools.JSONElement {
    return {
      createdAt: this.getCreatedAt().toTestString(),
      value: JSON.parse(this.toJSON()),
      type: 'YORKIE_TEXT',
    };
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
   * `toTestString` returns a String containing the meta data of this value
   * for debugging purpose.
   */
  public toTestString(): string {
    return this.rgaTreeSplit.toTestString();
  }

  /**
   * `getRemovedNodesLen` returns length of removed nodes
   */
  public getRemovedNodesLen(): number {
    return this.rgaTreeSplit.getRemovedNodesLen();
  }

  /**
   * `purgeRemovedNodesBefore` purges removed nodes before the given time.
   *
   * @internal
   */
  public purgeRemovedNodesBefore(ticket: TimeTicket): number {
    return this.rgaTreeSplit.purgeRemovedNodesBefore(ticket);
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

  /**
   * `findIndexesFromRange` returns pair of integer offsets of the given range.
   */
  public findIndexesFromRange(range: RGATreeSplitPosRange): [number, number] {
    return this.rgaTreeSplit.findIndexesFromRange(range);
  }
}
