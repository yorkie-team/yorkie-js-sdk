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

import { ActorID } from '@yorkie-js-sdk/src/document/time/actor_id';
import {
  Operation,
  OperationInfo,
} from '@yorkie-js-sdk/src/document/operation/operation';
import { CRDTRoot } from '@yorkie-js-sdk/src/document/crdt/root';
import { ChangeID } from '@yorkie-js-sdk/src/document/change/change_id';
import { Indexable } from '@yorkie-js-sdk/src/document/document';
import {
  PresenceChange,
  PresenceChangeType,
} from '@yorkie-js-sdk/src/document/presence/presence';

/**
 * `Change` represents a unit of modification in the document.
 */
export class Change<P extends Indexable> {
  private id: ChangeID;

  // `operations` represent a series of user edits.
  private operations: Array<Operation>;

  // `presenceChange` represents the presenceChange of the user who made the change.
  private presenceChange?: PresenceChange<P>;

  // `message` is used to save a description of the change.
  private message?: string;

  constructor({
    id,
    operations,
    presenceChange,
    message,
  }: {
    id: ChangeID;
    operations?: Array<Operation>;
    presenceChange?: PresenceChange<P>;
    message?: string;
  }) {
    this.id = id;
    this.operations = operations || [];
    this.presenceChange = presenceChange;
    this.message = message;
  }

  /**
   * `create` creates a new instance of Change.
   */
  public static create<P extends Indexable>({
    id,
    operations,
    presenceChange,
    message,
  }: {
    id: ChangeID;
    operations?: Array<Operation>;
    presenceChange?: PresenceChange<P>;
    message?: string;
  }): Change<P> {
    return new Change({ id, operations, presenceChange, message });
  }

  /**
   * `getID` returns the ID of this change.
   */
  public getID(): ChangeID {
    return this.id;
  }

  /**
   * `getMessage` returns the message of this change.
   */
  public getMessage(): string | undefined {
    return this.message;
  }

  /**
   * `hasOperations` returns whether this change has operations or not.
   */
  public hasOperations(): boolean {
    return this.operations.length > 0;
  }

  /**
   * `getOperations` returns the operations of this change.
   */
  public getOperations(): Array<Operation> {
    return this.operations;
  }

  /**
   * `setActor` sets the given actor.
   */
  public setActor(actorID: ActorID): void {
    for (const operation of this.operations) {
      operation.setActor(actorID);
    }

    this.id = this.id.setActor(actorID);
  }

  /**
   * `hasPresenceChange` returns whether this change has presence change or not.
   */
  public hasPresenceChange(): boolean {
    return this.presenceChange !== undefined;
  }

  /**
   * `getPresenceChange` returns the presence change of this change.
   */
  public getPresenceChange(): PresenceChange<P> | undefined {
    return this.presenceChange;
  }

  /**
   * `execute` executes the operations of this change to the given root.
   */
  public execute(
    root: CRDTRoot,
    presences: Map<ActorID, P>,
  ): Array<OperationInfo> {
    const opInfos: Array<OperationInfo> = [];
    for (const operation of this.operations) {
      const infos = operation.execute(root);
      opInfos.push(...infos);
    }

    if (this.presenceChange) {
      if (this.presenceChange.type === PresenceChangeType.Put) {
        presences.set(this.id.getActorID()!, this.presenceChange.presence);
      } else {
        presences.delete(this.id.getActorID()!);
      }
    }
    return opInfos;
  }

  /**
   * `toTestString` returns a string containing the meta data of this change.
   */
  public toTestString(): string {
    return `${this.operations
      .map((operation) => operation.toTestString())
      .join(',')}`;
  }
}
