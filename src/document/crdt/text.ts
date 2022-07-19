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
import { CRDTTextElement } from '@yorkie-js-sdk/src/document/crdt/element';
import {
  TextChange,
  TextChangeType,
  RGATreeSplit,
  RGATreeSplitNodeRange,
  Selection,
} from '@yorkie-js-sdk/src/document/crdt/rga_tree_split';
import { escapeString } from '@yorkie-js-sdk/src/document/json/strings';

/**
 * `CRDTText` represents plain text element
 * Text is an extended data type for the contents of a text editor
 *
 * @internal
 */
export class CRDTText extends CRDTTextElement {
  private onChangesHandler?: (changes: Array<TextChange>) => void;
  private rgaTreeSplit: RGATreeSplit<string>;
  private selectionMap: Map<string, Selection>;
  private remoteChangeLock: boolean;

  /** @hideconstructor */
  constructor(rgaTreeSplit: RGATreeSplit<string>, createdAt: TimeTicket) {
    super(createdAt);
    this.rgaTreeSplit = rgaTreeSplit;
    this.selectionMap = new Map();
    this.remoteChangeLock = false;
  }

  /**
   * `create` creates a new instance of `CRDTText`.
   */
  public static create(
    rgaTreeSplit: RGATreeSplit<string>,
    createdAt: TimeTicket,
  ): CRDTText {
    return new CRDTText(rgaTreeSplit, createdAt);
  }

  /**
   * `edit` edits the given range with the given content.
   *
   * @internal
   */
  public edit(
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
   * `select` updates selection info of the given selection range.
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
    return `"${escapeString(this.rgaTreeSplit.toJSON())}"`;
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
  public deepcopy(): CRDTText {
    const text = CRDTText.create(
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
