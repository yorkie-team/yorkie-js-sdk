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

import { logger } from '../../util/logger';
import { TimeTicket } from '../time/ticket';
import { RHT } from './rht';
import { TextElement } from './element';
import {
  Change,
  ChangeType,
  RGATreeSplit,
  RGATreeSplitNodeRange,
  Selection,
} from './rga_tree_split';

export interface RichTextVal {
  attributes: { [key: string]: string };
  content: string;
}

export class RichTextValue {
  private attributes: RHT;
  private content: string;

  constructor(content: string) {
    this.attributes = RHT.create();
    this.content = content;
  }

  public static create(content: string): RichTextValue {
    return new RichTextValue(content);
  }

  public get length(): number {
    return this.content.length;
  }

  public substring(indexStart: number, indexEnd: number): RichTextValue {
    const value = new RichTextValue(
      this.content.substring(indexStart, indexEnd),
    );
    value.attributes = this.attributes.deepcopy();
    return value;
  }

  public setAttr(key: string, value: string, updatedAt: TimeTicket): void {
    this.attributes.set(key, value, updatedAt);
  }

  public toString(): string {
    return this.content;
  }

  public toJSON(): string {
    return `{"attrs":${this.attributes.toJSON()},"content":${this.content}}`;
  }

  public getAttributes(): { [key: string]: string } {
    return this.attributes.toObject();
  }

  public getContent(): string {
    return this.content;
  }
}

export class RichText extends TextElement {
  private onChangesHandler: (changes: Array<Change>) => void;
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

  public static create(
    rgaTreeSplit: RGATreeSplit<RichTextValue>,
    createdAt: TimeTicket,
  ): RichText {
    const text = new RichText(rgaTreeSplit, createdAt);
    const range = text.createRange(0, 0);
    text.editInternal(range, '\n', null, null, createdAt);
    return text;
  }

  public edit(
    fromIdx: number,
    toIdx: number,
    content: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    attributes?: { [key: string]: string },
  ): RichText {
    logger.fatal(
      `unsupported: this method should be called by proxy, ${fromIdx}-${toIdx} ${content}`,
    );
    return null;
  }

  public setStyle(
    fromIdx: number,
    toIdx: number,
    key: string,
    value: string,
  ): RichText {
    logger.fatal(
      `unsupported: this method should be called by proxy, ${fromIdx}-${toIdx} ${key} ${value}`,
    );
    return null;
  }

  public editInternal(
    range: RGATreeSplitNodeRange,
    content: string,
    attributes: { [key: string]: string },
    latestCreatedAtMapByActor: Map<string, TimeTicket>,
    editedAt: TimeTicket,
  ): Map<string, TimeTicket> {
    const value = content ? RichTextValue.create(content) : null;
    if (content && attributes) {
      for (const [k, v] of Object.entries(attributes)) {
        value.setAttr(k, v, editedAt);
      }
    }

    const [caretPos, latestCreatedAtMap, changes] = this.rgaTreeSplit.edit(
      range,
      value,
      latestCreatedAtMapByActor,
      editedAt,
    );
    if (content && attributes) {
      const change = changes[changes.length - 1];
      change.attributes = attributes;
    }

    const selectionChange = this.updateSelectionInternal(
      [caretPos, caretPos],
      editedAt,
    );
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

  public setStyleInternal(
    range: RGATreeSplitNodeRange,
    attributes: { [key: string]: string },
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
        type: ChangeType.Style,
        actor: editedAt.getActorID(),
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

  public updateSelection(
    range: RGATreeSplitNodeRange,
    updatedAt: TimeTicket,
  ): void {
    if (this.remoteChangeLock) {
      return;
    }

    const change = this.updateSelectionInternal(range, updatedAt);
    if (this.onChangesHandler && change) {
      this.remoteChangeLock = true;
      this.onChangesHandler([change]);
      this.remoteChangeLock = false;
    }
  }

  public hasRemoteChangeLock(): boolean {
    return this.remoteChangeLock;
  }

  public onChanges(handler: (changes: Array<Change>) => void): void {
    this.onChangesHandler = handler;
  }

  public createRange(fromIdx: number, toIdx: number): RGATreeSplitNodeRange {
    const fromPos = this.rgaTreeSplit.findNodePos(fromIdx);
    if (fromIdx === toIdx) {
      return [fromPos, fromPos];
    }

    return [fromPos, this.rgaTreeSplit.findNodePos(toIdx)];
  }

  public toJSON(): string {
    const json = [];

    for (const node of this.rgaTreeSplit) {
      if (!node.isRemoved()) {
        json.push(node.getValue().toJSON());
      }
    }

    return `[${json.join(',')}]`;
  }

  public toSortedJSON(): string {
    return this.toJSON();
  }

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

  public getRGATreeSplit(): RGATreeSplit<RichTextValue> {
    return this.rgaTreeSplit;
  }

  public getAnnotatedString(): string {
    return this.rgaTreeSplit.getAnnotatedString();
  }

  /**
   * removedNodesLen returns length of removed nodes
   */
  public getRemovedNodesLen(): number {
    return this.rgaTreeSplit.getRemovedNodesLen();
  }

  /**
   * cleanupRemovedNodes cleans up nodes that have been removed.
   * The cleaned nodes are subject to garbage collector collection.
   */
  public cleanupRemovedNodes(ticket: TimeTicket): number {
    return this.rgaTreeSplit.cleanupRemovedNodes(ticket);
  }

  public deepcopy(): RichText {
    const text = new RichText(
      this.rgaTreeSplit.deepcopy(),
      this.getCreatedAt(),
    );
    text.remove(this.getRemovedAt());
    return text;
  }

  private updateSelectionInternal(
    range: RGATreeSplitNodeRange,
    updatedAt: TimeTicket,
  ): Change {
    if (!this.selectionMap.has(updatedAt.getActorID())) {
      this.selectionMap.set(
        updatedAt.getActorID(),
        Selection.of(range, updatedAt),
      );
      return null;
    }

    const prevSelection = this.selectionMap.get(updatedAt.getActorID());
    if (updatedAt.after(prevSelection.getUpdatedAt())) {
      this.selectionMap.set(
        updatedAt.getActorID(),
        Selection.of(range, updatedAt),
      );

      const [from, to] = this.rgaTreeSplit.findIndexesFromRange(range);
      return {
        type: ChangeType.Selection,
        actor: updatedAt.getActorID(),
        from,
        to,
      };
    }
  }
}
