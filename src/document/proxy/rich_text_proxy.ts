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
import { ChangeContext } from '@yorkie-js-sdk/src/document/change/context';
import {
  RGATreeSplitNodeRange,
  TextChange,
} from '@yorkie-js-sdk/src/document/json/rga_tree_split';
import {
  RichTextInternal,
  RichTextVal,
} from '@yorkie-js-sdk/src/document/json/rich_text';
import { RichEditOperation } from '@yorkie-js-sdk/src/document/operation/rich_edit_operation';
import { StyleOperation } from '@yorkie-js-sdk/src/document/operation/style_operation';
import { SelectOperation } from '@yorkie-js-sdk/src/document/operation/select_operation';

/**
 * `RichText` is an extended data type for the contents of a text editor.
 */
export class RichText {
  private context?: ChangeContext;
  private text?: RichTextInternal;

  constructor(context?: ChangeContext, text?: RichTextInternal) {
    this.context = context;
    this.text = text;
  }

  /**
   * `initialize` initialize this rich text with context and internal text.
   * @internal
   */
  public initialize(context: ChangeContext, text: RichTextInternal): void {
    this.context = context;
    this.text = text;
  }

  /**
   * `edit` edits this text with the given content.
   */
  edit(
    fromIdx: number,
    toIdx: number,
    content: string,
    attributes?: Record<string, string>,
  ): boolean {
    if (!this.context || !this.text) {
      logger.fatal('it is not initialized yet');
      return false;
    }

    if (fromIdx > toIdx) {
      logger.fatal('from should be less than or equal to to');
      return false;
    }

    const range = this.text.createRange(fromIdx, toIdx);
    if (logger.isEnabled(LogLevel.Debug)) {
      logger.debug(
        `EDIT: f:${fromIdx}->${range[0].getAnnotatedString()}, t:${toIdx}->${range[1].getAnnotatedString()} c:${content}`,
      );
    }

    const ticket = this.context.issueTimeTicket();
    const maxCreatedAtMapByActor = this.text.editInternal(
      range,
      content,
      ticket,
      attributes,
    );

    this.context.push(
      new RichEditOperation(
        this.text.getCreatedAt(),
        range[0],
        range[1],
        maxCreatedAtMapByActor,
        content,
        attributes ? new Map(Object.entries(attributes)) : new Map(),
        ticket,
      ),
    );

    if (!range[0].equals(range[1])) {
      this.context.registerRemovedNodeTextElement(this.text);
    }

    return true;
  }

  /**
   * `setStyle` styles this text with the given attributes.
   */
  setStyle(
    fromIdx: number,
    toIdx: number,
    attributes: Record<string, string>,
  ): boolean {
    if (!this.context || !this.text) {
      logger.fatal('it is not initialized yet');
      return false;
    }

    if (fromIdx > toIdx) {
      logger.fatal('from should be less than or equal to to');
      return false;
    }

    const range = this.text.createRange(fromIdx, toIdx);
    if (logger.isEnabled(LogLevel.Debug)) {
      logger.debug(
        `STYL: f:${fromIdx}->${range[0].getAnnotatedString()}, t:${toIdx}->${range[1].getAnnotatedString()} a:${JSON.stringify(
          attributes,
        )}`,
      );
    }

    const ticket = this.context.issueTimeTicket();
    this.text.setStyleInternal(range, attributes, ticket);

    this.context.push(
      new StyleOperation(
        this.text.getCreatedAt(),
        range[0],
        range[1],
        new Map(Object.entries(attributes)),
        ticket,
      ),
    );

    return true;
  }

  /**
   * `select` selects the given range.
   */
  select(fromIdx: number, toIdx: number): boolean {
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
    this.text.selectInternal(range, ticket);

    this.context.push(
      new SelectOperation(this.text.getCreatedAt(), range[0], range[1], ticket),
    );

    return true;
  }

  /**
   * `getAnnotatedString` returns a String containing the meta data of the node
   * for debugging purpose.
   */
  getAnnotatedString(): string {
    if (!this.context || !this.text) {
      logger.fatal('it is not initialized yet');
      return '';
    }

    return this.text.getAnnotatedString();
  }

  /**
   * `values` returns values of this text.
   */
  values(): Array<RichTextVal> {
    if (!this.context || !this.text) {
      logger.fatal('it is not initialized yet');
      // @ts-ignore
      return;
    }

    return this.text.values();
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
  onChanges(handler: (changes: Array<TextChange>) => void): void {
    if (!this.context || !this.text) {
      logger.fatal('it is not initialized yet');
      return;
    }

    this.text.onChanges(handler);
  }
}
