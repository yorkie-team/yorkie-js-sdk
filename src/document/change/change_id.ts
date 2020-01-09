import Long from 'long';
import { ActorID, InitialActorID } from '../time/actor_id';
import { TimeTicket } from '../time/ticket';

/**
 * ChangeID is for identifying the Change. This is immutable.
 **/
export class ChangeID {
  private clientSeq: number;
  private lamport: Long;
  private actor: ActorID;

  constructor(clientSeq: number, lamport: Long, actor?: ActorID) {
    this.clientSeq = clientSeq;
    this.lamport = lamport;
    this.actor = typeof actor !== 'undefined' ? actor : null;
  }

  public static of(clientSeq: number, lamport: Long, actor?: ActorID): ChangeID {
    return new ChangeID(clientSeq, lamport, actor);
  }

  public next(): ChangeID {
    return new ChangeID(this.clientSeq + 1, this.lamport.add(1), this.actor);
  }

  public sync(other: ChangeID): ChangeID {
    if (other.lamport.greaterThan(this.lamport)) {
      return new ChangeID(this.clientSeq, other.lamport, this.actor)
    }

    return new ChangeID(this.clientSeq, this.lamport.add(1), this.actor);
  }

  public createTimeTicket(delimiter: number): TimeTicket {
    return TimeTicket.of(this.lamport, delimiter, this.actor);
  }

  public setActor(actorID: ActorID): ChangeID {
    return new ChangeID(this.clientSeq, this.lamport, actorID);
  }

  public getClientSeq(): number {
    return this.clientSeq;
  }

  public getLamportAsString(): string {
    return this.lamport.toString();
  }

  public getActorID(): string {
    return this.actor;
  }

  public getAnnotatedString(): string {
    if (this.actor == null) {
      return `${this.lamport.toString()}:nil:${this.clientSeq}`;
    }
    return `${this.lamport.toString()}:${this.actor.substring(22, 24)}:${this.clientSeq}`;
  }
}

export const InitialChangeID = new ChangeID(0, Long.fromInt(0, true), InitialActorID);
