import { TimeTicket, InitialDelimiter } from '../time/ticket';
import { JSONRoot } from '../json/root';
import { JSONElement } from '../json/element';
import { Operation } from '../operation/operation';
import { ChangeID } from './change_id';
import { Change } from './change';

/**
 * ChangeContext is used to record the context of modification when editing
 * a document. Each time we add an operation, a new time ticket is issued.
 * Finally returns a Change after the modification has been completed.
 */
export class ChangeContext {
  private id: ChangeID;
  private root: JSONRoot;
  private message: string;
  private operations: Operation[];
  private delimiter: number;

  constructor(id: ChangeID, message: string, root: JSONRoot) {
    this.id = id;
    this.root = root;
    this.message = message;
    this.operations = [];
    this.delimiter = InitialDelimiter;
  }

  /**
   * create creates a new instance of ChangeContext.
   */
  public static create(
    id: ChangeID,
    message: string,
    root: JSONRoot
  ): ChangeContext {
    return new ChangeContext(id, message, root);
  }

  public push(operation: Operation): void {
    this.operations.push(operation);
  }

  public registerElement(element: JSONElement): void {
    this.root.registerElement(element);
  }

  public getChange(): Change {
    return Change.create(this.id, this.message, this.operations);
  }

  public hasOperations(): boolean {
    return this.operations.length > 0; 
  }

  /**
   * issueTimeTicket creates a time ticket to be used to create a new operation.
   */
  public issueTimeTicket(): TimeTicket {
    this.delimiter += 1;
    return this.id.createTimeTicket(this.delimiter);
  }
}
