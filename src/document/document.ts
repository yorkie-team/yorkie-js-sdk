import { logger } from '../util/logger';
import { Change } from './change/change';
import { ChangeID } from './change/change_id';
import { ChangeContext } from './change/context';
import { JSONRoot } from './json/root';
import { JSONObject } from './json/object';
import { createProxy } from './proxy/proxy';
import { Checkpoint } from  './checkpoint';

export class DocumentKey {
  private collection: string;
  private document: string;

  constructor(collection: string, document: string) {
    this.collection = collection;
    this.document = document;
  }

  public static of(collection: string, document: string): DocumentKey {
    return new DocumentKey(collection, document);
  }
}

export class Document {
  private key: DocumentKey;
  private root: JSONRoot;
  private copy: JSONObject;
  private changeID: ChangeID;
  private checkpoint: Checkpoint;
  private changes: Change[];

  constructor(collection: string, document: string) {
    this.key = DocumentKey.of(collection, document);
    this.root = JSONRoot.create();
    this.changeID = ChangeID.create();
    this.checkpoint = Checkpoint.create();
    this.changes = [];
  }

  public static create(collection: string, document: string): Document {
    return new Document(collection, document);
  }

  public update(updater: (root: JSONObject) => void, message?: string): void {
    if (!this.copy) {
      this.copy = this.root.getObject().deepcopy();
    }

    const context = ChangeContext.create(this.changeID.next(), message);
    try {
      const proxy = createProxy(context, this.copy);
      updater(proxy)
    } catch (err) {
      // drop copy because it is contaminated.
      this.copy = null;
      logger.error(err);
      throw err;
    }

    if (context.hasOperations()) {
      const change = context.getChange();
      change.execute(this.root);
      this.changes.push(change);
      this.changeID = change.getID();
    }
  }

  public getCheckpoint(): Checkpoint {
    return this.checkpoint;
  }

  public hasLocalChanges(): boolean {
    return this.changes.length > 0;
  }

  public toJSON(): string {
    return this.root.toJSON();
  }
}
