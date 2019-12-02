import Long from 'long';

export type ActorID = string;

export class TimeTicket {
  private lamport: Long;
  private delemiter: number;
  private actorID: ActorID;
}
