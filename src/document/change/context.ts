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

import { TimeTicket, InitialDelimiter } from '../time/ticket';
import { JSONRoot } from '../json/root';
import { JSONContainer, JSONElement, TextElement } from '../json/element';
import { Operation } from '../operation/operation';
import { ChangeID } from './change_id';
import { Change } from './change';

/**
 * `ChangeContext` is used to record the context of modification when editing
 * a document. Each time we add an operation, a new time ticket is issued.
 * Finally returns a Change after the modification has been completed.
 */
export class ChangeContext {
  private id: ChangeID;
  private root: JSONRoot;
  private operations: Operation[];
  private message?: string;
  private delimiter: number;

  constructor(id: ChangeID, root: JSONRoot, message?: string) {
    this.id = id;
    this.root = root;
    this.message = message;
    this.operations = [];
    this.delimiter = InitialDelimiter;
  }

  /**
   * `create` creates a new instance of ChangeContext.
   */
  public static create(
    id: ChangeID,
    root: JSONRoot,
    message?: string,
  ): ChangeContext {
    return new ChangeContext(id, root, message);
  }

  /**
   * `push` pushes the given operation to this context.
   */
  public push(operation: Operation): void {
    this.operations.push(operation);
  }

  /**
   * `registerElement` registers the given element to the root.
   */
  public registerElement(element: JSONElement, parent: JSONContainer): void {
    this.root.registerElement(element, parent);
  }

  /**
   * `registerRemovedElement` register removed element for garbage collection.
   */
  public registerRemovedElement(deleted: JSONElement): void {
    this.root.registerRemovedElement(deleted);
  }

  /**
   * `registerRemovedNodeTextElement` register text element has removed node for
   * garbage collection.
   */
  public registerRemovedNodeTextElement(text: TextElement): void {
    this.root.registerTextWithGarbage(text);
  }

  /**
   * `getChange` creates a new instance of Change in this context.
   */
  public getChange(): Change {
    return Change.create(this.id, this.operations, this.message);
  }

  /**
   * `hasOperations` returns the whether this context has operations or not.
   */
  public hasOperations(): boolean {
    return this.operations.length > 0;
  }

  /**
   * `issueTimeTicket` creates a time ticket to be used to create a new operation.
   */
  public issueTimeTicket(): TimeTicket {
    this.delimiter += 1;
    return this.id.createTimeTicket(this.delimiter);
  }
}
