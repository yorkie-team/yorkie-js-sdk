import { TimeTicket, InitialDelimiter } from '../time/ticket';
import { Operation } from '../operation/operation';
import { ChangeID } from './change_id';
import { Change } from './change';

export class ChangeContext {
  private id: ChangeID;
  private message: string;
  private operations: Operation[];
  private delimiter: number;

  constructor(id: ChangeID, message?: string) {
    this.id = id;
    this.message = message;
    this.operations = [];
    this.delimiter = InitialDelimiter;
  }

  public static create(id: ChangeID, message: string): ChangeContext {
    return new ChangeContext(id, message);
  }

  public push(operation: Operation): void {
    this.operations.push(operation);
  }

  public getChange(): Change {
    return Change.create(this.id, this.message, this.operations);
  }

  public hasOperations(): boolean {
    return this.operations.length > 0; 
  }

  public issueTimeTicket(): TimeTicket {
    this.delimiter += 1;
    return this.id.createTimeTicket(this.delimiter);
  }
}
