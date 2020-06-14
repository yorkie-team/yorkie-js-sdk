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
import { PlainText } from '../json/text';
import { RichText } from '../json/rich_text';
import { Operation } from './operation';

export class SelectOperation extends Operation {
  private fromPos: RGATreeSplitNodePos;
  private toPos: RGATreeSplitNodePos;

  constructor(
    parentCreatedAt: TimeTicket,
    fromPos: RGATreeSplitNodePos,
    toPos: RGATreeSplitNodePos,
    executedAt: TimeTicket,
  ) {
    super(parentCreatedAt, executedAt);
    this.fromPos = fromPos;
    this.toPos = toPos;
  }

  public static create(
    parentCreatedAt: TimeTicket,
    fromPos: RGATreeSplitNodePos,
    toPos: RGATreeSplitNodePos,
    executedAt: TimeTicket,
  ): SelectOperation {
    return new SelectOperation(parentCreatedAt, fromPos, toPos, executedAt);
  }

  public execute(root: JSONRoot): void {
    const parentObject = root.findByCreatedAt(this.getParentCreatedAt());
    if (parentObject instanceof PlainText) {
      const text = parentObject as PlainText;
      text.updateSelection([this.fromPos, this.toPos], this.getExecutedAt());
    } else if (parentObject instanceof RichText) {
      const text = parentObject as RichText;
      text.updateSelection([this.fromPos, this.toPos], this.getExecutedAt());
    } else {
      logger.fatal(
        `fail to execute, only PlainText, RichText can execute select`,
      );
    }
  }

  public getAnnotatedString(): string {
    const parent = this.getParentCreatedAt().getAnnotatedString();
    const fromPos = this.fromPos.getAnnotatedString();
    const toPos = this.toPos.getAnnotatedString();
    return `${parent}.SELT(${fromPos},${toPos})`;
  }

  public getFromPos(): RGATreeSplitNodePos {
    return this.fromPos;
  }

  public getToPos(): RGATreeSplitNodePos {
    return this.toPos;
  }
}
