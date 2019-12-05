import Long from 'long';
import { ActorID } from '../time/actor_id';
import { Operation } from '../operation/operation';
import { JSONRoot } from '../json/root';
import { ChangeID } from './change_id';

export class Change {
  private id: ChangeID;
  private message: string;
  private operations: Operation[];
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
    for (var operation of this.operations) {
      operation.execute(root);
    }
  }
}
