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

import {
  TimeTicket,
  InitialDelimiter,
} from '@yorkie-js-sdk/src/document/time/ticket';
import { Indexable, PresenceInfo } from '@yorkie-js-sdk/src/document/document';
import { CRDTRoot } from '@yorkie-js-sdk/src/document/crdt/root';
import {
  CRDTContainer,
  CRDTElement,
  CRDTGCElement,
} from '@yorkie-js-sdk/src/document/crdt/element';
import { Operation } from '@yorkie-js-sdk/src/document/operation/operation';
import { ChangeID } from '@yorkie-js-sdk/src/document/change/change_id';
import { Change } from '@yorkie-js-sdk/src/document/change/change';

/**
 * `ChangeContext` is used to record the context of modification when editing
 * a document. Each time we add an operation, a new time ticket is issued.
 * Finally returns a Change after the modification has been completed.
 */
export class ChangeContext<P extends Indexable = Indexable> {
  private id: ChangeID;
  private root: CRDTRoot;
  private operations: Array<Operation>;
  private presenceInfo: PresenceInfo<P> | undefined;
  private message?: string;
  private delimiter: number;

  constructor(id: ChangeID, root: CRDTRoot, message?: string) {
    this.id = id;
    this.root = root;
    this.message = message;
    this.operations = [];
    this.presenceInfo = undefined;
    this.delimiter = InitialDelimiter;
  }

  /**
   * `create` creates a new instance of ChangeContext.
   */
  public static create<P extends Indexable>(
    id: ChangeID,
    root: CRDTRoot,
    message?: string,
  ): ChangeContext<P> {
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
  public registerElement(element: CRDTElement, parent: CRDTContainer): void {
    this.root.registerElement(element, parent);
  }

  /**
   * `registerRemovedElement` register removed element for garbage collection.
   */
  public registerRemovedElement(deleted: CRDTElement): void {
    this.root.registerRemovedElement(deleted);
  }

  /**
   * `registerElementHasRemovedNodes` register GC element has removed node for
   * garbage collection.
   */
  public registerElementHasRemovedNodes(elem: CRDTGCElement): void {
    this.root.registerElementHasRemovedNodes(elem);
  }

  /**
   * `getChange` creates a new instance of Change in this context.
   */
  public getChange(): Change<P> {
    return Change.create({
      id: this.id,
      operations: this.operations,
      presenceInfo: this.presenceInfo,
      message: this.message,
    });
  }

  /**
   * `hasChange` returns whether there are any changes in this context.
   */
  public hasChange(): boolean {
    return this.hasOperations() || this.hasPresence();
  }

  /**
   * `hasOperations` returns the whether this context has operations or not.
   */
  public hasOperations(): boolean {
    return this.operations.length > 0;
  }

  /**
   * `hasPresence` returns whether this context has presenceInfo or not.
   */
  public hasPresence(): boolean {
    return this.presenceInfo !== undefined;
  }

  /**
   * `setPresence` registers the updated presenceInfo to this context.
   */
  public setPresence(presenceInfo: PresenceInfo<P>) {
    this.presenceInfo = presenceInfo;
  }

  /**
   * `issueTimeTicket` creates a time ticket to be used to create a new operation.
   */
  public issueTimeTicket(): TimeTicket {
    this.delimiter += 1;
    return this.id.createTimeTicket(this.delimiter);
  }

  /**
   * `getLastTimeTicket` returns the last time ticket issued in this context.
   */
  public getLastTimeTicket(): TimeTicket {
    return this.id.createTimeTicket(this.delimiter);
  }
}
