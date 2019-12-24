import { ActorID } from '../document/time/actor_id';
import {
  ActivateClientRequest, DeactivateClientRequest,
  AttachDocumentRequest, DetachDocumentRequest,
  PushPullRequest
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

/**
 * Client is a normal client that can communicate with the agent.
 * It has documents and sends changes of the documents in local
 * to the agent to synchronize with other replicas in remote.
 */
export class Client {
  private client: YorkieClient;
  private id: ActorID;
  private key: string;
  private status: ClientStatus;
  private attachedDocumentMap: Map<string, Document>;

  constructor(rpcAddr: string, key?: string) {
    this.client = new YorkieClient(rpcAddr, null, null);
    this.key = key ? key : uuid();
    this.status = ClientStatus.Deactivated;
    this.attachedDocumentMap = new Map();
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
        
        logger.info(`AC: "${this.getKey()}" ${res.getClientId()}`)
        this.id = res.getClientId();
        this.status = ClientStatus.Activated;
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
        
        logger.info(`DC: "${this.getKey()}"`)
        this.status = ClientStatus.Deactivated;
        resolve();
      });
    });
  }

  /**
   * attachDocument attaches the given document to this client. It tells the agent that
   * this client will synchronize the given document.
   */
  public attachDocument(doc: Document): Promise<Document> {
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

        logger.info(`AD: "${this.getKey()}", "${doc.getKey().toIDString()}"`)

        const pack = converter.fromChangePack(res.getChangePack());
        doc.applyChangePack(pack);

        this.attachedDocumentMap.set(doc.getKey().toIDString(), doc);
        resolve(doc);
      });
    });
  }

  /**
   * detachDocument dettaches the given document from this client. It tells the
   * agent that this client will no longer synchronize the given document.
   *
   * To collect garbage things like CRDT tombstones left on the document, all the
   * changes should be applied to other replicas before GC time. For this, if the
   * document is no longer used by this client, it should be detached.
   */
  public detachDocument(doc: Document): Promise<Document> {
    return new Promise((resolve, reject) => {
      const req = new DetachDocumentRequest();
      req.setClientId(this.id);
      req.setChangePack(converter.toChangePack(doc.flushChangePack()));

      this.client.detachDocument(req, {}, (err, res) => {
        if (err) {
          reject(err);
          return;
        }

        logger.info(`DD: "${this.getKey()}", "${doc.getKey().toIDString()}"`)

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

          logger.info(`PP: "${this.getKey()}", "${doc.getKey().getDocument()}"`)

          const pack = converter.fromChangePack(res.getChangePack());
          doc.applyChangePack(pack);

          resolve(doc);
        });
      }))
    }

    return Promise.all(promises);
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

