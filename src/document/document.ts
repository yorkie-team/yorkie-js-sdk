import { logger, LogLevel } from '../util/logger';
import { Observer, Observable, createObservable, Unsubscribe } from '../util/observable';
import { ActorID } from './time/actor_id';
import { DocumentKey } from './key/document_key';
import { Change } from './change/change';
import { ChangeID, InitialChangeID } from './change/change_id';
import { ChangeContext } from './change/context';
import { ChangePack } from './change/change_pack';
import { JSONRoot } from './json/root';
import { JSONObject } from './json/object';
import { createProxy } from './proxy/proxy';
import { Checkpoint, InitialCheckpoint } from  './checkpoint/checkpoint';

export enum DocEventType {
  LocalChange = 'local-change',
  RemoteChange = 'remote-change',
}

interface DocEvent {
  name: DocEventType;
  value: any;
}

/**
 * Document represents a document in MongoDB and contains logical clocks.
 */
export class Document implements Observable<DocEvent> {
  private key: DocumentKey;
  private root: JSONRoot;
  private clone: JSONRoot;
  private changeID: ChangeID;
  private checkpoint: Checkpoint;
  private changes: Change[];
  private eventStream: Observable<DocEvent>;
  private eventStreamObserver: Observer<DocEvent>;

  constructor(collection: string, document: string) {
    this.key = DocumentKey.of(collection, document);
    this.root = JSONRoot.create();
    this.changeID = InitialChangeID;
    this.checkpoint = InitialCheckpoint;
    this.changes = [];
    this.eventStream = createObservable<DocEvent>((observer) => {
      this.eventStreamObserver = observer;
    });
  }

  /**
   * create creates a new instance of Document.
   */
  public static create(collection: string, document: string): Document {
    return new Document(collection, document);
  }

  /**
   * update executes the given updater to update this document.
   */
  public update(updater: (root: JSONObject) => void, message?: string): void {
    this.ensureClone();
    const context = ChangeContext.create(
      this.changeID.next(),
      message,
      this.clone
    );

    try {
      const proxy = createProxy(context, this.clone.getObject());
      updater(proxy)
    } catch (err) {
      // drop clone because it is contaminated.
      this.clone = null;
      logger.error(err);
      throw err;
    }

    if (context.hasOperations()) {
      if (logger.isEnabled(LogLevel.Trivial)) {
        logger.trivial(`trying to update a local change: ${this.toJSON()}`);
      }

      const change = context.getChange();
      change.execute(this.root);
      this.changes.push(change);
      this.changeID = change.getID();

      if (this.eventStreamObserver) {
        this.eventStreamObserver.next({
          name: DocEventType.LocalChange,
          value: [change]
        });
      }

      if (logger.isEnabled(LogLevel.Trivial)) {
        logger.trivial(`after update a local change: ${this.toJSON()}`);
      }
    }
  }

  public subscribe(nextOrObserver, error?, complete?): Unsubscribe {
    return this.eventStream.subscribe(nextOrObserver, error, complete);
  }

  /**
   * applyChangePack applies the given change pack into this document.
   */
  public applyChangePack(pack: ChangePack): void {
    if (!pack.hasChanges()) {
      return;
    }

    logger.debug(`trying to apply ${pack.getChanges().length} remote changes`);

    const changes = pack.getChanges();
    if (logger.isEnabled(LogLevel.Trivial)) {
      logger.trivial(changes.map((change) =>
        `${change.getID().getAnnotatedString()}\t${change.getAnnotatedString()}`
      ).join('\n'));
    }

    this.ensureClone();
    for (const change of changes) {
      change.execute(this.clone);
    }

    for (const change of changes) {
      change.execute(this.root);
      this.changeID = this.changeID.sync(change.getID());
    }
    this.checkpoint = this.checkpoint.forward(pack.getCheckpoint());

    if (changes.length && this.eventStreamObserver) {
      this.eventStreamObserver.next({
        name: DocEventType.RemoteChange,
        value: changes
      });
    }

    logger.debug(`after apply ${changes.length} remote changes`)
    if (logger.isEnabled(LogLevel.Trivial)) {
      logger.trivial(`${this.getRootObject().toJSON()}`);
    }
  }

  public getCheckpoint(): Checkpoint {
    return this.checkpoint;
  }

  public hasLocalChanges(): boolean {
    return this.changes.length > 0;
  }

  public ensureClone(): void {
    if (this.clone) {
      return;
    }

    this.clone = this.root.deepcopy();
  }

  /**
   * flushChangePack flushes the local change pack to send to the remote server.
   */
  public flushChangePack(): ChangePack {
    const changes = this.changes;
    this.changes = [];

    const checkpoint = this.checkpoint.increaseClientSeq(changes.length);
    return ChangePack.create(this.key, checkpoint, changes);
  }

  /**
   * setActor sets actor into this document. This is also applied in the local
   * changes the document has.
   */
  public setActor(actorID: ActorID): void {
    for (const change of this.changes) {
      change.setActor(actorID);
    }
    this.changeID = this.changeID.setActor(actorID);

    // TODO also apply into root.
  }

  public getKey(): DocumentKey {
    return this.key;
  }

  public getRootObject(): JSONObject {
    return this.root.getObject();
  }

  public toJSON(): string {
    return this.root.toJSON();
  }
}
