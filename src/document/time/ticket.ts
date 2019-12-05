import Long from 'long';
import { ActorID, InitialActorID } from './actor_id';

export class TimeTicket {
  private lamport: Long;
  private delimiter: number;
  private actorID: ActorID;

  constructor(lamport: Long, delimiter: number, actorID: string) {
    this.lamport = lamport;
    this.delimiter = delimiter;
    this.actorID = actorID;
  }

  public static create(lamport: Long, delimiter: number, actorID: string): TimeTicket {
    return new TimeTicket(lamport, delimiter, actorID);
  }

  public toIDString(): string {
    if (this.actorID == null) {
      return `${this.lamport.toString()}:${this.delimiter}:nil`;
    }
    return `${this.lamport.toString()}:${this.delimiter}:${this.actorID}`;
  }

  public setActor(actorID: ActorID): TimeTicket {
    return new TimeTicket(this.lamport, this.delimiter, actorID);
  }

  public getLamportAsString(): string {
    return this.lamport.toString();
  }

  public getDelimiter(): number {
    return this.delimiter;
  }

  public getActorID(): string {
    return this.actorID;
  }
}

export const InitialDelimiter = 0;
export const InitialTimeTicket = new TimeTicket(Long.fromNumber(0, true), InitialDelimiter, InitialActorID);
