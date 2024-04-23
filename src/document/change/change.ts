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
  OpSource,
  Operation,
  OperationInfo,
} from '@yorkie-js-sdk/src/document/operation/operation';
import { CRDTRoot } from '@yorkie-js-sdk/src/document/crdt/root';
import { ChangeID } from '@yorkie-js-sdk/src/document/change/change_id';
import { Indexable } from '@yorkie-js-sdk/src/document/document';
import { converter } from '@yorkie-js-sdk/src/api/converter';
import { HistoryOperation } from '@yorkie-js-sdk/src/document/history';
import {
  PresenceChange,
  PresenceChangeType,
} from '@yorkie-js-sdk/src/document/presence/presence';
import { deepcopy } from '@yorkie-js-sdk/src/util/object';

/**
 * `ChangeStruct` represents the structure of Change.
 * This is used to serialize and deserialize Change.
 */
export type ChangeStruct<P extends Indexable> = {
  changeID: string;
  message?: string;
  operations?: Array<string>;
  presenceChange?: {
    type: PresenceChangeType;
    presence?: P;
  };
};

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
    source: OpSource,
  ): {
    opInfos: Array<OperationInfo>;
    reverseOps: Array<HistoryOperation<P>>;
  } {
    const changeOpInfos: Array<OperationInfo> = [];
    const reverseOps: Array<HistoryOperation<P>> = [];

    for (const operation of this.operations) {
      const executionResult = operation.execute(root, source);
      // NOTE(hackerwins): If the element was removed while executing undo/redo,
      // the operation is not executed and executionResult is undefined.
      if (!executionResult) continue;
      const { opInfos, reverseOp } = executionResult;
      changeOpInfos.push(...opInfos);

      // TODO(hackerwins): This condition should be removed after implementing
      // all reverse operations.
      if (reverseOp) {
        reverseOps.unshift(reverseOp);
      }
    }

    if (this.presenceChange) {
      if (this.presenceChange.type === PresenceChangeType.Put) {
        presences.set(
          this.id.getActorID(),
          deepcopy(this.presenceChange.presence),
        );
      } else {
        presences.delete(this.id.getActorID());
      }
    }

    return { opInfos: changeOpInfos, reverseOps };
  }

  /**
   * `toTestString` returns a string containing the meta data of this change.
   */
  public toTestString(): string {
    return `${this.operations
      .map((operation) => operation.toTestString())
      .join(',')}`;
  }

  /**
   * `toStruct` returns the structure of this change.
   */
  public toStruct(): ChangeStruct<P> {
    return {
      changeID: converter.bytesToHex(
        converter.toChangeID(this.getID()).toBinary(),
      ),
      message: this.getMessage(),
      operations: this.getOperations().map((op) =>
        converter.bytesToHex(converter.toOperation(op).toBinary()),
      ),
      presenceChange: this.getPresenceChange(),
    };
  }

  /**
   * `fromStruct` creates a instance of Change from the struct.
   */
  public static fromStruct<P extends Indexable>(
    struct: ChangeStruct<P>,
  ): Change<P> {
    const { changeID, operations, presenceChange, message } = struct;
    return Change.create<P>({
      id: converter.bytesToChangeID(converter.hexToBytes(changeID)),
      operations: operations?.map((op) => {
        return converter.bytesToOperation(converter.hexToBytes(op));
      }),
      presenceChange: presenceChange as any,
      message,
    });
  }
}
