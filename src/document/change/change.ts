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
  Operation,
  OperationInfo,
} from '@yorkie-js-sdk/src/document/operation/operation';
import { CRDTRoot } from '@yorkie-js-sdk/src/document/crdt/root';
import { ChangeID } from '@yorkie-js-sdk/src/document/change/change_id';
import { Indexable } from '@yorkie-js-sdk/src/document/document';

/**
 * `Change` represents a unit of modification in the document.
 */
export class Change<P extends Indexable> {
  private id: ChangeID;

  // `operations` represent a series of user edits.
  private operations: Array<Operation>;

  // `presence` represent the updated presence.
  private presence: P | undefined;

  // `message` is used to save a description of the change.
  private message?: string;

  constructor({
    id,
    operations,
    presence,
    message,
  }: {
    id: ChangeID;
    operations?: Array<Operation>;
    presence?: P;
    message?: string;
  }) {
    this.id = id;
    this.operations = operations || [];
    this.presence = presence;
    this.message = message;
  }

  /**
   * `create` creates a new instance of Change.
   */
  public static create<P extends Indexable>({
    id,
    operations,
    presence,
    message,
  }: {
    id: ChangeID;
    operations?: Array<Operation>;
    presence?: P;
    message?: string;
  }): Change<P> {
    return new Change<P>({ id, operations, presence, message });
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
   * `hasPresence` returns whether this change has presence or not.
   */
  public hasPresence(): boolean {
    return this.presence !== undefined;
  }

  /**
   * `getPresence` returns the updated presence of this change.
   */
  public getPresence(): P | undefined {
    return this.presence;
  }

  /**
   * `execute` executes the operations of this change to the given root.
   */
  public execute(root: CRDTRoot): Array<OperationInfo> {
    const opInfos: Array<OperationInfo> = [];
    for (const operation of this.operations) {
      const infos = operation.execute(root);
      opInfos.push(...infos);
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
