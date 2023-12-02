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
import {
  TimeTicket,
  TimeTicketStruct,
} from '@yorkie-js-sdk/src/document/time/ticket';
import { ChangeContext } from '@yorkie-js-sdk/src/document/change/context';
import {
  RGATreeSplitBoundaryRange,
  RGATreeSplitPos,
  RGATreeSplitPosRange,
} from '@yorkie-js-sdk/src/document/crdt/rga_tree_split';
import {
  CRDTText,
  MarkTypes,
  TextValueType,
} from '@yorkie-js-sdk/src/document/crdt/text';
import { EditOperation } from '@yorkie-js-sdk/src/document/operation/edit_operation';
import { StyleOperation } from '@yorkie-js-sdk/src/document/operation/style_operation';
import { stringifyObjectValues } from '@yorkie-js-sdk/src/util/object';

/**
 * `TextPosStruct` represents the structure of RGATreeSplitPos.
 * It is used to serialize and deserialize the RGATreeSplitPos.
 */
export type TextPosStruct = {
  id: { createdAt: TimeTicketStruct; offset: number };
  relativeOffset: number;
};

/**
 * `TextPosStructRange` represents the structure of RGATreeSplitPosRange.
 * It is used to serialize and deserialize the RGATreeSplitPosRange.
 */
export type TextPosStructRange = [TextPosStruct, TextPosStruct];

/**
 * `Text` is an extended data type for the contents of a text editor.
 */
export class Text<A extends Indexable = Indexable> {
  private context?: ChangeContext;
  private text?: CRDTText<A>;
  private markTypes?: MarkTypes;

  constructor(context?: ChangeContext, text?: CRDTText<A>) {
    this.context = context;
    this.text = text;
    // NOTE(MoonGyu1): It can be converted to custom mark types later
    this.markTypes = new Map();
    this.markTypes.set('bold', { expand: 'after', allowMultiple: false });
  }

  /**
   * `initialize` initialize this text with context and internal text.
   * @internal
   */
  public initialize(context: ChangeContext, text: CRDTText<A>): void {
    this.context = context;
    this.text = text;
    // NOTE(MoonGyu1): It can be converted to custom mark types later
    this.markTypes = new Map();
    this.markTypes.set('bold', { expand: 'after', allowMultiple: false });
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
  ): [number, number] | undefined {
    if (!this.context || !this.text) {
      logger.fatal('it is not initialized yet');
      return;
    }

    if (fromIdx > toIdx) {
      logger.fatal('from should be less than or equal to to');
      return;
    }

    const range = this.text.indexRangeToPosRange(fromIdx, toIdx);
    if (logger.isEnabled(LogLevel.Debug)) {
      logger.debug(
        `EDIT: f:${fromIdx}->${range[0].toTestString()}, t:${toIdx}->${range[1].toTestString()} c:${content}`,
      );
    }
    const attrs = attributes ? stringifyObjectValues(attributes) : undefined;
    const ticket = this.context.issueTimeTicket();
    const [maxCreatedAtMapByActor, , rangeAfterEdit] = this.text.edit(
      range,
      content,
      ticket,
      attrs,
    );

    this.context.push(
      new EditOperation(
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
      this.context.registerElementHasRemovedNodes(this.text);
    }

    return this.text.findIndexesFromRange(rangeAfterEdit);
  }

  /**
   * `delete` deletes the text in the given range.
   */
  delete(fromIdx: number, toIdx: number): [number, number] | undefined {
    return this.edit(fromIdx, toIdx, '');
  }

  /**
   * `empty` makes the text empty.
   */
  empty(): [number, number] | undefined {
    return this.edit(0, this.length, '');
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

    const posRange = this.text.indexRangeToPosRange(fromIdx, toIdx);
    if (logger.isEnabled(LogLevel.Debug)) {
      logger.debug(
        `STYL: f:${fromIdx}->${posRange[0].toTestString()}, t:${toIdx}->${posRange[1].toTestString()} a:${JSON.stringify(
          attributes,
        )}`,
      );
    }

    const attrs = stringifyObjectValues(attributes);
    const ticket = this.context.issueTimeTicket();
    let boundaryRange: RGATreeSplitBoundaryRange;

    for (const [key, value] of Object.entries(attrs)) {
      if (this.markTypes?.has(key)) {
        const expand = this.markTypes.get(key)!.expand;

        // Find the boundaryRange if the attributes have the mark type (bold).
        boundaryRange = this.text.posRangeToBoundaryRange(
          posRange[0],
          posRange[1],
          ticket,
          expand,
        );

        // Execute the existing logic
        const [maxCreatedAtMapByActor] = this.text.setStyle(
          boundaryRange!,
          { [key]: value },
          ticket,
        );

        this.context.push(
          new StyleOperation(
            this.text.getCreatedAt(),
            boundaryRange![0],
            boundaryRange![1],
            maxCreatedAtMapByActor,
            new Map([[key, value]]),
            ticket,
          ),
        );

        delete attrs[key];
      }
    }

    if (Object.entries(attrs).length > 0) {
      // Find the boundaryRange if the attributes don't have the mark type (bold)
      boundaryRange = this.text.posRangeToBoundaryRange(
        posRange[0],
        posRange[1],
        ticket,
      );

      // Execute the existing logic
      const [maxCreatedAtMapByActor] = this.text.setStyle(
        boundaryRange!,
        attrs,
        ticket,
      );

      this.context.push(
        new StyleOperation(
          this.text.getCreatedAt(),
          boundaryRange![0],
          boundaryRange![1],
          maxCreatedAtMapByActor,
          new Map(Object.entries(attrs)),
          ticket,
        ),
      );
    }

    return true;
  }

  // TODO(MoonGyu1): Peritext 1. Add removeStyle method

  /**
   * `indexRangeToPosRange` returns TextRangeStruct of the given index range.
   */
  indexRangeToPosRange(range: [number, number]): TextPosStructRange {
    if (!this.context || !this.text) {
      logger.fatal('it is not initialized yet');
      // @ts-ignore
      return;
    }

    const textRange = this.text.indexRangeToPosRange(range[0], range[1]);
    return [textRange[0].toStruct(), textRange[1].toStruct()];
  }

  /**
   * `posRangeToIndexRange` returns indexes of the given TextRangeStruct.
   */
  posRangeToIndexRange(range: TextPosStructRange): [number, number] {
    if (!this.context || !this.text) {
      logger.fatal('it is not initialized yet');
      // @ts-ignore
      return;
    }

    const textRange = this.text.findIndexesFromRange([
      RGATreeSplitPos.fromStruct(range[0]),
      RGATreeSplitPos.fromStruct(range[1]),
    ]);
    return [textRange[0], textRange[1]];
  }

  /**
   * `toTestString` returns a String containing the meta data of the node
   * for debugging purpose.
   */
  toTestString(): string {
    if (!this.context || !this.text) {
      logger.fatal('it is not initialized yet');
      // @ts-ignore
      return;
    }

    return this.text.toTestString();
  }

  /**
   * `values` returns values of this text.
   */
  values(): Array<TextValueType<A>> {
    if (!this.context || !this.text) {
      logger.fatal('it is not initialized yet');
      // @ts-ignore
      return;
    }

    return this.text.values();
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
   * `createRangeForTest` returns pair of RGATreeSplitNodePos of the given indexes
   * for testing purpose.
   */
  createRangeForTest(fromIdx: number, toIdx: number): RGATreeSplitPosRange {
    if (!this.context || !this.text) {
      logger.fatal('it is not initialized yet');
      // @ts-ignore
      return;
    }

    return this.text.indexRangeToPosRange(fromIdx, toIdx);
  }
}
