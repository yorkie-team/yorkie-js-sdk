import { ActorID } from '../document/time/actor_id';
import { Observer, Observable, createObservable, Unsubscribe } from '../util/observable';
import {
  ActivateClientRequest, DeactivateClientRequest,
  AttachDocumentRequest, DetachDocumentRequest,
  PushPullRequest,
  WatchDocumentsRequest
} from '../api/yorkie_pb';
import { converter } from '../api/converter'
import { YorkieClient } from '../api/yorkie_grpc_web_pb';
import { Code, YorkieError } from '../util/error';
import { logger } from '../util/logger';
import { uuid } from '../util/uuid';
import { Document } from '../document/document';

export enum ClientStatus {
  Deactivated = 0,
  Activated = 1
}

enum ClientEventType {
  StatusChanged = 'status-changed',
  DocumentsChanged = 'documents-changed',
}

interface ClientEvent {
  name: ClientEventType;
  value: any;
}

/**
 * Client is a normal client that can communicate with the agent.
 * It has documents and sends changes of the documents in local
 * to the agent to synchronize with other replicas in remote.
 */
export class Client implements Observable<ClientEvent> {
  private client: YorkieClient;
  private id: ActorID;
  private key: string;
  private status: ClientStatus;
  private attachedDocumentMap: Map<string, Document>;
  private inSyncing: boolean;
  private eventStream: Observable<ClientEvent>;
  private eventStreamObserver: Observer<ClientEvent>;

  constructor(rpcAddr: string, key?: string) {
    this.client = new YorkieClient(rpcAddr, null, null);
    this.key = key ? key : uuid();
    this.status = ClientStatus.Deactivated;
    this.attachedDocumentMap = new Map();
    this.eventStream = createObservable<ClientEvent>((observer) => {
      this.eventStreamObserver = observer;
    });
  }

  /**
   * ativate activates this client. That is, it register itself to the agent
   * and receives a unique ID from the agent. The given ID is used to distinguish
   * different clients.
   */
  public activate(): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = new ActivateClientRequest();
      req.setClientKey(this.key);

      this.client.activateClient(req, {}, (err, res) => {
        if (err) {
          reject(err);
          return;
        }
        
        logger.info(`[AC] c:"${this.getKey()}" activated, id:"${res.getClientId()}"`)
        this.id = res.getClientId();
        this.status = ClientStatus.Activated;
        this.eventStreamObserver.next({
          name: ClientEventType.StatusChanged,
          value: this.status
        });

        resolve();
      });
    });
  }

  /**
   * deactivate deactivates this client.
   */
  public deactivate(): Promise<void> {
    if (this.status === ClientStatus.Deactivated) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const req = new DeactivateClientRequest();
      req.setClientId(this.id);

      this.client.deactivateClient(req, {}, (err, res) => {
        if (err) {
          reject(err);
          return;
        }
        
        logger.info(`[DC] c"${this.getKey()}" deactivated`)
        this.status = ClientStatus.Deactivated;
        this.eventStreamObserver.next({
          name: ClientEventType.StatusChanged,
          value: this.status
        });

        resolve();
      });
    });
  }

  /**
   * attach attaches the given document to this client. It tells the agent that
   * this client will synchronize the given document.
   */
  public attach(doc: Document): Promise<Document> {
    if (this.status !== ClientStatus.Activated) {
      throw new YorkieError(Code.ClientNotActive, `${this.key} is not active`);
    }

    doc.setActor(this.id);

    return new Promise((resolve, reject) => {
      const req = new AttachDocumentRequest();
      req.setClientId(this.id);
      req.setChangePack(converter.toChangePack(doc.flushChangePack()));

      this.client.attachDocument(req, {}, (err, res) => {
        if (err) {
          reject(err);
          return;
        }

        logger.info(`[AD] c:"${this.getKey()}" attaches d:"${doc.getKey().toIDString()}"`)

        const pack = converter.fromChangePack(res.getChangePack());
        doc.applyChangePack(pack);

        this.attachedDocumentMap.set(doc.getKey().toIDString(), doc);
        resolve(doc);
      });
    });
  }

  /**
   * detach dettaches the given document from this client. It tells the
   * agent that this client will no longer synchronize the given document.
   *
   * To collect garbage things like CRDT tombstones left on the document, all the
   * changes should be applied to other replicas before GC time. For this, if the
   * document is no longer used by this client, it should be detached.
   */
  public detach(doc: Document): Promise<Document> {
    return new Promise((resolve, reject) => {
      const req = new DetachDocumentRequest();
      req.setClientId(this.id);
      req.setChangePack(converter.toChangePack(doc.flushChangePack()));

      this.client.detachDocument(req, {}, (err, res) => {
        if (err) {
          reject(err);
          return;
        }

        logger.info(`[DD] c:"${this.getKey()}" detaches d:"${doc.getKey().toIDString()}"`)

        const pack = converter.fromChangePack(res.getChangePack());
        doc.applyChangePack(pack);
       
        this.attachedDocumentMap.delete(doc.getKey().toIDString());
        resolve(doc);
      });
    });
  }

  /**
   * sync pushes local changes of the attached documents to the Agent and
   * receives changes of the remote replica from the agent then apply them to
   * local documents.
   */
  public sync(): Promise<Document[]> {
    // TODO: Defense code to prevent synchronization at the same time.
    //  - We need to consider to avoid this with a logic such as debounce later.
    if (this.inSyncing) {
      return Promise.resolve([]);
    }
    this.inSyncing = true;

    const promises = [];
    for (const [key, doc] of this.attachedDocumentMap) {
      promises.push(new Promise((resolve, reject) => {

        const req = new PushPullRequest();
        req.setClientId(this.id);
        req.setChangePack(converter.toChangePack(doc.flushChangePack()));

        this.client.pushPull(req, {}, (err, res) => {
          if (err) {
            reject(err);
            return;
          }

          logger.info(`[PP] c:"${this.getKey()}" sync d:"${doc.getKey().getDocument()}"`)

          const pack = converter.fromChangePack(res.getChangePack());
          doc.applyChangePack(pack);

          resolve(doc);
        });
      }))
    }

    return Promise.all(promises).then((docs) => {
      this.inSyncing = false;
      return docs;
    });
  }

  // TODO replace target with key pattern, not a document.
  public watch(doc: Document): Promise<Document> {
    if (this.status !== ClientStatus.Activated) {
      throw new YorkieError(Code.ClientNotActive, `${this.key} is not active`);
    }

    return new Promise((resolve, reject) => {
      const req = new WatchDocumentsRequest();
      req.setClientId(this.id);
      req.setDocumentKeysList(converter.toDocumentKeys([doc.getKey()]));

      const stream = this.client.watchDocuments(req, {});
      stream.on('data', (response) => {
        const keys = converter.fromDocumentKeys(response.getDocumentKeysList());
        this.eventStreamObserver.next({
          name: ClientEventType.DocumentsChanged,
          value: keys,
        });
      });
      stream.on('status', (status) => {
        console.log(status.code);
        console.log(status.details);
        console.log(status.metadata);
      });
      stream.on('end', (end) => {
        console.log(end);
        // stream end signal
      });

      logger.info(`[WD] "${this.getKey()}", "${doc.getKey().toIDString()}"`)
      resolve(doc);
    });
  }

  public subscribe(nextOrObserver, error?, complete?): Unsubscribe {
    return this.eventStream.subscribe(nextOrObserver, error, complete);
  }

  public getID(): string {
    return this.id;
  }

  public getKey(): string {
    return this.key;
  }

  public isActive(): boolean {
    return this.status === ClientStatus.Activated;
  }
}

