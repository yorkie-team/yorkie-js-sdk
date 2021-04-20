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
import { TextElement } from './element';
import {
  TextChange,
  TextChangeType,
  RGATreeSplit,
  RGATreeSplitNodeRange,
  Selection,
} from './rga_tree_split';

/**
 * `PlainText` represents plain text element
 * Text is an extended data type for the contents of a text editor
 *
 * @public
 */
export class PlainText extends TextElement {
  private onChangesHandler?: (changes: Array<TextChange>) => void;
  private rgaTreeSplit: RGATreeSplit<string>;
  private selectionMap: Map<string, Selection>;
  private remoteChangeLock: boolean;

  constructor(rgaTreeSplit: RGATreeSplit<string>, createdAt: TimeTicket) {
    super(createdAt);
    this.rgaTreeSplit = rgaTreeSplit;
    this.selectionMap = new Map();
    this.remoteChangeLock = false;
  }

  /**
   * `create` creates a new instance of `PlainText`.
   */
  public static create(
    rgaTreeSplit: RGATreeSplit<string>,
    createdAt: TimeTicket,
  ): PlainText {
    return new PlainText(rgaTreeSplit, createdAt);
  }

  /**
   * Don't use edit directly. Be sure to use it through a proxy.
   * The reason for setting the PlainText type as the return value
   * is to provide the PlainText interface to the user.
   */
  public edit(fromIdx: number, toIdx: number, content: string): PlainText {
    logger.fatal(
      `unsupported: this method should be called by proxy, ${fromIdx}-${toIdx} ${content}`,
    );
    // @ts-ignore
    return;
  }

  /**
   * `editInternal` edits the given range with the given content.
   *
   * @internal
   */
  public editInternal(
    range: RGATreeSplitNodeRange,
    content: string,
    editedAt: TimeTicket,
    latestCreatedAtMapByActor?: Map<string, TimeTicket>,
  ): Map<string, TimeTicket> {
    const [caretPos, latestCreatedAtMap, changes] = this.rgaTreeSplit.edit(
      range,
      editedAt,
      content,
      latestCreatedAtMapByActor,
    );

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
   * `selectInternal` updates selection info of the given selection range.
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
   * onChanges registers a handler of onChanges event.
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
   * `toJSON` returns the JSON encoding of this text.
   */
  public toJSON(): string {
    return `"${this.rgaTreeSplit.toJSON()}"`;
  }

  /**
   * `toSortedJSON` returns the sorted JSON encoding of this text.
   */
  public toSortedJSON(): string {
    return this.toJSON();
  }

  /**
   * `getValue` returns the JSON encoding of rgaTreeSplit.
   */
  public getValue(): string {
    return this.rgaTreeSplit.toJSON();
  }

  /**
   * `getRGATreeSplit` returns the rgaTreeSplit.
   *
   * @internal
   */
  public getRGATreeSplit(): RGATreeSplit<string> {
    return this.rgaTreeSplit;
  }

  /**
   * `getAnnotatedString` returns a String containing the meta data of the text.
   */
  public getAnnotatedString(): string {
    return this.rgaTreeSplit.getAnnotatedString();
  }

  /**
   * `getRemovedNodesLen` returns length of removed nodes.
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
  public deepcopy(): PlainText {
    const text = PlainText.create(
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
}
