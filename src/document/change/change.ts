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

import Long from 'long';

import { ActorID } from '../time/actor_id';
import { Operation } from '../operation/operation';
import { JSONRoot } from '../json/root';
import { ChangeID } from './change_id';

/**
 * Change represents a unit of modification in the document.
 */
export class Change {
  private id: ChangeID;

  // operations represent a series of user edits.
  private operations: Operation[];

  // message is used to save a description of the change.
  private message?: string;

  // serverSeq is optional and only present for changes stored on the server.
  private serverSeq?: Long;

  constructor(id: ChangeID, operations: Operation[], message?: string) {
    this.id = id;
    this.operations = operations;
    this.message = message;
  }

  /**
   * create creates a new instance of Change.
   */
  public static create(
    id: ChangeID,
    operations: Operation[],
    message?: string,
  ): Change {
    return new Change(id, operations, message);
  }

  /**
   * getID returns the ID of this change.
   */
  public getID(): ChangeID {
    return this.id;
  }

  /**
   * getMessage returns the message of this change.
   */
  public getMessage(): string | undefined {
    return this.message;
  }

  /**
   * Operations returns the operations of this change.
   */
  public getOperations(): Operation[] {
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
   * execute executes the operations of this change to the given root.
   */
  public execute(root: JSONRoot): void {
    for (const operation of this.operations) {
      operation.execute(root);
    }
  }

  /**
   * getAnnotatedString returns a string containing the meta data of this change.
   */
  public getAnnotatedString(): string {
    return `${this.operations
      .map((operation) => operation.getAnnotatedString())
      .join(',')}`;
  }
}
