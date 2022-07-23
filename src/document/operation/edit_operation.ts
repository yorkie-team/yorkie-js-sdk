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
import { JSONRoot } from '../json/root';
import { RGATreeSplitNodePos } from '../json/rga_tree_split';
import { PlainText } from '../json/plain_text';
import { Operation } from './operation';

/**
 * `EditOperation` is an operation representing editing Text.
 */
export class EditOperation extends Operation {
  private fromPos: RGATreeSplitNodePos;
  private toPos: RGATreeSplitNodePos;
  private maxCreatedAtMapByActor: Map<string, TimeTicket>;
  private content: string;

  constructor(
    parentCreatedAt: TimeTicket,
    fromPos: RGATreeSplitNodePos,
    toPos: RGATreeSplitNodePos,
    maxCreatedAtMapByActor: Map<string, TimeTicket>,
    content: string,
    executedAt: TimeTicket,
  ) {
    super(parentCreatedAt, executedAt);
    this.fromPos = fromPos;
    this.toPos = toPos;
    this.maxCreatedAtMapByActor = maxCreatedAtMapByActor;
    this.content = content;
  }

  /**
   * `create` creates a new instance of EditOperation.
   */
  public static create(
    parentCreatedAt: TimeTicket,
    fromPos: RGATreeSplitNodePos,
    toPos: RGATreeSplitNodePos,
    maxCreatedAtMapByActor: Map<string, TimeTicket>,
    content: string,
    executedAt: TimeTicket,
  ): EditOperation {
    return new EditOperation(
      parentCreatedAt,
      fromPos,
      toPos,
      maxCreatedAtMapByActor,
      content,
      executedAt,
    );
  }

  /**
   * `execute` executes this operation on the given document(`root`).
   */
  public execute(root: JSONRoot): void {
    const parentObject = root.findByCreatedAt(this.getParentCreatedAt());
    if (parentObject instanceof PlainText) {
      const text = parentObject as PlainText;
      text.editInternal(
        [this.fromPos, this.toPos],
        this.content,
        this.getExecutedAt(),
        this.maxCreatedAtMapByActor,
      );
      if (this.fromPos.compare(this.toPos) !== 0) {
        root.registerTextWithGarbage(text);
      }
    } else {
      if (!parentObject) {
        logger.fatal(`fail to find ${this.getParentCreatedAt()}`);
      }

      logger.fatal(`fail to execute, only PlainText can execute edit`);
    }
  }

  /**
   * `getEffectedCreatedAt` returns the time of the effected element.
   */
  public getEffectedCreatedAt(): TimeTicket {
    return this.getParentCreatedAt();
  }

  /**
   * `getAnnotatedString` returns a string containing the meta data.
   */
  public getAnnotatedString(): string {
    const parent = this.getParentCreatedAt().getAnnotatedString();
    const fromPos = this.fromPos.getAnnotatedString();
    const toPos = this.toPos.getAnnotatedString();
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
   * `getContent` returns the content of Edit.
   */
  public getContent(): string {
    return this.content;
  }

  /**
   * `getMaxCreatedAtMapByActor` returns the map that stores the latest creation time
   * by actor for the nodes included in the editing range.
   */
  public getMaxCreatedAtMapByActor(): Map<string, TimeTicket> {
    return this.maxCreatedAtMapByActor;
  }
}
