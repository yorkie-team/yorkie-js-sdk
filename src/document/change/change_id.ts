import Long from 'long';
import { ActorID, InitialActorID, TimeTicket } from '../time/ticket';

export class ChangeID {
  private clientSeq: number;
  private lamport: Long;
  private actor: ActorID;

  constructor(clientSeq: number, lamport: Long, actor?: ActorID) {
    this.clientSeq = clientSeq;
    this.lamport = lamport;
    this.actor = typeof actor !== 'undefined' ? actor : null;
  }

  public static create(): ChangeID {
    return new ChangeID(0, Long.MIN_VALUE);
  }

  public next(): ChangeID {
    return new ChangeID(this.clientSeq + 1, this.lamport.add(1), this.actor);
  }

  public createTimeTicket(delimiter: number): TimeTicket {
    return TimeTicket.create(this.lamport, delimiter, this.actor);
  }
}

export const InitialChangeID = new ChangeID(0, Long.MIN_VALUE, InitialActorID);
