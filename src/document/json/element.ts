import { TimeTicket } from '../time/ticket';

export abstract class JSONElement {
  private createdAt: TimeTicket;

  constructor(createdAt: TimeTicket) {
    this.createdAt = createdAt;
  }

  public getCreatedAt(): TimeTicket {
    return this.createdAt;
  }

  abstract toJSON(): string;
}
