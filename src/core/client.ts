/*
 * Copyright 2020 The Yorkie Authors. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

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
import { Document, DocEventType } from '../document/document';

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

interface Attachment {
  doc: Document;
  isRealtimeSync: boolean;
  remoteChangeEventReceved?: boolean;
}

export interface ClientOptions {
  key?: string;
  syncLoopDuration: number;
  reconnectStreamDelay: number;
}

const DefaultClientOptions: ClientOptions = {
  syncLoopDuration: 50,
  reconnectStreamDelay: 1000
};

/**
 * Client is a normal client that can communicate with the agent.
 * It has documents and sends changes of the documents in local
 * to the agent to synchronize with other replicas in remote.
 */
export class Client implements Observable<ClientEvent> {
  private id: ActorID;
  private key: string;
  private status: ClientStatus;
  private attachmentMap: Map<string, Attachment>;
  private syncLoopDuration: number;
  private reconnectStreamDelay: number;

  private client: YorkieClient;
  private watchLoopTimerID: ReturnType<typeof setTimeout>;
  private remoteChangeEventStream: any;
  private eventStream: Observable<ClientEvent>;
  private eventStreamObserver: Observer<ClientEvent>;

  constructor(rpcAddr: string, opts?: ClientOptions) {
    opts = opts || DefaultClientOptions;

    this.key = opts.key ? opts.key : uuid();
    this.status = ClientStatus.Deactivated;
    this.attachmentMap = new Map();
    this.syncLoopDuration = opts.syncLoopDuration;
    this.reconnectStreamDelay = opts.reconnectStreamDelay;

    this.client = new YorkieClient(rpcAddr, null, null);
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
    if (this.isActive()) {
      return Promise.resolve();
    }

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
        this.runSyncLoop();
        this.runWatchLoop();

        this.eventStreamObserver.next({
          name: ClientEventType.StatusChanged,
          value: this.status
        });

        logger.info(`[AC] c:"${this.getKey()}" activated, id:"${res.getClientId()}"`)
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

    if (this.remoteChangeEventStream) {
      this.remoteChangeEventStream.cancel();
      this.remoteChangeEventStream = null;
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
        this.eventStreamObserver.next({
          name: ClientEventType.StatusChanged,
          value: this.status
        });

        logger.info(`[DC] c"${this.getKey()}" deactivated`)
        resolve();
      });
    });
  }

  /**
   * attach attaches the given document to this client. It tells the agent that
   * this client will synchronize the given document.
   */
  public attach(doc: Document, isManualSync?: boolean): Promise<Document> {
    if (!this.isActive()) {
      throw new YorkieError(Code.ClientNotActive, `${this.key} is not active`);
    }

    doc.setActor(this.id);

    return new Promise((resolve, reject) => {
      const req = new AttachDocumentRequest();
      req.setClientId(this.id);
      req.setChangePack(converter.toChangePack(doc.createChangePack()));

      this.client.attachDocument(req, {}, (err, res) => {
        if (err) {
          reject(err);
          return;
        }

        const pack = converter.fromChangePack(res.getChangePack());
        doc.applyChangePack(pack);

        this.attachmentMap.set(doc.getKey().toIDString(), {
          doc: doc,
          isRealtimeSync: !isManualSync,
        });
        this.runWatchLoop();

        logger.info(`[AD] c:"${this.getKey()}" attaches d:"${doc.getKey().toIDString()}"`)
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
    if (!this.isActive()) {
      throw new YorkieError(Code.ClientNotActive, `${this.key} is not active`);
    }

    return new Promise((resolve, reject) => {
      const req = new DetachDocumentRequest();
      req.setClientId(this.id);
      req.setChangePack(converter.toChangePack(doc.createChangePack()));

      this.client.detachDocument(req, {}, (err, res) => {
        if (err) {
          reject(err);
          return;
        }

        const pack = converter.fromChangePack(res.getChangePack());
        doc.applyChangePack(pack);

        if (this.attachmentMap.has(doc.getKey().toIDString())) {
          this.attachmentMap.delete(doc.getKey().toIDString());
        }

        logger.info(`[DD] c:"${this.getKey()}" detaches d:"${doc.getKey().toIDString()}"`)
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
    for (const [key, attachment] of this.attachmentMap) {
      promises.push(this.syncInternal(attachment.doc));
    }

    return Promise.all(promises).then((docs) => {
      return docs;
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

  private runSyncLoop(): void {
    const doLoop = () => {
      if (!this.isActive()) {
        logger.debug(`[SL] c:"${this.getKey()}" exit sync loop`)
        return;
      }

      const promises = [];
      for (const [key, attachment] of this.attachmentMap) {
        if (attachment.isRealtimeSync &&
            (attachment.doc.hasLocalChanges() || attachment.remoteChangeEventReceved)) {
          attachment.remoteChangeEventReceved = false;
          promises.push(this.syncInternal(attachment.doc));
        }
      }

      Promise.all(promises).finally(() => {
        setTimeout(doLoop, this.syncLoopDuration);
      });
    };

    logger.debug(`[SL] c:"${this.getKey()}" run sync loop`)
    doLoop();
  }

  private runWatchLoop(): void {
    const doLoop = () => {
      if (!this.isActive()) {
        logger.debug(`[WL] c:"${this.getKey()}" exit watch loop`)
        return;
      }

      if (this.remoteChangeEventStream) {
        this.remoteChangeEventStream.cancel();
        this.remoteChangeEventStream = null;
      }

      if (this.watchLoopTimerID) {
        clearTimeout(this.watchLoopTimerID);
        this.watchLoopTimerID = null;
      }

      const keys = [];
      for (const [_, attachment] of this.attachmentMap) {
        if (attachment.isRealtimeSync) {
          keys.push(attachment.doc.getKey());
        }
      }

      if (!keys.length) {
        logger.debug(`[WL] c:"${this.getKey()}" exit watch loop`)
        return;
      }

      const req = new WatchDocumentsRequest();
      req.setClientId(this.id);
      req.setDocumentKeysList(converter.toDocumentKeys(keys));

      const stream = this.client.watchDocuments(req, {});
      stream.on('data', (response) => {
        const keys = converter.fromDocumentKeys(response.getDocumentKeysList());
        this.eventStreamObserver.next({
          name: ClientEventType.DocumentsChanged,
          value: keys,
        });

        for (const key of keys) {
          const attachment = this.attachmentMap.get(key.toIDString());
          attachment.remoteChangeEventReceved = true;
        }
      });
      stream.on('end', () => {
        // stream end signal
        this.remoteChangeEventStream = null;
        this.watchLoopTimerID = setTimeout(doLoop, this.reconnectStreamDelay);
      });
      this.remoteChangeEventStream = stream;

      logger.info(`[WD] c:"${this.getKey()}" watches d:"${keys.map(key => key.toIDString())}"`)
    };

    logger.debug(`[WL] c:"${this.getKey()}" run watch loop`)

    doLoop();
  }

  private syncInternal(doc: Document): Promise<Document> {
    return new Promise((resolve, reject) => {
      const req = new PushPullRequest();
      req.setClientId(this.id);
      const localChangePack = doc.createChangePack();
      const localSize = localChangePack.getChangeSize();
      req.setChangePack(converter.toChangePack(localChangePack));

      let isRejected = false;
      this.client.pushPull(req, {}, (err, res) => {
        if (err) {
          isRejected = true;
          reject(err);
          return;
        }

        const remoteChangePack = converter.fromChangePack(res.getChangePack());
        doc.applyChangePack(remoteChangePack);

        const docKey = doc.getKey().toIDString();
        const remoteSize = remoteChangePack.getChangeSize();
        logger.info(
          `[PP] c:"${this.getKey()}" sync d:"${docKey}", push:${localSize} pull:${remoteSize}`
        );
      }).on('end', () => {
        if (isRejected) {
          return;
        }
        resolve(doc);
      });
    });
  }
}
