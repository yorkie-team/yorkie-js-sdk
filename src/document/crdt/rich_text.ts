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
  RichTextChange,
  TextChangeType,
  RGATreeSplit,
  RGATreeSplitNodeRange,
  Selection,
} from '@yorkie-js-sdk/src/document/crdt/rga_tree_split';
import { escapeString } from '@yorkie-js-sdk/src/document/json/strings';

export interface RichTextVal<A> {
  attributes: A;
  content: string;
}

/**
 * `RichTextValue` is a value of RichText
 * which has a attributes that expresses the text style.
 *
 * @internal
 */
export class RichTextValue {
  private attributes: RHT;
  private content: string;

  /** @hideconstructor */
  constructor(content: string) {
    this.attributes = RHT.create();
    this.content = content;
  }

  /**
   * `create` creates a instance of RichTextValue.
   */
  public static create(content: string): RichTextValue {
    return new RichTextValue(content);
  }

  /**
   * `length` returns the length of content.
   */
  public get length(): number {
    return this.content.length;
  }

  /**
   * `substring` returns a sub-string value of the given range.
   */
  public substring(indexStart: number, indexEnd: number): RichTextValue {
    const value = new RichTextValue(
      this.content.substring(indexStart, indexEnd),
    );
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
   * `toString` returns content.
   */
  public toString(): string {
    return this.content;
  }

  /**
   * `toJSON` returns the JSON encoding of this .
   */
  public toJSON(): string {
    const attrs = this.attributes.toJSON();
    const content = escapeString(this.content);
    return `{"attrs":${attrs},"content":"${content}"}`;
  }

  /**
   * `getAttributes` returns the attributes of this value.
   */
  public getAttributes(): Record<string, string> {
    return this.attributes.toObject();
  }

  /**
   * `getContent` returns content.
   */
  public getContent(): string {
    return this.content;
  }
}

/**
 *  `CRDTRichText` is a custom CRDT data type to represent the contents of text editors.
 *
 * @internal
 */
export class CRDTRichText<A> extends CRDTTextElement {
  private onChangesHandler?: (changes: Array<RichTextChange<A>>) => void;
  private rgaTreeSplit: RGATreeSplit<RichTextValue>;
  private selectionMap: Map<string, Selection>;
  private remoteChangeLock: boolean;

  constructor(
    rgaTreeSplit: RGATreeSplit<RichTextValue>,
    createdAt: TimeTicket,
  ) {
    super(createdAt);
    this.rgaTreeSplit = rgaTreeSplit;
    this.selectionMap = new Map();
    this.remoteChangeLock = false;
  }

  /**
   * `create` a instance of RichText.
   */
  public static create<A>(
    rgaTreeSplit: RGATreeSplit<RichTextValue>,
    createdAt: TimeTicket,
  ): CRDTRichText<A> {
    const text = new CRDTRichText<A>(rgaTreeSplit, createdAt);
    const range = text.createRange(0, 0);
    text.edit(range, '\n', createdAt);
    return text;
  }

  /**
   * `edit` edits the given range with the given content and attributes.
   *
   * @internal
   */
  public edit(
    range: RGATreeSplitNodeRange,
    content: string,
    editedAt: TimeTicket,
    attributes?: Record<string, string>,
    latestCreatedAtMapByActor?: Map<string, TimeTicket>,
  ): Map<string, TimeTicket> {
    const value = content ? RichTextValue.create(content) : undefined;
    if (content && attributes) {
      for (const [k, v] of Object.entries(attributes)) {
        value!.setAttr(k, v, editedAt);
      }
    }

    const [caretPos, latestCreatedAtMap, changes] = this.rgaTreeSplit.edit(
      range,
      editedAt,
      value,
      latestCreatedAtMapByActor,
    );
    if (content && attributes) {
      const change = changes[changes.length - 1] as RichTextChange<A>;
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
  public onChanges(handler: (changes: Array<RichTextChange<A>>) => void): void {
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
   * `toJSON` returns the JSON encoding of this rich text.
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
   * `toSortedJSON` returns the sorted JSON encoding of this rich text.
   */
  public toSortedJSON(): string {
    return this.toJSON();
  }

  /**
   * `values` returns value array of this RichTextVal.
   */
  public values(): Array<RichTextVal<A>> {
    const values = [];

    for (const node of this.rgaTreeSplit) {
      if (!node.isRemoved()) {
        const value = node.getValue();
        values.push({
          attributes: this.parseAttributes(value.getAttributes()),
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
  public getRGATreeSplit(): RGATreeSplit<RichTextValue> {
    return this.rgaTreeSplit;
  }

  /**
   * `getAnnotatedString` returns a String containing the meta data of this value
   * for debugging purpose.
   */
  public getAnnotatedString(): string {
    return this.rgaTreeSplit.getAnnotatedString();
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
  public deepcopy(): CRDTRichText<A> {
    const text = new CRDTRichText<A>(
      this.rgaTreeSplit.deepcopy(),
      this.getCreatedAt(),
    );
    text.remove(this.getRemovedAt());
    return text;
  }

  private selectPriv(
    range: RGATreeSplitNodeRange,
    updatedAt: TimeTicket,
  ): RichTextChange<A> | undefined {
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
    Object.entries(attributes).forEach(([key, value]) => {
      attrs[key] = JSON.stringify(value);
    });
    return attrs;
  }

  /**
   * `parseAttributes` returns the JSON parsable string values to the origin states.
   */
  private parseAttributes(attrs: Record<string, string>): A {
    const attributes: Record<string, unknown> = {};
    Object.entries(attrs).forEach(([key, value]) => {
      attributes[key] = JSON.parse(value);
    });
    return attributes as A;
  }
}
