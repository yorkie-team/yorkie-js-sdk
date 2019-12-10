import { TimeTicket } from '../time/ticket';

/**
 * JSONElement represents JSON element including logical clock.
 */
export abstract class JSONElement {
  private createdAt: TimeTicket;

  constructor(createdAt: TimeTicket) {
    this.createdAt = createdAt;
  }

  public getCreatedAt(): TimeTicket {
    return this.createdAt;
  }

  abstract toJSON(): string;
  abstract deepcopy(): JSONElement;
}
