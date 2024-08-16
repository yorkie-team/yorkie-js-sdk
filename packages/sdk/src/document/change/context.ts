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
import { CRDTRoot } from '@yorkie-js-sdk/src/document/crdt/root';
import {
  CRDTContainer,
  CRDTElement,
} from '@yorkie-js-sdk/src/document/crdt/element';
import { Operation } from '@yorkie-js-sdk/src/document/operation/operation';
import { ChangeID } from '@yorkie-js-sdk/src/document/change/change_id';
import { Change } from '@yorkie-js-sdk/src/document/change/change';
import { PresenceChange } from '@yorkie-js-sdk/src/document/presence/presence';
import { Indexable } from '@yorkie-js-sdk/src/document/document';
import { deepcopy } from '@yorkie-js-sdk/src/util/object';
import { GCPair } from '@yorkie-js-sdk/src/document/crdt/gc';

/**
 * `ChangeContext` is used to record the context of modification when editing
 * a document. Each time we add an operation, a new time ticket is issued.
 * Finally returns a Change after the modification has been completed.
 */
export class ChangeContext<P extends Indexable = Indexable> {
  private id: ChangeID;
  private delimiter: number;
  private message?: string;

  private root: CRDTRoot;
  private operations: Array<Operation>;
  private presenceChange?: PresenceChange<P>;

  /**
   * `previousPresence` stores the previous presence to be used for undoing
   * presence changes.
   */
  private previousPresence: P;

  /**
   * `reversePresenceKeys` stores the keys of the presence to be used for undoing
   * presence changes.
   */
  private reversePresenceKeys: Set<string>;

  constructor(id: ChangeID, root: CRDTRoot, presence: P, message?: string) {
    this.id = id;
    this.delimiter = InitialDelimiter;

    this.root = root;
    this.operations = [];
    this.previousPresence = deepcopy(presence);
    this.presenceChange = undefined;
    this.reversePresenceKeys = new Set();
    this.message = message;
  }

  /**
   * `create` creates a new instance of ChangeContext.
   */
  public static create<P extends Indexable>(
    id: ChangeID,
    root: CRDTRoot,
    presence: P,
    message?: string,
  ): ChangeContext<P> {
    return new ChangeContext(id, root, presence, message);
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
   * `registerGCPair` registers the given pair to hash table.
   */
  public registerGCPair(pair: GCPair): void {
    this.root.registerGCPair(pair);
  }

  /**
   * `getChange` creates a new instance of Change in this context.
   */
  public getChange(): Change<P> {
    return Change.create<P>({
      id: this.id,
      operations: this.operations,
      presenceChange: this.presenceChange,
      message: this.message,
    });
  }

  /**
   * `hasChange` returns whether this context has change or not.
   */
  public hasChange(): boolean {
    return this.operations.length > 0 || this.presenceChange !== undefined;
  }

  /**
   * `setPresenceChange` registers the presence change to this context.
   */
  public setPresenceChange(presenceChange: PresenceChange<P>) {
    this.presenceChange = presenceChange;
  }

  /**
   * `setReversePresence` registers the previous presence to undo presence updates.
   */
  public setReversePresence(
    presence: Partial<P>,
    option?: { addToHistory: boolean },
  ) {
    for (const key of Object.keys(presence)) {
      if (option?.addToHistory) {
        this.reversePresenceKeys.add(key);
      } else {
        this.reversePresenceKeys.delete(key);
      }
    }
  }

  /**
   * `toReversePresence` returns the reverse presence of this context.
   */
  public getReversePresence() {
    if (this.reversePresenceKeys.size === 0) return undefined;

    const reversePresence: Partial<P> = {};
    for (const key of this.reversePresenceKeys) {
      reversePresence[key as keyof P] = this.previousPresence[key];
    }
    return reversePresence;
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
