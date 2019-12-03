import Long from 'long';

export type ActorID = string;

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
}

export const InitialDelimiter = -0x80000000;
export const InitialActorID = "000000000000";
export const InitialTimeTicket = new TimeTicket(Long.fromNumber(0, true), InitialDelimiter, InitialActorID);
