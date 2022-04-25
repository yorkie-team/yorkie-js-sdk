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
import { PlainText } from '@yorkie-js-sdk/src/document/json/plain_text';
import { EditOperation } from '@yorkie-js-sdk/src/document/operation/edit_operation';
import { SelectOperation } from '@yorkie-js-sdk/src/document/operation/select_operation';

export type TText = {
  edit(fromIdx: number, toIdx: number, context: string): boolean;
  select(fromIdx: number, toIdx: number): boolean;
  getAnnotatedString(): string;
  getValue(): string;
  createRange(fromIdx: number, toIdx: number): RGATreeSplitNodeRange;
  onChanges(changes: Array<TextChange>): void;
};

/**
 * `TextProxy` is a proxy representing Text.
 */
export class TextProxy {
  private context: ChangeContext;
  private handlers: any;

  constructor(context: ChangeContext) {
    this.context = context;
    this.handlers = {
      get: (target: PlainText, method: keyof TText): any => {
        if (logger.isEnabled(LogLevel.Trivial)) {
          logger.trivial(`obj[${method}]`);
        }

        if (method === 'edit') {
          return (fromIdx: number, toIdx: number, content: string): boolean => {
            this.edit(target, fromIdx, toIdx, content);
            return true;
          };
        } else if (method === 'select') {
          return (fromIdx: number, toIdx: number): boolean => {
            this.select(target, fromIdx, toIdx);
            return true;
          };
        } else if (method === 'getAnnotatedString') {
          return (): string => {
            return target.getAnnotatedString();
          };
        } else if (method === 'getValue') {
          return (): string => {
            return target.getValue();
          };
        } else if (method === 'createRange') {
          return (fromIdx: number, toIdx: number): RGATreeSplitNodeRange => {
            return target.createRange(fromIdx, toIdx);
          };
        } else if (method === 'onChanges') {
          return (handler: (changes: Array<TextChange>) => void): void => {
            target.onChanges(handler);
          };
        }

        logger.fatal(`unsupported method: ${method}`);
      },
    };
  }

  /**
   * `create` creates a new instance of TextProxy.
   */
  public static create(context: ChangeContext, target: PlainText): PlainText {
    const textProxy = new TextProxy(context);
    return new Proxy(target, textProxy.getHandlers());
  }

  /**
   * `edit` edits the given range with the given content.
   */
  public edit(
    target: PlainText,
    fromIdx: number,
    toIdx: number,
    content: string,
  ): void {
    if (fromIdx > toIdx) {
      logger.fatal('from should be less than or equal to to');
    }

    const range = target.createRange(fromIdx, toIdx);
    if (logger.isEnabled(LogLevel.Debug)) {
      logger.debug(
        `EDIT: f:${fromIdx}->${range[0].getAnnotatedString()}, t:${toIdx}->${range[1].getAnnotatedString()} c:${content}`,
      );
    }

    const ticket = this.context.issueTimeTicket();
    const maxCreatedAtMapByActor = target.editInternal(range, content, ticket);

    this.context.push(
      new EditOperation(
        target.getCreatedAt(),
        range[0],
        range[1],
        maxCreatedAtMapByActor,
        content,
        ticket,
      ),
    );

    if (!range[0].equals(range[1])) {
      this.context.registerRemovedNodeTextElement(target);
    }
  }

  /**
   * `select` stores that the given range has been selected.
   */
  public select(target: PlainText, fromIdx: number, toIdx: number): void {
    const range = target.createRange(fromIdx, toIdx);
    if (logger.isEnabled(LogLevel.Debug)) {
      logger.debug(
        `SELT: f:${fromIdx}->${range[0].getAnnotatedString()}, t:${toIdx}->${range[1].getAnnotatedString()}`,
      );
    }
    const ticket = this.context.issueTimeTicket();
    target.selectInternal(range, ticket);

    this.context.push(
      new SelectOperation(target.getCreatedAt(), range[0], range[1], ticket),
    );
  }

  /**
   * `getHandlers` gets handlers.
   */
  public getHandlers(): any {
    return this.handlers;
  }
}
