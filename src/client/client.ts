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
  createPromiseClient,
  PromiseClient,
  ConnectError,
  Code as ConnectErrorCode,
} from '@connectrpc/connect';
import { createGrpcWebTransport } from '@connectrpc/connect-web';
import { YorkieService } from '@yorkie-js-sdk/src/api/yorkie/v1/yorkie_connect';
import { WatchDocumentResponse } from '@yorkie-js-sdk/src/api/yorkie/v1/yorkie_pb';
import { DocEventType as PbDocEventType } from '@yorkie-js-sdk/src/api/yorkie/v1/resources_pb';
import { converter, errorCodeOf } from '@yorkie-js-sdk/src/api/converter';
import { Code, YorkieError } from '@yorkie-js-sdk/src/util/error';
import { logger } from '@yorkie-js-sdk/src/util/logger';
import { uuid } from '@yorkie-js-sdk/src/util/uuid';
import { Attachment, WatchStream } from '@yorkie-js-sdk/src/client/attachment';
import {
  Document,
  DocumentKey,
  DocumentStatus,
  Indexable,
  DocEventType,
  StreamConnectionStatus,
  DocumentSyncStatus,
} from '@yorkie-js-sdk/src/document/document';
import { OpSource } from '@yorkie-js-sdk/src/document/operation/operation';
import { createAuthInterceptor } from '@yorkie-js-sdk/src/client/auth_interceptor';
import { createMetricInterceptor } from '@yorkie-js-sdk/src/client/metric_interceptor';

/**
 * `SyncMode` defines synchronization modes for the PushPullChanges API.
 * @public
 */
export enum SyncMode {
  /**
   * `Manual` mode indicates that changes are not automatically pushed or pulled.
   */
  Manual = 'manual',

  /**
   * `Realtime` mode indicates that changes are automatically pushed and pulled.
   */
  Realtime = 'realtime',

  /**
   * `RealtimePushOnly` mode indicates that only local changes are automatically pushed.
   */
  RealtimePushOnly = 'realtime-pushonly',

  /**
   * `RealtimeSyncOff` mode indicates that changes are not automatically pushed or pulled,
   * but the watch stream is kept active.
   */
  RealtimeSyncOff = 'realtime-syncoff',
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
 * `ClientCondition` represents the condition of the client.
 */
export enum ClientCondition {
  /**
   * `SyncLoop` is a key of the sync loop condition.
   */
  SyncLoop = 'SyncLoop',

  /**
   * `WatchLoop` is a key of the watch loop condition.
   */
  WatchLoop = 'WatchLoop',
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
export class Client {
  private id?: ActorID;
  private key: string;
  private status: ClientStatus;
  private attachmentMap: Map<DocumentKey, Attachment<unknown, any>>;

  private apiKey: string;
  private conditions: Record<ClientCondition, boolean>;
  private syncLoopDuration: number;
  private reconnectStreamDelay: number;
  private retrySyncLoopDelay: number;

  private rpcClient: PromiseClient<typeof YorkieService>;
  private taskQueue: Array<() => Promise<any>>;
  private processing = false;

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
    this.conditions = {
      [ClientCondition.SyncLoop]: false,
      [ClientCondition.WatchLoop]: false,
    };
    this.syncLoopDuration =
      opts.syncLoopDuration || DefaultClientOptions.syncLoopDuration;
    this.reconnectStreamDelay =
      opts.reconnectStreamDelay || DefaultClientOptions.reconnectStreamDelay;
    this.retrySyncLoopDelay =
      opts.retrySyncLoopDelay || DefaultClientOptions.retrySyncLoopDelay;

    // Here we make the client itself, combining the service
    // definition with the transport.
    this.rpcClient = createPromiseClient(
      YorkieService,
      createGrpcWebTransport({
        baseUrl: rpcAddr,
        interceptors: [
          createAuthInterceptor(opts.apiKey, opts.token),
          createMetricInterceptor(),
        ],
      }),
    );
    this.taskQueue = [];
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

    return this.enqueueTask(async () => {
      return this.rpcClient
        .activateClient(
          { clientKey: this.key },
          { headers: { 'x-shard-key': this.apiKey } },
        )
        .then((res) => {
          this.id = res.clientId;
          this.status = ClientStatus.Activated;
          this.runSyncLoop();

          logger.info(`[AC] c:"${this.getKey()}" activated, id:"${this.id}"`);
        })
        .catch((err) => {
          logger.error(`[AC] c:"${this.getKey()}" err :`, err);
          this.handleConnectError(err);
          throw err;
        });
    });
  }

  /**
   * `deactivate` deactivates this client.
   */
  public deactivate(): Promise<void> {
    if (this.status === ClientStatus.Deactivated) {
      return Promise.resolve();
    }

    return this.enqueueTask(async () => {
      return this.rpcClient
        .deactivateClient(
          { clientId: this.id! },
          { headers: { 'x-shard-key': this.apiKey } },
        )
        .then(() => {
          this.deactivateInternal();
          logger.info(`[DC] c"${this.getKey()}" deactivated`);
        })
        .catch((err) => {
          logger.error(`[DC] c:"${this.getKey()}" err :`, err);
          this.handleConnectError(err);
          throw err;
        });
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
      syncMode?: SyncMode;
    } = {},
  ): Promise<Document<T, P>> {
    if (!this.isActive()) {
      throw new YorkieError(
        Code.ErrClientNotActivated,
        `${this.key} is not active`,
      );
    }
    if (doc.getStatus() !== DocumentStatus.Detached) {
      throw new YorkieError(
        Code.ErrDocumentNotDetached,
        `${doc.getKey()} is not detached`,
      );
    }
    doc.setActor(this.id!);
    doc.update((_, p) => p.set(options.initialPresence || {}));

    const syncMode = options.syncMode ?? SyncMode.Realtime;
    return this.enqueueTask(async () => {
      return this.rpcClient
        .attachDocument(
          {
            clientId: this.id!,
            changePack: converter.toChangePack(doc.createChangePack()),
          },
          { headers: { 'x-shard-key': `${this.apiKey}/${doc.getKey()}` } },
        )
        .then(async (res) => {
          const pack = converter.fromChangePack<P>(res.changePack!);
          doc.applyChangePack(pack);
          if (doc.getStatus() === DocumentStatus.Removed) {
            return doc;
          }

          doc.applyStatus(DocumentStatus.Attached);
          this.attachmentMap.set(
            doc.getKey(),
            new Attachment(
              this.reconnectStreamDelay,
              doc,
              res.documentId,
              syncMode,
            ),
          );

          if (syncMode !== SyncMode.Manual) {
            await this.runWatchLoop(doc.getKey());
          }

          logger.info(`[AD] c:"${this.getKey()}" attaches d:"${doc.getKey()}"`);
          return doc;
        })
        .catch((err) => {
          logger.error(`[AD] c:"${this.getKey()}" err :`, err);
          this.handleConnectError(err);
          throw err;
        });
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
    options: {
      removeIfNotAttached?: boolean;
    } = {},
  ): Promise<Document<T, P>> {
    if (!this.isActive()) {
      throw new YorkieError(
        Code.ErrClientNotActivated,
        `${this.key} is not active`,
      );
    }
    const attachment = this.attachmentMap.get(doc.getKey());
    if (!attachment) {
      throw new YorkieError(
        Code.ErrDocumentNotAttached,
        `${doc.getKey()} is not attached`,
      );
    }
    doc.update((_, p) => p.clear());

    return this.enqueueTask(async () => {
      return this.rpcClient
        .detachDocument(
          {
            clientId: this.id!,
            documentId: attachment.docID,
            changePack: converter.toChangePack(doc.createChangePack()),
            removeIfNotAttached: options.removeIfNotAttached ?? false,
          },
          { headers: { 'x-shard-key': `${this.apiKey}/${doc.getKey()}` } },
        )
        .then((res) => {
          const pack = converter.fromChangePack<P>(res.changePack!);
          doc.applyChangePack(pack);
          if (doc.getStatus() !== DocumentStatus.Removed) {
            doc.applyStatus(DocumentStatus.Detached);
          }
          this.detachInternal(doc.getKey());

          logger.info(`[DD] c:"${this.getKey()}" detaches d:"${doc.getKey()}"`);
          return doc;
        })
        .catch((err) => {
          logger.error(`[DD] c:"${this.getKey()}" err :`, err);
          this.handleConnectError(err);
          throw err;
        });
    });
  }

  /**
   * `changeRealtimeSync` changes the synchronization mode of the given document.
   */
  public async changeSyncMode<T, P extends Indexable>(
    doc: Document<T, P>,
    syncMode: SyncMode,
  ): Promise<Document<T, P>> {
    if (!this.isActive()) {
      throw new YorkieError(
        Code.ErrClientNotActivated,
        `${this.key} is not active`,
      );
    }

    const attachment = this.attachmentMap.get(doc.getKey());
    if (!attachment) {
      throw new YorkieError(
        Code.ErrDocumentNotAttached,
        `${doc.getKey()} is not attached`,
      );
    }

    const prevSyncMode = attachment.syncMode;
    if (prevSyncMode === syncMode) {
      return doc;
    }

    attachment.changeSyncMode(syncMode);

    // realtime to manual
    if (syncMode === SyncMode.Manual) {
      attachment.cancelWatchStream();
      return doc;
    }

    if (syncMode === SyncMode.Realtime) {
      // NOTE(hackerwins): In non-pushpull mode, the client does not receive change events
      // from the server. Therefore, we need to set `remoteChangeEventReceived` to true
      // to sync the local and remote changes. This has limitations in that unnecessary
      // syncs occur if the client and server do not have any changes.
      attachment.remoteChangeEventReceived = true;
    }

    // manual to realtime
    if (prevSyncMode === SyncMode.Manual) {
      await this.runWatchLoop(doc.getKey());
    }

    return doc;
  }

  /**
   * `sync` pushes local changes of the attached documents to the server and
   * receives changes of the remote replica from the server then apply them to
   * local documents.
   */
  public sync<T, P extends Indexable>(
    doc?: Document<T, P>,
  ): Promise<Array<Document<T, P>>> {
    if (!this.isActive()) {
      throw new YorkieError(
        Code.ErrClientNotActivated,
        `${this.key} is not active`,
      );
    }
    if (doc) {
      // prettier-ignore
      const attachment = this.attachmentMap.get(doc.getKey()) as Attachment<T, P>;
      if (!attachment) {
        throw new YorkieError(
          Code.ErrDocumentNotAttached,
          `${doc.getKey()} is not attached`,
        );
      }
      return this.enqueueTask(async () => {
        return this.syncInternal(attachment, SyncMode.Realtime).catch((err) => {
          logger.error(`[SY] c:"${this.getKey()}" err :`, err);
          this.handleConnectError(err);
          throw err;
        });
      });
    }

    return this.enqueueTask(async () => {
      const promises = [];
      for (const [, attachment] of this.attachmentMap) {
        promises.push(this.syncInternal(attachment, attachment.syncMode));
      }
      return Promise.all(promises).catch((err) => {
        logger.error(`[SY] c:"${this.getKey()}" err :`, err);
        this.handleConnectError(err);
        throw err;
      });
    });
  }

  /**
   * `remove` removes the given document.
   */
  public remove<T, P extends Indexable>(doc: Document<T, P>): Promise<void> {
    if (!this.isActive()) {
      throw new YorkieError(
        Code.ErrClientNotActivated,
        `${this.key} is not active`,
      );
    }
    const attachment = this.attachmentMap.get(doc.getKey());
    if (!attachment) {
      throw new YorkieError(
        Code.ErrDocumentNotAttached,
        `${doc.getKey()} is not attached`,
      );
    }
    doc.setActor(this.id!);

    const pbChangePack = converter.toChangePack(doc.createChangePack());
    pbChangePack.isRemoved = true;

    return this.enqueueTask(async () => {
      return this.rpcClient
        .removeDocument(
          {
            clientId: this.id!,
            documentId: attachment.docID,
            changePack: pbChangePack,
          },
          { headers: { 'x-shard-key': `${this.apiKey}/${doc.getKey()}` } },
        )
        .then((res) => {
          const pack = converter.fromChangePack<P>(res.changePack!);
          doc.applyChangePack(pack);
          this.detachInternal(doc.getKey());

          logger.info(`[RD] c:"${this.getKey()}" removes d:"${doc.getKey()}"`);
        })
        .catch((err) => {
          logger.error(`[RD] c:"${this.getKey()}" err :`, err);
          this.handleConnectError(err);
          throw err;
        });
    });
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

  /**
   * `getCondition` returns the condition of this client.
   */
  public getCondition(condition: ClientCondition): boolean {
    return this.conditions[condition];
  }

  /**
   * `runSyncLoop` runs the sync loop. The sync loop pushes local changes to
   * the server and pulls remote changes from the server.
   */
  private runSyncLoop(): void {
    const doLoop = (): void => {
      if (!this.isActive()) {
        logger.debug(`[SL] c:"${this.getKey()}" exit sync loop`);
        this.conditions[ClientCondition.SyncLoop] = false;
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

          if (this.handleConnectError(err)) {
            setTimeout(doLoop, this.retrySyncLoopDelay);
          } else {
            this.conditions[ClientCondition.SyncLoop] = false;
          }
        });
    };

    logger.debug(`[SL] c:"${this.getKey()}" run sync loop`);
    this.conditions[ClientCondition.SyncLoop] = true;
    doLoop();
  }

  /**
   * `runWatchLoop` runs the watch loop for the given document. The watch loop
   * listens to the events of the given document from the server.
   */
  private async runWatchLoop(docKey: DocumentKey): Promise<void> {
    const attachment = this.attachmentMap.get(docKey);
    if (!attachment) {
      throw new YorkieError(
        Code.ErrDocumentNotAttached,
        `${docKey} is not attached`,
      );
    }

    this.conditions[ClientCondition.WatchLoop] = true;
    return attachment.runWatchLoop(
      (onDisconnect: () => void): Promise<[WatchStream, AbortController]> => {
        if (!this.isActive()) {
          this.conditions[ClientCondition.WatchLoop] = false;
          return Promise.reject(
            new YorkieError(
              Code.ErrClientNotActivated,
              `${this.key} is not active`,
            ),
          );
        }

        const ac = new AbortController();
        const stream = this.rpcClient.watchDocument(
          {
            clientId: this.id!,
            documentId: attachment.docID,
          },
          {
            headers: { 'x-shard-key': `${this.apiKey}/${docKey}` },
            signal: ac.signal,
          },
        );

        attachment.doc.publish([
          {
            type: DocEventType.ConnectionChanged,
            value: StreamConnectionStatus.Connected,
          },
        ]);
        logger.info(`[WD] c:"${this.getKey()}" watches d:"${docKey}"`);

        return new Promise((resolve, reject) => {
          const handleStream = async () => {
            try {
              for await (const resp of stream) {
                this.handleWatchDocumentsResponse(attachment, resp);

                // NOTE(hackerwins): When the first response is received, we need to
                // resolve the promise to notify that the watch stream is ready.
                if (resp.body.case === 'initialization') {
                  resolve([stream, ac]);
                }
              }
            } catch (err) {
              attachment.doc.resetOnlineClients();
              attachment.doc.publish([
                {
                  type: DocEventType.Initialized,
                  source: OpSource.Local,
                  value: attachment.doc.getPresences(),
                },
              ]);
              attachment.doc.publish([
                {
                  type: DocEventType.ConnectionChanged,
                  value: StreamConnectionStatus.Disconnected,
                },
              ]);
              logger.debug(`[WD] c:"${this.getKey()}" unwatches`);

              if (this.handleConnectError(err)) {
                onDisconnect();
              } else {
                this.conditions[ClientCondition.WatchLoop] = false;
              }

              reject(err);
            }
          };

          handleStream();
        });
      },
    );
  }

  private handleWatchDocumentsResponse<T, P extends Indexable>(
    attachment: Attachment<T, P>,
    resp: WatchDocumentResponse,
  ) {
    if (
      resp.body.case === 'event' &&
      resp.body.value.type === PbDocEventType.DOCUMENT_CHANGED
    ) {
      attachment.remoteChangeEventReceived = true;
      return;
    }

    attachment.doc.applyWatchStream(resp);
  }

  private deactivateInternal() {
    this.status = ClientStatus.Deactivated;

    for (const [key, attachment] of this.attachmentMap) {
      this.detachInternal(key);
      attachment.doc.applyStatus(DocumentStatus.Detached);
    }
  }

  private detachInternal(docKey: DocumentKey) {
    // NOTE(hackerwins): If attachment is not found, it means that the document
    // has been already detached by another routine.
    // This can happen when detach or remove is called while the watch loop is
    // running.
    const attachment = this.attachmentMap.get(docKey);
    if (!attachment) {
      return;
    }

    attachment.cancelWatchStream();
    this.attachmentMap.delete(docKey);
  }

  private syncInternal<T, P extends Indexable>(
    attachment: Attachment<T, P>,
    syncMode: SyncMode,
  ): Promise<Document<T, P>> {
    const { doc, docID } = attachment;

    const reqPack = doc.createChangePack();
    return this.rpcClient
      .pushPullChanges(
        {
          clientId: this.id!,
          documentId: docID,
          changePack: converter.toChangePack(reqPack),
          pushOnly: syncMode === SyncMode.RealtimePushOnly,
        },
        { headers: { 'x-shard-key': `${this.apiKey}/${doc.getKey()}` } },
      )
      .then((res) => {
        const respPack = converter.fromChangePack<P>(res.changePack!);

        // NOTE(chacha912, hackerwins): If syncLoop already executed with
        // PushPull, ignore the response when the syncMode is PushOnly.
        if (
          respPack.hasChanges() &&
          (attachment.syncMode === SyncMode.RealtimePushOnly ||
            attachment.syncMode === SyncMode.RealtimeSyncOff)
        ) {
          return doc;
        }

        doc.applyChangePack(respPack);
        attachment.doc.publish([
          {
            type: DocEventType.SyncStatusChanged,
            value: DocumentSyncStatus.Synced,
          },
        ]);
        // NOTE(chacha912): If a document has been removed, watchStream should
        // be disconnected to not receive an event for that document.
        if (doc.getStatus() === DocumentStatus.Removed) {
          this.detachInternal(doc.getKey());
        }

        const docKey = doc.getKey();
        const remoteSize = respPack.getChangeSize();
        logger.info(
          `[PP] c:"${this.getKey()}" sync d:"${docKey}", push:${reqPack.getChangeSize()} pull:${remoteSize} cp:${respPack
            .getCheckpoint()
            .toTestString()}`,
        );
        return doc;
      })
      .catch((err) => {
        doc.publish([
          {
            type: DocEventType.SyncStatusChanged,
            value: DocumentSyncStatus.SyncFailed,
          },
        ]);
        logger.error(`[PP] c:"${this.getKey()}" err :`, err);
        throw err;
      });
  }

  /**
   * `handleConnectError` handles the given error. If the given error can be
   * retried after handling, it returns true.
   */
  private handleConnectError(err: any): boolean {
    if (!(err instanceof ConnectError)) {
      return false;
    }

    // NOTE(hackerwins): These errors are retryable.
    // Connect guide indicates that for error codes like `ResourceExhausted` and
    // `Unavailable`, retries should be attempted following their guidelines.
    // Additionally, `Unknown` and `Canceled` are added separately as it
    // typically occurs when the server is stopped.
    if (
      err.code === ConnectErrorCode.Canceled ||
      err.code === ConnectErrorCode.Unknown ||
      err.code === ConnectErrorCode.ResourceExhausted ||
      err.code === ConnectErrorCode.Unavailable
    ) {
      return true;
    }

    // NOTE(hackerwins): Some errors should fix the state of the client.
    if (
      errorCodeOf(err) === Code.ErrClientNotActivated ||
      errorCodeOf(err) === Code.ErrClientNotFound
    ) {
      this.deactivateInternal();
    }

    // TODO(hackerwins): We need to handle more cases.
    // - Unauthenticated: The client is not authenticated. It is retryable after reauthentication.

    return false;
  }

  /**
   * `enqueueTask` enqueues the given task to the task queue.
   */
  private enqueueTask(task: () => Promise<any>): Promise<any> {
    return new Promise((resolve, reject) => {
      this.taskQueue.push(() => task().then(resolve).catch(reject));

      if (!this.processing) {
        this.processNext();
      }
    });
  }

  /**
   * `processNext` processes the next task in the task queue. This method is
   * part of enqueueTask.
   */
  private async processNext() {
    if (this.taskQueue.length === 0) {
      this.processing = false;
      return;
    }

    try {
      this.processing = true;
      const task = this.taskQueue.shift()!;
      await task();
    } catch (error) {
      logger.error(`[TQ] c:"${this.getKey()}" process failed, id:"${this.id}"`);
    }

    this.processNext();
  }
}
