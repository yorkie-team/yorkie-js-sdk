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
import { CRDTRoot } from '@yorkie-js-sdk/src/document/crdt/root';
import { RGATreeSplitNodePos } from '@yorkie-js-sdk/src/document/crdt/rga_tree_split';
import { CRDTRichText } from '@yorkie-js-sdk/src/document/crdt/rich_text';
import { Operation } from '@yorkie-js-sdk/src/document/operation/operation';

/**
 * `RichEditOperation` is an operation representing editing RichText. Most of the same as
 * Edit, but with additional style properties, attributes.
 */
export class RichEditOperation extends Operation {
  private fromPos: RGATreeSplitNodePos;
  private toPos: RGATreeSplitNodePos;
  private maxCreatedAtMapByActor: Map<string, TimeTicket>;
  private content: string;
  private attributes: Map<string, string>;

  constructor(
    parentCreatedAt: TimeTicket,
    fromPos: RGATreeSplitNodePos,
    toPos: RGATreeSplitNodePos,
    maxCreatedAtMapByActor: Map<string, TimeTicket>,
    content: string,
    attributes: Map<string, string>,
    executedAt: TimeTicket,
  ) {
    super(parentCreatedAt, executedAt);
    this.fromPos = fromPos;
    this.toPos = toPos;
    this.maxCreatedAtMapByActor = maxCreatedAtMapByActor;
    this.content = content;
    this.attributes = attributes;
  }

  /**
   * `create` creates a new instance of RichEditOperation.
   */
  public static create(
    parentCreatedAt: TimeTicket,
    fromPos: RGATreeSplitNodePos,
    toPos: RGATreeSplitNodePos,
    maxCreatedAtMapByActor: Map<string, TimeTicket>,
    content: string,
    attributes: Map<string, string>,
    executedAt: TimeTicket,
  ): RichEditOperation {
    return new RichEditOperation(
      parentCreatedAt,
      fromPos,
      toPos,
      maxCreatedAtMapByActor,
      content,
      attributes,
      executedAt,
    );
  }

  /**
   * `execute` executes this operation on the given `CRDTRoot`.
   */
  public execute<A>(root: CRDTRoot): void {
    const parentObject = root.findByCreatedAt(this.getParentCreatedAt());
    if (parentObject instanceof CRDTRichText) {
      const text = parentObject as CRDTRichText<A>;
      text.edit(
        [this.fromPos, this.toPos],
        this.content,
        this.getExecutedAt(),
        Object.fromEntries(this.attributes),
        this.maxCreatedAtMapByActor,
      );
      if (!this.fromPos.equals(this.toPos)) {
        root.registerTextWithGarbage(text);
      }
    } else {
      if (!parentObject) {
        logger.fatal(`fail to find ${this.getParentCreatedAt()}`);
      }

      logger.fatal(`fail to execute, only RichText can execute edit`);
    }
  }

  /**
   * `getEffectedCreatedAt` returns the creation time of the effected element.
   */
  public getEffectedCreatedAt(): TimeTicket {
    return this.getParentCreatedAt();
  }

  /**
   * `getStructureAsString` returns a string containing the meta data.
   */
  public getStructureAsString(): string {
    const parent = this.getParentCreatedAt().getStructureAsString();
    const fromPos = this.fromPos.getStructureAsString();
    const toPos = this.toPos.getStructureAsString();
    const content = this.content;
    return `${parent}.EDIT(${fromPos},${toPos},${content})`;
  }

  /**
   * `getFromPos` returns the start point of the editing range.
   */
  public getFromPos(): RGATreeSplitNodePos {
    return this.fromPos;
  }

  /**
   * `getToPos` returns the end point of the editing range.
   */
  public getToPos(): RGATreeSplitNodePos {
    return this.toPos;
  }

  /**
   * `getContent` returns the content of RichEdit.
   */
  public getContent(): string {
    return this.content;
  }

  /**
   * `getAttributes` returns the attributes of this Edit.
   */
  public getAttributes(): Map<string, string> {
    return this.attributes || new Map();
  }

  /**
   * `getMaxCreatedAtMapByActor` returns the map that stores the latest creation time
   * by actor for the nodes included in the editing range.
   */
  public getMaxCreatedAtMapByActor(): Map<string, TimeTicket> {
    return this.maxCreatedAtMapByActor;
  }
}
