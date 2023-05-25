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
  InternalOpInfo,
} from '@yorkie-js-sdk/src/document/operation/operation';
import { CRDTRoot } from '@yorkie-js-sdk/src/document/crdt/root';
import { ChangeID } from '@yorkie-js-sdk/src/document/change/change_id';
import { PresenceInfo, Indexable } from '@yorkie-js-sdk/src/document/document';

/**
 * `Change` represents a unit of modification in the document.
 */
export class Change<P extends Indexable> {
  private id: ChangeID;

  // `operations` represent a series of user edits.
  private operations: Array<Operation>;

  // `presenceInfo` represent the updated presence info.
  private presenceInfo: PresenceInfo<P> | undefined;

  // `message` is used to save a description of the change.
  private message?: string;

  constructor({
    id,
    operations,
    presenceInfo,
    message,
  }: {
    id: ChangeID;
    operations?: Array<Operation>;
    presenceInfo?: PresenceInfo<P>;
    message?: string;
  }) {
    this.id = id;
    this.operations = operations || [];
    this.presenceInfo = presenceInfo;
    this.message = message;
  }

  /**
   * `create` creates a new instance of Change.
   */
  public static create<P extends Indexable>({
    id,
    operations,
    presenceInfo,
    message,
  }: {
    id: ChangeID;
    operations?: Array<Operation>;
    presenceInfo?: PresenceInfo<P>;
    message?: string;
  }): Change<P> {
    return new Change<P>({ id, operations, presenceInfo, message });
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
   * `hasPresenceInfo` returns whether this change has presence or not.
   */
  public hasPresenceInfo(): boolean {
    return this.presenceInfo !== undefined;
  }

  /**
   * `getPresenceInfo` returns the updated presence info of this change.
   */
  public getPresenceInfo(): PresenceInfo<P> | undefined {
    return this.presenceInfo;
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
   * `execute` executes the operations of this change to the given root.
   */
  public execute(root: CRDTRoot): Array<InternalOpInfo> {
    const opInfos: Array<InternalOpInfo> = [];
    for (const operation of this.operations) {
      const infos = operation.execute(root);
      opInfos.push(...infos);
    }
    return opInfos;
  }

  /**
   * `getStructureAsString` returns a string containing the meta data of this change.
   */
  public getStructureAsString(): string {
    return `${this.operations
      .map((operation) => operation.getStructureAsString())
      .join(',')}`;
  }
}
