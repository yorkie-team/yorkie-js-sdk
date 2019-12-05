import { DocumentKey } from '../key/document_key';
import { Checkpoint } from '../checkpoint/checkpoint';
import { Change } from './change';

export class ChangePack {
  private key: DocumentKey;
  private checkpoint: Checkpoint;
  private changes: Change[];

  constructor(key: DocumentKey, checkpoint: Checkpoint, changes: Change[]) {
    this.key = key;
    this.checkpoint = checkpoint;
    this.changes = changes;
  }

  public static create(
    key: DocumentKey,
    checkpoint: Checkpoint,
    changes: Change[],
  ): ChangePack {
    return new ChangePack(
      key,
      checkpoint,
      changes
    );
  }

  public getKey(): DocumentKey {
    return this.key;
  }

  public getCheckpoint(): Checkpoint {
    return this.checkpoint;
  }

  public getChanges(): Change[] {
    return this.changes;
  }
}
