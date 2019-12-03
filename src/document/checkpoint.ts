import Long from 'long';

export class Checkpoint {
  private serverSeq: Long;
  private clientSeq: number;

  constructor(serverSeq: Long, clientSeq: number) {
    this.serverSeq = serverSeq;
    this.clientSeq = clientSeq;
  }

  public static create(): Checkpoint {
    return InitialCheckpoint;
  }


  public equals(other: Checkpoint): boolean {
    return this.clientSeq === other.clientSeq &&
      this.serverSeq.equals(other.serverSeq);
  }
}

export const InitialCheckpoint = new Checkpoint(Long.MIN_VALUE, 0);
