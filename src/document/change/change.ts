import Long from 'long';
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

  public execute(root: JSONRoot) {
    for (var operation of this.operations) {
      operation.execute(root);
    }
  }
}
