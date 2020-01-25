import { TimeTicket } from '../time/ticket';

/**
 * JSONElement represents JSON element including logical clock.
 */
export abstract class JSONElement {
  private createdAt: TimeTicket;
  private deletedAt: TimeTicket;

  constructor(createdAt: TimeTicket) {
    this.createdAt = createdAt;
  }

  public getCreatedAt(): TimeTicket {
    return this.createdAt;
  }

  public getDeletedAt(): TimeTicket {
    return this.deletedAt;
  }

  public delete(deletedAt: TimeTicket): void {
    this.deletedAt = deletedAt;
  }

  public isDeleted(): boolean {
    return !!this.deletedAt;
  }

  abstract toJSON(): string;
  abstract deepcopy(): JSONElement;
}

export abstract class JSONContainer extends JSONElement {
  constructor(createdAt: TimeTicket) {
    super(createdAt);
  }

  abstract getDescendants(): IterableIterator<JSONElement>;
}
