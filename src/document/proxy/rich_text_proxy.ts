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

import { logger, LogLevel } from '../../util/logger';
import { ChangeContext } from '../change/context';
import { RGATreeSplitNodeRange, Change } from '../json/rga_tree_split';
import { RichText, RichTextVal } from '../json/rich_text';
import { RichEditOperation } from '../operation/rich_edit_operation';
import { StyleOperation } from '../operation/style_operation';
import { SelectOperation } from '../operation/select_operation';

export class RichTextProxy {
  private context: ChangeContext;
  private handlers: any;

  constructor(context: ChangeContext) {
    this.context = context;
    this.handlers = {
      get: (target: RichText, method: string): any => {
        if (logger.isEnabled(LogLevel.Trivial)) {
          logger.trivial(`obj[${method}]`);
        }

        if (method === 'edit') {
          return (
            fromIdx: number,
            toIdx: number,
            content: string,
            attributes?: { [key: string]: string },
          ): boolean => {
            this.edit(target, fromIdx, toIdx, content, attributes);
            return true;
          };
        }
        if (method === 'setStyle') {
          return (
            fromIdx: number,
            toIdx: number,
            attributes: { [key: string]: string },
          ): boolean => {
            this.setStyle(target, fromIdx, toIdx, attributes);
            return true;
          };
        } else if (method === 'updateSelection') {
          return (fromIdx: number, toIdx: number): boolean => {
            this.updateSelection(target, fromIdx, toIdx);
            return true;
          };
        } else if (method === 'getAnnotatedString') {
          return (): string => {
            return target.getAnnotatedString();
          };
        } else if (method === 'getValue') {
          return (): Array<RichTextVal> => {
            return target.getValue();
          };
        } else if (method === 'createRange') {
          return (fromIdx: number, toIdx: number): RGATreeSplitNodeRange => {
            return target.createRange(fromIdx, toIdx);
          };
        } else if (method === 'onChanges') {
          return (handler: (changes: Array<Change>) => void): void => {
            target.onChanges(handler);
          };
        }

        logger.fatal(`unsupported method: ${method}`);
      },
    };
  }

  public static create(context: ChangeContext, target: RichText): RichText {
    const textProxy = new RichTextProxy(context);
    return new Proxy(target, textProxy.getHandlers());
  }

  public edit(
    target: RichText,
    fromIdx: number,
    toIdx: number,
    content: string,
    attributes?: { [key: string]: string },
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
    const maxCreatedAtMapByActor = target.editInternal(
      range,
      content,
      attributes,
      null,
      ticket,
    );

    this.context.push(
      new RichEditOperation(
        target.getCreatedAt(),
        range[0],
        range[1],
        maxCreatedAtMapByActor,
        content,
        attributes ? new Map(Object.entries(attributes)) : new Map(),
        ticket,
      ),
    );

    if (range[0].compare(range[1]) !== 0) {
      this.context.registerRemovedNodeTextElement(target);
    }
  }

  public setStyle(
    target: RichText,
    fromIdx: number,
    toIdx: number,
    attributes: { [key: string]: string },
  ): void {
    if (fromIdx > toIdx) {
      logger.fatal('from should be less than or equal to to');
    }

    const range = target.createRange(fromIdx, toIdx);
    if (logger.isEnabled(LogLevel.Debug)) {
      logger.debug(
        `STYL: f:${fromIdx}->${range[0].getAnnotatedString()}, t:${toIdx}->${range[1].getAnnotatedString()} a:${JSON.stringify(
          attributes,
        )}`,
      );
    }

    const ticket = this.context.issueTimeTicket();
    target.setStyleInternal(range, attributes, ticket);

    this.context.push(
      new StyleOperation(
        target.getCreatedAt(),
        range[0],
        range[1],
        new Map(Object.entries(attributes)),
        ticket,
      ),
    );
  }

  public updateSelection(
    target: RichText,
    fromIdx: number,
    toIdx: number,
  ): void {
    const range = target.createRange(fromIdx, toIdx);
    if (logger.isEnabled(LogLevel.Debug)) {
      logger.debug(
        `SELT: f:${fromIdx}->${range[0].getAnnotatedString()}, t:${toIdx}->${range[1].getAnnotatedString()}`,
      );
    }
    const ticket = this.context.issueTimeTicket();
    target.updateSelection(range, ticket);

    this.context.push(
      new SelectOperation(target.getCreatedAt(), range[0], range[1], ticket),
    );
  }

  public getHandlers(): any {
    return this.handlers;
  }
}
