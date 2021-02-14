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
import { RichText } from '../json/rich_text';
import { Operation } from './operation';

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

  public execute(root: JSONRoot): void {
    const parentObject = root.findByCreatedAt(this.getParentCreatedAt());
    if (parentObject instanceof RichText) {
      const text = parentObject as RichText;
      text.editInternal(
        [this.fromPos, this.toPos],
        this.content,
        Object.fromEntries(this.attributes),
        this.maxCreatedAtMapByActor,
        this.getExecutedAt(),
      );
      if (this.fromPos.compare(this.toPos) !== 0) {
        root.registerRemovedNodeTextElement(text);
      }
    } else {
      logger.fatal(`fail to execute, only RichText can execute edit`);
    }
  }

  public getAnnotatedString(): string {
    const parent = this.getParentCreatedAt().getAnnotatedString();
    const fromPos = this.fromPos.getAnnotatedString();
    const toPos = this.toPos.getAnnotatedString();
    const content = this.content;
    return `${parent}.EDIT(${fromPos},${toPos},${content})`;
  }

  public getFromPos(): RGATreeSplitNodePos {
    return this.fromPos;
  }

  public getToPos(): RGATreeSplitNodePos {
    return this.toPos;
  }

  public getContent(): string {
    return this.content;
  }

  public getAttributes(): Map<string, string> {
    return this.attributes || new Map();
  }

  public getMaxCreatedAtMapByActor(): Map<string, TimeTicket> {
    return this.maxCreatedAtMapByActor;
  }
}
