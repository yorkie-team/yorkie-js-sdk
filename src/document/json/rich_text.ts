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

import { logger } from '@yorkie-js-sdk/src/util/logger';
import { TimeTicket } from '@yorkie-js-sdk/src/document/time/ticket';
import { RHT } from '@yorkie-js-sdk/src/document/json/rht';
import { TextElement } from '@yorkie-js-sdk/src/document/json/element';
import {
  TextChange,
  TextChangeType,
  RGATreeSplit,
  RGATreeSplitNodeRange,
  Selection,
} from '@yorkie-js-sdk/src/document/json/rga_tree_split';

export interface RichTextVal {
  attributes: Record<string, string>;
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
    return `{"attrs":${this.attributes.toJSON()},"content":${this.content}}`;
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
 *  `RichText` is an extended data type for the contents of a text editor.
 *
 * @internal
 */
export class RichText extends TextElement {
  private onChangesHandler?: (changes: Array<TextChange>) => void;
  private rgaTreeSplit: RGATreeSplit<RichTextValue>;
  private selectionMap: Record<string, Selection>;
  private remoteChangeLock: boolean;

  constructor(
    rgaTreeSplit: RGATreeSplit<RichTextValue>,
    createdAt: TimeTicket,
  ) {
    super(createdAt);
    this.rgaTreeSplit = rgaTreeSplit;
    this.selectionMap = {};
    this.remoteChangeLock = false;
  }

  /**
   * `create` a instance of RichText.
   */
  public static create(
    rgaTreeSplit: RGATreeSplit<RichTextValue>,
    createdAt: TimeTicket,
  ): RichText {
    const text = new RichText(rgaTreeSplit, createdAt);
    const range = text.createRange(0, 0);
    text.editInternal(range, '\n', createdAt);
    return text;
  }

  /**
   * Don't use edit directly. Be sure to use it through a proxy.
   * The reason for setting the RichText type as the return value
   * is to provide the RichText interface to the user.
   */
  public edit(
    fromIdx: number,
    toIdx: number,
    content: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    attributes?: Record<string, string>,
  ): RichText {
    logger.fatal(
      `unsupported: this method should be called by proxy, ${fromIdx}-${toIdx} ${content}`,
    );
    // @ts-ignore
    return;
  }

  /**
   * Don't use setStyle directly. Be sure to use it through a proxy.
   * The reason for setting the RichText type as the return value
   * is to provide the RichText interface to the user.
   */
  public setStyle(
    fromIdx: number,
    toIdx: number,
    key: string,
    value: string,
  ): RichText {
    logger.fatal(
      `unsupported: this method should be called by proxy, ${fromIdx}-${toIdx} ${key} ${value}`,
    );
    // @ts-ignore
    return;
  }

  /**
   * `editInternal` edits the given range with the given content and attributes.
   *
   * @internal
   */
  public editInternal(
    range: RGATreeSplitNodeRange,
    content: string,
    editedAt: TimeTicket,
    attributes?: Record<string, string>,
    latestCreatedAtMapByActor?: Record<string, TimeTicket>,
  ): Record<string, TimeTicket> {
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
      const change = changes[changes.length - 1];
      change.attributes = attributes;
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
   * `setStyleInternal` applies the style of the given range.
   * 01. split nodes with from and to
   * 02. style nodes between from and to
   *
   * @param range - range of RGATreeSplitNode
   * @param attributes - style attributes
   * @param editedAt - edited time
   * @internal
   */
  public setStyleInternal(
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
        attributes,
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
   * Don't use select directly. Be sure to use it through a proxy.
   */
  public select(fromIdx: number, toIdx: number): void {
    logger.fatal(
      `unsupported: this method should be called by proxy, ${fromIdx}-${toIdx}`,
    );
    // @ts-ignore
    return;
  }

  /**
   * `selectInternal` stores that the given range has been selected.
   *
   * @internal
   */
  public selectInternal(
    range: RGATreeSplitNodeRange,
    updatedAt: TimeTicket,
  ): void {
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
  public onChanges(handler: (changes: Array<TextChange>) => void): void {
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
   * `getValue` returns value array of this RichTextVal.
   */
  public getValue(): Array<RichTextVal> {
    const values = [];

    for (const node of this.rgaTreeSplit) {
      if (!node.isRemoved()) {
        const value = node.getValue();
        values.push({
          attributes: value.getAttributes(),
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
   * `cleanupRemovedNodes` cleans up nodes that have been removed.
   * The cleaned nodes are subject to garbage collector collection.
   *
   * @internal
   */
  public cleanupRemovedNodes(ticket: TimeTicket): number {
    return this.rgaTreeSplit.cleanupRemovedNodes(ticket);
  }

  /**
   * `deepcopy` copies itself deeply.
   */
  public deepcopy(): RichText {
    const text = new RichText(
      this.rgaTreeSplit.deepcopy(),
      this.getCreatedAt(),
    );
    text.remove(this.getRemovedAt());
    return text;
  }

  private selectPriv(
    range: RGATreeSplitNodeRange,
    updatedAt: TimeTicket,
  ): TextChange | undefined {
    if (
      !Object.prototype.hasOwnProperty.call(
        this.selectionMap,
        updatedAt.getActorID()!,
      )
    ) {
      this.selectionMap[updatedAt.getActorID()!] = Selection.of(
        range,
        updatedAt,
      );
      return;
    }

    const prevSelection = this.selectionMap[updatedAt.getActorID()!];
    if (updatedAt.after(prevSelection!.getUpdatedAt())) {
      this.selectionMap[updatedAt.getActorID()!] = Selection.of(
        range,
        updatedAt,
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
