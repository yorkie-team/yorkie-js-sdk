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
import { JSONElement } from './element';
import {
  Change,
  ChangeType,
  RGATreeSplit,
  RGATreeSplitNodeRange,
  Selection,
} from './rga_tree_split';

export class PlainText extends JSONElement {
  private onChangesHandler: (changes: Array<Change>) => void;
  private rgaTreeSplit: RGATreeSplit<string>;
  private selectionMap: Map<string, Selection>;
  private remoteChangeLock: boolean;

  constructor(rgaTreeSplit: RGATreeSplit<string>, createdAt: TimeTicket) {
    super(createdAt);
    this.rgaTreeSplit = rgaTreeSplit;
    this.selectionMap = new Map();
    this.remoteChangeLock = false;
  }

  public static create(
    rgaTreeSplit: RGATreeSplit<string>,
    createdAt: TimeTicket,
  ): PlainText {
    return new PlainText(rgaTreeSplit, createdAt);
  }

  public edit(fromIdx: number, toIdx: number, content: string): PlainText {
    logger.fatal(
      `unsupported: this method should be called by proxy, ${fromIdx}-${toIdx} ${content}`,
    );
    return null;
  }

  public editInternal(
    range: RGATreeSplitNodeRange,
    content: string,
    latestCreatedAtMapByActor: Map<string, TimeTicket>,
    editedAt: TimeTicket,
  ): Map<string, TimeTicket> {
    const [caretPos, latestCreatedAtMap, changes] = this.rgaTreeSplit.edit(
      range,
      content,
      latestCreatedAtMapByActor,
      editedAt,
    );

    const selectionChange = this.moveSelectionInternal(
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

  public moveSelection(
    range: RGATreeSplitNodeRange,
    movedAt: TimeTicket,
  ): void {
    if (this.remoteChangeLock) {
      return;
    }

    const change = this.moveSelectionInternal(range, movedAt);
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
    return `"${this.rgaTreeSplit.toJSON()}"`;
  }

  public toSortedJSON(): string {
    return this.toJSON();
  }

  public getValue(): string {
    return this.rgaTreeSplit.toJSON();
  }

  public getRGATreeSplit(): RGATreeSplit<string> {
    return this.rgaTreeSplit;
  }

  public getAnnotatedString(): string {
    return this.rgaTreeSplit.getAnnotatedString();
  }

  public deepcopy(): PlainText {
    const text = PlainText.create(
      this.rgaTreeSplit.deepcopy(),
      this.getCreatedAt(),
    );
    text.remove(this.getRemovedAt());
    return text;
  }

  private moveSelectionInternal(
    range: RGATreeSplitNodeRange,
    movedAt: TimeTicket,
  ): Change {
    if (!this.selectionMap.has(movedAt.getActorID())) {
      this.selectionMap.set(movedAt.getActorID(), Selection.of(range, movedAt));
      return null;
    }

    const prevSelection = this.selectionMap.get(movedAt.getActorID());
    if (movedAt.after(prevSelection.getMovedAt())) {
      this.selectionMap.set(movedAt.getActorID(), Selection.of(range, movedAt));

      const [from, to] = this.rgaTreeSplit.findIndexesFromRange(range);
      return {
        type: ChangeType.Selection,
        actor: movedAt.getActorID(),
        from,
        to,
      };
    }
  }
}
