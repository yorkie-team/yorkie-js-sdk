import Long from 'long';

import { logger, LogLevel } from '../../util/logger';
import { ActorID } from '../time/actor_id';
import { Operation } from '../operation/operation';
import { JSONRoot } from '../json/root';
import { ChangeID } from './change_id';

/**
 * Change represents a unit of modification in the document.
 */
export class Change {
  private id: ChangeID;

  // message is used to save a description of the change.
  private message: string;

  // operations represent a series of user edits.
  private operations: Operation[];

  // serverSeq is optional and only present for changes stored on the server.
  private serverSeq: Long;

  constructor(id: ChangeID, message: string, operations: Operation[]) {
    this.id = id;
    this.message = message;
    this.operations = operations;
  }

  public static create(id: ChangeID, message: string, operations: Operation[]): Change {
    return new Change(id, message, operations);
  }

  public getID(): ChangeID {
    return this.id;
  }

  public getMessage(): string {
    return this.message;
  }

  public getOperations(): Operation[] {
    return this.operations;
  }

  public setActor(actorID: ActorID): void {
    for (const operation of this.operations) {
      operation.setActor(actorID);
    }

    this.id = this.id.setActor(actorID);
  }

  public execute(root: JSONRoot): void {
    for (const operation of this.operations) {
      operation.execute(root);
    }
  }

  public getAnnotatedString(): string {
    return `${this.operations.map((operation) => operation.getAnnotatedString()).join(',')}`;
  }
}
