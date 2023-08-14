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

import { ActorID } from '@yorkie-js-sdk/src/document/time/actor_id';
import {
  Observer,
  Observable,
  createObservable,
  Unsubscribe,
  ErrorFn,
  CompleteFn,
  NextFn,
} from '@yorkie-js-sdk/src/util/observable';
import {
  ActivateClientRequest,
  DeactivateClientRequest,
  AttachDocumentRequest,
  DetachDocumentRequest,
  PushPullChangesRequest,
  RemoveDocumentRequest,
  WatchDocumentRequest,
  WatchDocumentResponse,
} from '@yorkie-js-sdk/src/api/yorkie/v1/yorkie_pb';
import { DocEventType as PbDocEventType } from '@yorkie-js-sdk/src/api/yorkie/v1/resources_pb';
import { converter } from '@yorkie-js-sdk/src/api/converter';
import { YorkieServiceClient as RPCClient } from '@yorkie-js-sdk/src/api/yorkie/v1/yorkie_grpc_web_pb';
import { Code, YorkieError } from '@yorkie-js-sdk/src/util/error';
import { logger } from '@yorkie-js-sdk/src/util/logger';
import { uuid } from '@yorkie-js-sdk/src/util/uuid';
import { Attachment, WatchStream } from '@yorkie-js-sdk/src/client/attachment';
import {
  Document,
  DocumentKey,
  DocumentStatus,
} from '@yorkie-js-sdk/src/document/document';
import {
  AuthUnaryInterceptor,
  AuthStreamInterceptor,
} from '@yorkie-js-sdk/src/client/auth_interceptor';
import {
  MetricUnaryInterceptor,
  MetricStreamInterceptor,
} from '@yorkie-js-sdk/src/client/metric_interceptor';
import { Indexable, DocEventType } from '@yorkie-js-sdk/src/document/document';

/**
 * `SyncMode` is the mode of synchronization. It is used to determine
 * whether to push and pull changes in PushPullChanges API.
 * @public
 */
export enum SyncMode {
  /**
   * `PushPull` is the mode that pushes and pulls changes.
   */
  PushPull = 'pushpull',

  /**
   * `PushOnly` is the mode that pushes changes only.
   */
  PushOnly = 'pushonly',
}

/**
 * `ClientStatus` represents the status of the client.
 * @public
 */
export enum ClientStatus {
  /**
   * `Deactivated` means that the client is not activated. It is the initial
   * status of the client. If the client is deactivated, all `Document`s of the
   * client are also not used.
   */
  Deactivated = 'deactivated',

  /**
   * `Activated` means that the client is activated. If the client is activated,
   * all `Document`s of the client are also ready to be used.
   */
  Activated = 'activated',
}

/**
 * `StreamConnectionStatus` represents whether the stream connection between the
 * client and the server is connected or not.
 * @public
 */
export enum StreamConnectionStatus {
  /**
   * `Connected` means that the stream connection is connected.
   */
  Connected = 'connected',
  /**
   * `Disconnected` means that the stream connection is disconnected.
   */
  Disconnected = 'disconnected',
}

/**
 * `DocumentSyncResultType` represents the result of synchronizing the document
 *  with the server.
 * @public
 */
export enum DocumentSyncResultType {
  /**
   * type when Document synced successfully.
   */
  Synced = 'synced',
  /**
   * type when Document sync failed.
   */
  SyncFailed = 'sync-failed',
}

/**
 * `ClientEventType` represents the type of the event that the client can emit.
 * @public
 */
export enum ClientEventType {
  /**
   * `StatusChanged` means that the status of the client has changed.
   */
  StatusChanged = 'status-changed',
  /**
   * `DocumentsChanged` means that the documents of the client has changed.
   */
  DocumentsChanged = 'documents-changed',
  /**
   * `StreamConnectionStatusChanged` means that the stream connection status of
   * the client has changed.
   */
  StreamConnectionStatusChanged = 'stream-connection-status-changed',
  /**
   * `DocumentSynced` means that the document has been synced with the server.
   */
  DocumentSynced = 'document-synced',
}

/**
 * `ClientEvent` is an event that occurs in `Client`. It can be delivered using
 * `Client.subscribe()`.
 *
 * @public
 */
export type ClientEvent =
  | StatusChangedEvent
  | DocumentsChangedEvent
  | StreamConnectionStatusChangedEvent
  | DocumentSyncedEvent;

/**
 * @internal
 */
export interface BaseClientEvent {
  type: ClientEventType;
}

/**
 * `StatusChangedEvent` is an event that occurs when the Client's state changes.
 *
 * @public
 */
export interface StatusChangedEvent extends BaseClientEvent {
  /**
   * enum {@link ClientEventType}.StatusChanged
   */
  type: ClientEventType.StatusChanged;
  /**
   * `DocumentsChangedEvent` value
   */
  value: ClientStatus;
}

/**
 * `DocumentsChangedEvent` is an event that occurs when documents attached to
 * the client changes.
 *
 * @public
 */
export interface DocumentsChangedEvent extends BaseClientEvent {
  /**
   * enum {@link ClientEventType}.DocumentsChangedEvent
   */
  type: ClientEventType.DocumentsChanged;
  /**
   * `DocumentsChangedEvent` value
   */
  value: Array<string>;
}

/**
 * `StreamConnectionStatusChangedEvent` is an event that occurs when
 * the client's stream connection state changes.
 *
 * @public
 */
export interface StreamConnectionStatusChangedEvent extends BaseClientEvent {
  /**
   * `StreamConnectionStatusChangedEvent` type
   * enum {@link ClientEventType}.StreamConnectionStatusChangedEvent
   */
  type: ClientEventType.StreamConnectionStatusChanged;
  /**
   * `StreamConnectionStatusChangedEvent` value
   */
  value: StreamConnectionStatus;
}

/**
 * `DocumentSyncedEvent` is an event that occurs when documents
 * attached to the client are synced.
 *
 * @public
 */
export interface DocumentSyncedEvent extends BaseClientEvent {
  /**
   * `DocumentSyncedEvent` type
   * enum {@link ClientEventType}.DocumentSyncedEvent
   */
  type: ClientEventType.DocumentSynced;
  /**
   * `DocumentSyncedEvent` value
   */
  value: DocumentSyncResultType;
}

/**
 * `ClientOptions` are user-settable options used when defining clients.
 *
 * @public
 */
export interface ClientOptions {
  /**
   * `key` is the client key. It is used to identify the client.
   * If not set, a random key is generated.
   */
  key?: string;

  /**
   * `apiKey` is the API key of the project. It is used to identify the project.
   * If not set, API key of the default project is used.
   */
  apiKey?: string;

  /**
   * `token` is the authentication token of this client. It is used to identify
   * the user of the client.
   */
  token?: string;

  /**
   * `syncLoopDuration` is the duration of the sync loop. After each sync loop,
   * the client waits for the duration to next sync. The default value is
   * `50`(ms).
   */
  syncLoopDuration?: number;

  /**
   * `retrySyncLoopDelay` is the delay of the retry sync loop. If the sync loop
   * fails, the client waits for the delay to retry the sync loop. The default
   * value is `1000`(ms).
   */
  retrySyncLoopDelay?: number;

  /**
   * `reconnectStreamDelay` is the delay of the reconnect stream. If the stream
   * is disconnected, the client waits for the delay to reconnect the stream. The
   * default value is `1000`(ms).
   */
  reconnectStreamDelay?: number;
}

/**
 * `DefaultClientOptions` is the default options for Client.
 */
const DefaultClientOptions = {
  syncLoopDuration: 50,
  retrySyncLoopDelay: 1000,
  reconnectStreamDelay: 1000,
};

/**
 * `Client` is a normal client that can communicate with the server.
 * It has documents and sends changes of the documents in local
 * to the server to synchronize with other replicas in remote.
 *
 * @public
 */
export class Client implements Observable<ClientEvent> {
  private id?: ActorID;
  private key: string;
  private status: ClientStatus;
  private attachmentMap: Map<DocumentKey, Attachment<unknown, any>>;

  private apiKey: string;
  private syncLoopDuration: number;
  private reconnectStreamDelay: number;
  private retrySyncLoopDelay: number;

  private rpcClient: RPCClient;
  private eventStream: Observable<ClientEvent>;
  private eventStreamObserver!: Observer<ClientEvent>;

  /**
   * @param rpcAddr - the address of the RPC server.
   * @param opts - the options of the client.
   */
  constructor(rpcAddr: string, opts?: ClientOptions) {
    opts = opts || DefaultClientOptions;

    this.key = opts.key ? opts.key : uuid();
    this.status = ClientStatus.Deactivated;
    this.attachmentMap = new Map();

    // TODO(hackerwins): Consider to group the options as a single object.
    this.apiKey = opts.apiKey || '';
    this.syncLoopDuration =
      opts.syncLoopDuration || DefaultClientOptions.syncLoopDuration;
    this.reconnectStreamDelay =
      opts.reconnectStreamDelay || DefaultClientOptions.reconnectStreamDelay;
    this.retrySyncLoopDelay =
      opts.retrySyncLoopDelay || DefaultClientOptions.retrySyncLoopDelay;

    const rpcOpts = {
      unaryInterceptors: [new MetricUnaryInterceptor()],
      streamInterceptors: [new MetricStreamInterceptor()],
    };

    if (opts.apiKey || opts.token) {
      rpcOpts.unaryInterceptors.push(
        new AuthUnaryInterceptor(opts.apiKey, opts.token),
      );
      rpcOpts.streamInterceptors.push(
        new AuthStreamInterceptor(opts.apiKey, opts.token),
      );
    }

    this.rpcClient = new RPCClient(rpcAddr, null, rpcOpts);
    this.eventStream = createObservable<ClientEvent>((observer) => {
      this.eventStreamObserver = observer;
    });
  }

  /**
   * `activate` activates this client. That is, it registers itself to the server
   * and receives a unique ID from the server. The given ID is used to
   * distinguish different clients.
   */
  public activate(): Promise<void> {
    if (this.isActive()) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      const req = new ActivateClientRequest();
      req.setClientKey(this.key);

      this.rpcClient.activateClient(
        req,
        { 'x-shard-key': this.apiKey },
        async (err, res) => {
          if (err) {
            logger.error(`[AC] c:"${this.getKey()}" err :`, err);
            reject(err);
            return;
          }

          this.id = converter.toHexString(res.getClientId_asU8());
          this.status = ClientStatus.Activated;
          this.runSyncLoop();

          this.eventStreamObserver.next({
            type: ClientEventType.StatusChanged,
            value: this.status,
          });

          logger.info(`[AC] c:"${this.getKey()}" activated, id:"${this.id}"`);
          resolve();
        },
      );
    });
  }

  /**
   * `deactivate` deactivates this client.
   */
  public deactivate(): Promise<void> {
    if (this.status === ClientStatus.Deactivated) {
      return Promise.resolve();
    }
    this.attachmentMap.forEach((_, docKey) => {
      this.detachInternal(docKey);
    });
    return new Promise((resolve, reject) => {
      const req = new DeactivateClientRequest();
      req.setClientId(converter.toUint8Array(this.id!));

      this.rpcClient.deactivateClient(
        req,
        { 'x-shard-key': this.apiKey },
        (err) => {
          if (err) {
            logger.error(`[DC] c:"${this.getKey()}" err :`, err);
            reject(err);
            return;
          }

          this.status = ClientStatus.Deactivated;
          this.eventStreamObserver.next({
            type: ClientEventType.StatusChanged,
            value: this.status,
          });

          logger.info(`[DC] c"${this.getKey()}" deactivated`);
          resolve();
        },
      );
    });
  }

  /**
   * `attach` attaches the given document to this client. It tells the server that
   * this client will synchronize the given document.
   */
  public attach<T, P extends Indexable>(
    doc: Document<T, P>,
    options: {
      initialPresence?: P;
      isRealtimeSync?: boolean;
    } = {},
  ): Promise<Document<T, P>> {
    if (!this.isActive()) {
      throw new YorkieError(Code.ClientNotActive, `${this.key} is not active`);
    }
    if (doc.getStatus() !== DocumentStatus.Detached) {
      throw new YorkieError(
        Code.DocumentNotDetached,
        `${doc.getKey()} is not detached`,
      );
    }
    doc.setActor(this.id!);
    doc.update((_, p) => p.set(options.initialPresence || {}));

    const isRealtimeSync = options.isRealtimeSync ?? true;

    return new Promise((resolve, reject) => {
      const req = new AttachDocumentRequest();
      req.setClientId(converter.toUint8Array(this.id!));
      req.setChangePack(converter.toChangePack(doc.createChangePack()));

      this.rpcClient.attachDocument(
        req,
        { 'x-shard-key': `${this.apiKey}/${doc.getKey()}` },
        async (err, res) => {
          if (err) {
            logger.error(`[AD] c:"${this.getKey()}" err :`, err);
            reject(err);
            return;
          }

          const pack = converter.fromChangePack<P>(res.getChangePack()!);
          doc.applyChangePack(pack);
          if (doc.getStatus() !== DocumentStatus.Removed) {
            doc.setStatus(DocumentStatus.Attached);
            this.attachmentMap.set(
              doc.getKey(),
              new Attachment(
                this.reconnectStreamDelay,
                doc,
                res.getDocumentId(),
                isRealtimeSync,
              ),
            );

            if (isRealtimeSync) {
              await this.runWatchLoop(doc.getKey());
            }
          }

          logger.info(`[AD] c:"${this.getKey()}" attaches d:"${doc.getKey()}"`);
          resolve(doc);
        },
      );
    });
  }

  /**
   * `detach` detaches the given document from this client. It tells the
   * server that this client will no longer synchronize the given document.
   *
   * To collect garbage things like CRDT tombstones left on the document, all
   * the changes should be applied to other replicas before GC time. For this,
   * if the document is no longer used by this client, it should be detached.
   */
  public detach<T, P extends Indexable>(
    doc: Document<T, P>,
  ): Promise<Document<T, P>> {
    if (!this.isActive()) {
      throw new YorkieError(Code.ClientNotActive, `${this.key} is not active`);
    }
    const attachment = this.attachmentMap.get(doc.getKey());
    if (!attachment) {
      throw new YorkieError(
        Code.DocumentNotAttached,
        `${doc.getKey()} is not attached`,
      );
    }
    doc.update((_, p) => p.clear());

    return new Promise((resolve, reject) => {
      const req = new DetachDocumentRequest();
      req.setClientId(converter.toUint8Array(this.id!));
      req.setDocumentId(attachment.docID);
      req.setChangePack(converter.toChangePack(doc.createChangePack()));

      this.rpcClient.detachDocument(
        req,
        { 'x-shard-key': `${this.apiKey}/${doc.getKey()}` },
        async (err, res) => {
          if (err) {
            logger.error(`[DD] c:"${this.getKey()}" err :`, err);
            reject(err);
            return;
          }

          const pack = converter.fromChangePack<P>(res.getChangePack()!);
          doc.applyChangePack(pack);
          if (doc.getStatus() !== DocumentStatus.Removed) {
            doc.setStatus(DocumentStatus.Detached);
          }
          this.detachInternal(doc.getKey());

          logger.info(`[DD] c:"${this.getKey()}" detaches d:"${doc.getKey()}"`);
          resolve(doc);
        },
      );
    });
  }

  /**
   * `pause` changes the synchronization mode of the given document to manual.
   */
  public pause<T, P extends Indexable>(
    doc: Document<T, P>,
  ): Promise<Document<T, P>> {
    if (!this.isActive()) {
      throw new YorkieError(Code.ClientNotActive, `${this.key} is not active`);
    }

    return this.changeRealtimeSync(doc, false);
  }

  /**
   * `resume` changes the synchronization mode of the given document to realtime.
   */
  public resume<T, P extends Indexable>(
    doc: Document<T, P>,
  ): Promise<Document<T, P>> {
    if (!this.isActive()) {
      throw new YorkieError(Code.ClientNotActive, `${this.key} is not active`);
    }

    return this.changeRealtimeSync(doc, true);
  }

  /**
   * `pauseRemoteChanges` pauses the synchronization of remote changes,
   * allowing only local changes to be applied.
   */
  public pauseRemoteChanges<T, P extends Indexable>(doc: Document<T, P>) {
    if (!this.isActive()) {
      throw new YorkieError(Code.ClientNotActive, `${this.key} is not active`);
    }
    const attachment = this.attachmentMap.get(doc.getKey());
    if (!attachment) {
      throw new YorkieError(
        Code.DocumentNotAttached,
        `${doc.getKey()} is not attached`,
      );
    }

    attachment.changeSyncMode(SyncMode.PushOnly);
  }

  /**
   * `resumeRemoteChanges` resumes the synchronization of remote changes,
   * allowing both local and remote changes to be applied.
   */
  public resumeRemoteChanges<T, P extends Indexable>(doc: Document<T, P>) {
    if (!this.isActive()) {
      throw new YorkieError(Code.ClientNotActive, `${this.key} is not active`);
    }
    const attachment = this.attachmentMap.get(doc.getKey());
    if (!attachment) {
      throw new YorkieError(
        Code.DocumentNotAttached,
        `${doc.getKey()} is not attached`,
      );
    }

    attachment.changeSyncMode(SyncMode.PushPull);
    attachment.remoteChangeEventReceived = true;
  }

  /**
   * `changeRealtimeSync` changes the synchronization mode of the given document.
   */
  private async changeRealtimeSync<T, P extends Indexable>(
    doc: Document<T, P>,
    isRealtimeSync: boolean,
  ): Promise<Document<T, P>> {
    // TODO(hackerwins): We need to consider extracting this method to `attachment`
    // with other methods like runWatchLoop, disconnectWatchStream.
    const attachment = this.attachmentMap.get(doc.getKey());
    if (!attachment) {
      throw new YorkieError(
        Code.DocumentNotAttached,
        `${doc.getKey()} is not attached`,
      );
    }

    if (!attachment.changeRealtimeSync(isRealtimeSync)) {
      return doc;
    }

    if (isRealtimeSync) {
      await this.runWatchLoop(doc.getKey());
      return doc;
    }

    this.eventStreamObserver.next({
      type: ClientEventType.StreamConnectionStatusChanged,
      value: StreamConnectionStatus.Disconnected,
    });
    logger.debug(`[WD] c:"${this.getKey()}" unwatches`);
    return doc;
  }

  /**
   * `sync` pushes local changes of the attached documents to the server and
   * receives changes of the remote replica from the server then apply them to
   * local documents.
   */
  public sync<T, P extends Indexable>(
    doc?: Document<T, P>,
    syncMode = SyncMode.PushPull,
  ): Promise<Array<Document<T, P>>> {
    if (!this.isActive()) {
      throw new YorkieError(Code.ClientNotActive, `${this.key} is not active`);
    }
    const promises = [];
    if (doc) {
      // prettier-ignore
      const attachment = this.attachmentMap.get(doc.getKey()) as Attachment<T, P>;
      if (!attachment) {
        throw new YorkieError(
          Code.DocumentNotAttached,
          `${doc.getKey()} is not attached`,
        );
      }
      promises.push(this.syncInternal(attachment, syncMode));
    } else {
      this.attachmentMap.forEach((attachment) => {
        promises.push(this.syncInternal(attachment, attachment.syncMode));
      });
    }

    return Promise.all(promises).catch((err) => {
      this.eventStreamObserver.next({
        type: ClientEventType.DocumentSynced,
        value: DocumentSyncResultType.SyncFailed,
      });
      throw err;
    });
  }

  /**
   * `remove` removes the given document.
   */
  public remove<T, P extends Indexable>(doc: Document<T, P>): Promise<void> {
    if (!this.isActive()) {
      throw new YorkieError(Code.ClientNotActive, `${this.key} is not active`);
    }
    const attachment = this.attachmentMap.get(doc.getKey());
    if (!attachment) {
      throw new YorkieError(
        Code.DocumentNotAttached,
        `${doc.getKey()} is not attached`,
      );
    }
    doc.setActor(this.id!);
    return new Promise((resolve, reject) => {
      const req = new RemoveDocumentRequest();
      req.setClientId(converter.toUint8Array(this.id!));
      req.setDocumentId(attachment.docID);
      const pbChangePack = converter.toChangePack(doc.createChangePack());
      pbChangePack.setIsRemoved(true);
      req.setChangePack(pbChangePack);

      this.rpcClient.removeDocument(
        req,
        { 'x-shard-key': `${this.apiKey}/${doc.getKey()}` },
        async (err, res) => {
          if (err) {
            logger.error(
              `[RD] c:"${this.getKey()}" d:"${doc.getKey()}" err :`,
              err,
            );
            reject(err);
            return;
          }

          const pack = converter.fromChangePack<P>(res.getChangePack()!);
          doc.applyChangePack(pack);
          this.detachInternal(doc.getKey());

          logger.info(`[RD] c:"${this.getKey()}" removes d:"${doc.getKey()}"`);
          resolve();
        },
      );
    });
  }

  /**
   * `subscribe` subscribes to the given topics.
   */
  public subscribe(
    nextOrObserver: Observer<ClientEvent> | NextFn<ClientEvent>,
    error?: ErrorFn,
    complete?: CompleteFn,
  ): Unsubscribe {
    return this.eventStream.subscribe(
      nextOrObserver as NextFn<ClientEvent>,
      error,
      complete,
    );
  }

  /**
   * `getID` returns a ActorID of client.
   */
  public getID(): string | undefined {
    return this.id;
  }

  /**
   * `getKey` returns a key of client.
   */
  public getKey(): string {
    return this.key;
  }

  /**
   * `isActive` checks if the client is active.
   */
  public isActive(): boolean {
    return this.status === ClientStatus.Activated;
  }

  /**
   * `getStatus` returns the status of this client.
   */
  public getStatus(): ClientStatus {
    return this.status;
  }

  private runSyncLoop(): void {
    const doLoop = (): void => {
      if (!this.isActive()) {
        logger.debug(`[SL] c:"${this.getKey()}" exit sync loop`);
        return;
      }

      const syncJobs = [];
      for (const [, attachment] of this.attachmentMap) {
        if (attachment.needRealtimeSync()) {
          attachment.remoteChangeEventReceived = false;
          syncJobs.push(this.syncInternal(attachment, attachment.syncMode));
        }
      }

      Promise.all(syncJobs)
        .then(() => setTimeout(doLoop, this.syncLoopDuration))
        .catch((err) => {
          logger.error(`[SL] c:"${this.getKey()}" sync failed:`, err);
          this.eventStreamObserver.next({
            type: ClientEventType.DocumentSynced,
            value: DocumentSyncResultType.SyncFailed,
          });
          setTimeout(doLoop, this.retrySyncLoopDelay);
        });
    };

    logger.debug(`[SL] c:"${this.getKey()}" run sync loop`);
    doLoop();
  }

  private async runWatchLoop(docKey: DocumentKey): Promise<void> {
    const attachment = this.attachmentMap.get(docKey);
    if (!attachment) {
      throw new YorkieError(
        Code.DocumentNotAttached,
        `${docKey} is not attached`,
      );
    }

    return attachment.runWatchLoop(
      (onDisconnect: () => void): Promise<WatchStream> => {
        if (!this.isActive()) {
          throw new YorkieError(
            Code.ClientNotActive,
            `${this.key} is not active`,
          );
        }

        const req = new WatchDocumentRequest();
        req.setClientId(converter.toUint8Array(this.id!));
        req.setDocumentId(attachment.docID);
        const stream = this.rpcClient.watchDocument(req, {
          'x-shard-key': `${this.apiKey}/${docKey}`,
        });

        this.eventStreamObserver.next({
          type: ClientEventType.StreamConnectionStatusChanged,
          value: StreamConnectionStatus.Connected,
        });
        logger.info(`[WD] c:"${this.getKey()}" watches d:"${docKey}"`);

        return new Promise((resolve) => {
          const onStreamDisconnect = (): void => {
            this.eventStreamObserver.next({
              type: ClientEventType.StreamConnectionStatusChanged,
              value: StreamConnectionStatus.Disconnected,
            });
            logger.debug(`[WD] c:"${this.getKey()}" unwatches`);
            onDisconnect();
          };

          stream.on('data', (resp: WatchDocumentResponse) => {
            this.handleWatchDocumentsResponse(attachment, resp);
            resolve(stream);
          });
          stream.on('end', onStreamDisconnect);
          stream.on('error', onStreamDisconnect);
        });
      },
    );
  }

  private handleWatchDocumentsResponse<T, P extends Indexable>(
    attachment: Attachment<T, P>,
    resp: WatchDocumentResponse,
  ) {
    const docKey = attachment.doc.getKey();
    if (resp.hasInitialization()) {
      const pbClientIDs = resp.getInitialization()!.getClientIdsList();
      const onlineClients: Set<ActorID> = new Set();
      for (const pbClientID of pbClientIDs) {
        const clientID = converter.toHexString(pbClientID as Uint8Array);
        onlineClients.add(clientID);
      }
      attachment.doc.setOnlineClients(onlineClients);
      attachment.doc.publish({
        type: DocEventType.Initialized,
        value: attachment.doc.getPresences(),
      });
      return;
    }

    const pbWatchEvent = resp.getEvent()!;
    const eventType = pbWatchEvent.getType();
    const publisher = converter.toHexString(pbWatchEvent.getPublisher_asU8());
    switch (eventType) {
      case PbDocEventType.DOC_EVENT_TYPE_DOCUMENTS_CHANGED:
        attachment.remoteChangeEventReceived = true;
        this.eventStreamObserver.next({
          type: ClientEventType.DocumentsChanged,
          value: [docKey],
        });
        break;
      case PbDocEventType.DOC_EVENT_TYPE_DOCUMENTS_WATCHED:
        attachment.doc.addOnlineClient(publisher);
        // NOTE(chacha912): We added to onlineClients, but we won't trigger watched event
        // unless we also know their initial presence data at this point.
        if (attachment.doc.hasPresence(publisher)) {
          attachment.doc.publish({
            type: DocEventType.Watched,
            value: {
              clientID: publisher,
              presence: attachment.doc.getPresence(publisher)!,
            },
          });
        }
        break;
      case PbDocEventType.DOC_EVENT_TYPE_DOCUMENTS_UNWATCHED: {
        const presence = attachment.doc.getPresence(publisher);
        attachment.doc.removeOnlineClient(publisher);
        // NOTE(chacha912): There is no presence, when PresenceChange(clear) is applied before unwatching.
        // In that case, the 'unwatched' event is triggered while handling the PresenceChange.
        if (presence) {
          attachment.doc.publish({
            type: DocEventType.Unwatched,
            value: { clientID: publisher, presence },
          });
        }
        break;
      }
    }
  }

  private detachInternal(docKey: DocumentKey) {
    const attachment = this.attachmentMap.get(docKey);
    if (!attachment) {
      throw new YorkieError(
        Code.DocumentNotAttached,
        `${docKey} is not attached`,
      );
    }

    attachment.cancelWatchStream();
    logger.debug(`[WD] c:"${this.getKey()}" unwatches`);

    this.eventStreamObserver.next({
      type: ClientEventType.StreamConnectionStatusChanged,
      value: StreamConnectionStatus.Disconnected,
    });

    this.attachmentMap.delete(docKey);
  }

  private syncInternal<T, P extends Indexable>(
    attachment: Attachment<T, P>,
    syncMode: SyncMode,
  ): Promise<Document<T, P>> {
    const { doc, docID } = attachment;
    return new Promise((resolve, reject) => {
      const req = new PushPullChangesRequest();
      req.setClientId(converter.toUint8Array(this.id!));
      req.setDocumentId(docID);
      const reqPack = doc.createChangePack();
      const localSize = reqPack.getChangeSize();
      req.setChangePack(converter.toChangePack(reqPack));
      req.setPushOnly(syncMode === SyncMode.PushOnly);

      let isRejected = false;
      this.rpcClient
        .pushPullChanges(
          req,
          { 'x-shard-key': `${this.apiKey}/${doc.getKey()}` },
          (err, res) => {
            if (err) {
              logger.error(`[PP] c:"${this.getKey()}" err :`, err);

              isRejected = true;
              reject(err);
              return;
            }

            const respPack = converter.fromChangePack<P>(res.getChangePack()!);

            // NOTE(chacha912, hackerwins): If syncLoop already executed with
            // PushPull, ignore the response when the syncMode is PushOnly.
            if (respPack.hasChanges() && syncMode === SyncMode.PushOnly) {
              return;
            }

            doc.applyChangePack(respPack);
            this.eventStreamObserver.next({
              type: ClientEventType.DocumentSynced,
              value: DocumentSyncResultType.Synced,
            });
            // NOTE(chacha912): If a document has been removed, watchStream should
            // be disconnected to not receive an event for that document.
            if (doc.getStatus() === DocumentStatus.Removed) {
              this.detachInternal(doc.getKey());
            }

            const docKey = doc.getKey();
            const remoteSize = respPack.getChangeSize();
            logger.info(
              `[PP] c:"${this.getKey()}" sync d:"${docKey}", push:${localSize} pull:${remoteSize} cp:${respPack
                .getCheckpoint()
                .toTestString()}`,
            );
          },
        )
        .on('end', () => {
          if (isRejected) {
            return;
          }
          resolve(doc);
        });
    });
  }
}
