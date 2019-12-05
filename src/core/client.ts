import {
  ActivateClientRequest, DeactivateClientRequest,
  AttachDocumentRequest, DetachDocumentRequest,
  PushPullRequest
} from '../api/yorkie_pb';
import { converter } from '../api/converter'
import { YorkieClient } from '../api/yorkie_grpc_web_pb';
import { Code, YorkieError } from '../util/error';
import { uuid } from '../util/uuid';
import { Document } from '../document/document';

export enum ClientStatus {
  Deactivated = 0,
  Activated = 1
}

export class Client {
  private client: YorkieClient;
  private id: string;
  private key: string;
  private status: ClientStatus;
  private attachedDocumentMap: Map<string, Document>;

  constructor(rpcAddr: string, key?: string) {
    this.client = new YorkieClient(rpcAddr, null, null);
    this.key = key ? key : uuid();
    this.status = ClientStatus.Deactivated;
    this.attachedDocumentMap = new Map();
  }

  public activate(): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = new ActivateClientRequest();
      req.setClientKey(this.key);

      this.client.activateClient(req, {}, (err, res) => {
        if (err) {
          reject(err);
          return;
        }
        
        this.id = res.getClientId();
        this.status = ClientStatus.Activated;
        resolve();
      });
    });
  }

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
        
        this.status = ClientStatus.Deactivated;
        resolve();
      });
    });
  }

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

        const pack = converter.fromChangePack(res.getChangePack());
        doc.applyChangePack(pack);

        this.attachedDocumentMap.set(doc.getKey().toIDString(), doc);
        resolve(doc);
      });
    });
  }

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

        const pack = converter.fromChangePack(res.getChangePack());
        doc.applyChangePack(pack);
       
        this.attachedDocumentMap.delete(doc.getKey().toIDString());
        resolve(doc);
      });
    });
  }

  public pushPull(): Promise<Document[]> {
    const promises = [];
    for (const [key, doc] of this.attachedDocumentMap) {
      promises.push(new Promise((resolve, reject) => {

        const req = new PushPullRequest();
        req.setClientId(this.id);
        req.setChangePack(converter.toChangePack(doc.flushChangePack()));

        this.client.detachDocument(req, {}, (err, res) => {
          if (err) {
            reject(err);
            return;
          }

          this.status = ClientStatus.Deactivated;
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

