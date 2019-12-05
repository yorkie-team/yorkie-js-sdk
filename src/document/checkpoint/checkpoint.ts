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

  public static of(serverSeq: Long, clientSeq: number): Checkpoint {
    return new Checkpoint(serverSeq, clientSeq);
  }

  public increaseClientSeq(inc: number): Checkpoint {
    if (inc === 0) {
      return this;
    }

    return new Checkpoint(this.serverSeq, this.clientSeq + inc);
  }

  public forward(other: Checkpoint): Checkpoint {
    if (this.clientSeq == other.clientSeq &&
      this.serverSeq.equals(other.serverSeq)) {
      return this;
    }

    const serverSeq = this.serverSeq.greaterThan(other.serverSeq)
      ? this.serverSeq : other.serverSeq;
    const clientSeq = Math.max(this.clientSeq, other.clientSeq);
    return Checkpoint.of(serverSeq, clientSeq)
  }

  public getServerSeqAsString(): string {
    return this.serverSeq.toString();
  }

  public getClientSeq(): number {
    return this.clientSeq;
  }

  public equals(other: Checkpoint): boolean {
    return this.clientSeq === other.clientSeq &&
      this.serverSeq.equals(other.serverSeq);
  }
}

export const InitialCheckpoint = new Checkpoint(Long.fromInt(0, true), 0);
