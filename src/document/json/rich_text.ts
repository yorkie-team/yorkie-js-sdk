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
import { Indexable } from '@yorkie-js-sdk/src/document/document';
import { TimeTicket } from '@yorkie-js-sdk/src/document/time/ticket';
import { ChangeContext } from '@yorkie-js-sdk/src/document/change/context';
import {
  RGATreeSplitNodeRange,
  RichTextChange,
} from '@yorkie-js-sdk/src/document/crdt/rga_tree_split';
import {
  CRDTRichText,
  RichTextVal,
} from '@yorkie-js-sdk/src/document/crdt/rich_text';
import { RichEditOperation } from '@yorkie-js-sdk/src/document/operation/rich_edit_operation';
import { StyleOperation } from '@yorkie-js-sdk/src/document/operation/style_operation';
import { SelectOperation } from '@yorkie-js-sdk/src/document/operation/select_operation';

/**
 * `RichText` is an extended data type for the contents of a text editor.
 */
export class RichText<A = Indexable> {
  private context?: ChangeContext;
  private text?: CRDTRichText<A>;

  constructor(context?: ChangeContext, text?: CRDTRichText<A>) {
    this.context = context;
    this.text = text;
  }

  /**
   * `initialize` initialize this rich text with context and internal text.
   * @internal
   */
  public initialize(context: ChangeContext, text: CRDTRichText<A>): void {
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
  edit(
    fromIdx: number,
    toIdx: number,
    content: string,
    attributes?: A,
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
        `EDIT: f:${fromIdx}->${range[0].getStructureAsString()}, t:${toIdx}->${range[1].getStructureAsString()} c:${content}`,
      );
    }
    const attrs = attributes
      ? this.text.stringifyAttributes(attributes)
      : undefined;
    const ticket = this.context.issueTimeTicket();
    const maxCreatedAtMapByActor = this.text.edit(
      range,
      content,
      ticket,
      attrs,
    );

    this.context.push(
      new RichEditOperation(
        this.text.getCreatedAt(),
        range[0],
        range[1],
        maxCreatedAtMapByActor,
        content,
        attrs ? new Map(Object.entries(attrs)) : new Map(),
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
  setStyle(fromIdx: number, toIdx: number, attributes: A): boolean {
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
        `STYL: f:${fromIdx}->${range[0].getStructureAsString()}, t:${toIdx}->${range[1].getStructureAsString()} a:${JSON.stringify(
          attributes,
        )}`,
      );
    }

    const attrs = this.text.stringifyAttributes(attributes);
    const ticket = this.context.issueTimeTicket();
    this.text.setStyle(range, attrs, ticket);

    this.context.push(
      new StyleOperation(
        this.text.getCreatedAt(),
        range[0],
        range[1],
        new Map(Object.entries(attrs)),
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
        `SELT: f:${fromIdx}->${range[0].getStructureAsString()}, t:${toIdx}->${range[1].getStructureAsString()}`,
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
   * `getStructureAsString` returns a String containing the meta data of the node
   * for debugging purpose.
   */
  getStructureAsString(): string {
    if (!this.context || !this.text) {
      logger.fatal('it is not initialized yet');
      // @ts-ignore
      return;
    }

    return this.text.getStructureAsString();
  }

  /**
   * `values` returns values of this text.
   */
  values(): Array<RichTextVal<A>> {
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
  onChanges(handler: (changes: Array<RichTextChange<A>>) => void): void {
    if (!this.context || !this.text) {
      logger.fatal('it is not initialized yet');
      return;
    }

    this.text.onChanges(handler);
  }
}
