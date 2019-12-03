import { TimeTicket } from '../time/ticket';
import { JSONRoot } from '../json/root';

export abstract class Operation {
  private parentCreatedAt: TimeTicket;
  private executedAt: TimeTicket;

  constructor(parentCreatedAt: TimeTicket, executedAt: TimeTicket) {
    this.parentCreatedAt = parentCreatedAt;
    this.executedAt = executedAt;
  }

  public getParentCreatedAt(): TimeTicket {
    return this.parentCreatedAt;
  }

  public getExecutedAt(): TimeTicket {
    return this.executedAt;
  }

  public abstract execute(root: JSONRoot): void;
}
