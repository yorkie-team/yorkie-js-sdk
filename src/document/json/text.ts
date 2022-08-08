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

import { logger, LogLevel } from '@yorkie-js-sdk/src/util/logger';
import { TimeTicket } from '@yorkie-js-sdk/src/document/time/ticket';
import { ChangeContext } from '@yorkie-js-sdk/src/document/change/context';
import {
  RGATreeSplitNodeRange,
  TextChange,
} from '@yorkie-js-sdk/src/document/crdt/rga_tree_split';
import { CRDTText } from '@yorkie-js-sdk/src/document/crdt/text';
import { EditOperation } from '@yorkie-js-sdk/src/document/operation/edit_operation';
import { SelectOperation } from '@yorkie-js-sdk/src/document/operation/select_operation';

/**
 * `Text` represents text element for representing contents of a text editor.
 */
export class Text {
  private context?: ChangeContext;
  private text?: CRDTText;

  constructor(context?: ChangeContext, text?: CRDTText) {
    this.context = context;
    this.text = text;
  }

  /**
   * `initialize` initialize this text with context and internal text.
   * @internal
   */
  public initialize(context: ChangeContext, text: CRDTText): void {
    this.context = context;
    this.text = text;
  }

  /**
   * `getID` returns the ID of this text.
   */
  public getID(): TimeTicket {
    return this.text!.getID();
  }

  /**
   * `edit` edits this text with the given content.
   */
  public edit(fromIdx: number, toIdx: number, content: string): boolean {
    if (!this.context || !this.text) {
      logger.fatal('it is not initialized yet');
      return false;
    }

    if (fromIdx > toIdx) {
      logger.fatal('from should be less than or equal to to');
    }

    const range = this.text.createRange(fromIdx, toIdx);
    if (logger.isEnabled(LogLevel.Debug)) {
      logger.debug(
        `EDIT: f:${fromIdx}->${range[0].getAnnotatedString()}, t:${toIdx}->${range[1].getAnnotatedString()} c:${content}`,
      );
    }

    const ticket = this.context.issueTimeTicket();
    const maxCreatedAtMapByActor = this.text.edit(range, content, ticket);

    this.context.push(
      new EditOperation(
        this.text.getCreatedAt(),
        range[0],
        range[1],
        maxCreatedAtMapByActor,
        content,
        ticket,
      ),
    );

    if (!range[0].equals(range[1])) {
      this.context.registerRemovedNodeTextElement(this.text);
    }

    return true;
  }

  /**
   * `select` selects the given range.
   */
  public select(fromIdx: number, toIdx: number): boolean {
    if (!this.context || !this.text) {
      logger.fatal('it is not initialized yet');
      return false;
    }

    const range = this.text.createRange(fromIdx, toIdx);
    if (logger.isEnabled(LogLevel.Debug)) {
      logger.debug(
        `SELT: f:${fromIdx}->${range[0].getAnnotatedString()}, t:${toIdx}->${range[1].getAnnotatedString()}`,
      );
    }
    const ticket = this.context.issueTimeTicket();
    this.text.select(range, ticket);

    this.context.push(
      new SelectOperation(this.text.getCreatedAt(), range[0], range[1], ticket),
    );

    return true;
  }

  /**
   * `getAnnotatedString` returns a String containing the meta data of the node
   * for debugging purpose.
   */
  public getAnnotatedString(): string {
    if (!this.context || !this.text) {
      logger.fatal('it is not initialized yet');
      return '';
    }

    return this.text.getAnnotatedString();
  }

  /**
   * `length` returns size of RGATreeList.
   */
  public get length(): number {
    return this.text!.length;
  }

  /**
   * `checkWeight` returns false when there is an incorrect weight node.
   * for debugging purpose.
   */
  public checkWeight(): boolean {
    return this.text!.checkWeight();
  }

  /**
   * `toString` returns the string representation of this text.
   */
  toString(): string {
    if (!this.context || !this.text) {
      logger.fatal('it is not initialized yet');
      return '';
    }

    return this.text.toString();
  }

  /**
   * `createRange` returns pair of RGATreeSplitNodePos of the given integer offsets.
   */
  createRange(fromIdx: number, toIdx: number): RGATreeSplitNodeRange {
    if (!this.context || !this.text) {
      logger.fatal('it is not initialized yet');
      // @ts-ignore
      return;
    }

    return this.text.createRange(fromIdx, toIdx);
  }

  /**
   * `onChanges` registers a handler of onChanges event.
   */
  onChanges(handler: (changes: Array<TextChange<undefined>>) => void): void {
    if (!this.context || !this.text) {
      logger.fatal('it is not initialized yet');
      return;
    }

    this.text.onChanges(handler);
  }
}
