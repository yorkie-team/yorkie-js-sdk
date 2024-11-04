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
import {
  converter,
  errorCodeOf,
  errorMetadataOf,
} from '@yorkie-js-sdk/src/api/converter';
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
import { validateSerializable } from '../util/validator';
import { Json, BroadcastOptions } from '@yorkie-js-sdk/src/document/document';

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
   * `authTokenInjector` is a function to provide a token that will be passed to
   * the auth webhook. If the token becomes invalid or expires, this function
   * will be called again with the authError parameter, allowing for token refresh.
   * `authError` is optional parameter containing error information if the previous
   * token was invalid or expired.
   */
  authTokenInjector?: (authErrorMessage?: string) => Promise<string>;

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

  /**
   * `retryRequestDelay` defines the waiting time between retry attempts.
   * The default value is `1000`(ms).
   */
  retryRequestDelay?: number;

  /**
   * `maxRequestRetries` limits the maximum number of retry attempts for requests
   * when a connectRPC error occurs and requires a retry. The default value is 3.
   * This value must be greater than 0 to enable retry requests after token refresh.
   */
  maxRequestRetries?: number;
}

/**
 * `DefaultClientOptions` is the default options for Client.
 */
const DefaultClientOptions = {
  syncLoopDuration: 50,
  retrySyncLoopDelay: 1000,
  reconnectStreamDelay: 1000,
  retryRequestDelay: 1000,
  maxRequestRetries: 3,
};

/**
 * `DefaultBroadcastOptions` is the default options for broadcast.
 */
const DefaultBroadcastOptions = {
  maxRetries: Infinity,
  initialRetryInterval: 1000,
  maxBackoff: 20000,
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
  private authTokenInjector?: (authErrorMessage?: string) => Promise<string>;
  private conditions: Record<ClientCondition, boolean>;
  private syncLoopDuration: number;
  private reconnectStreamDelay: number;
  private retrySyncLoopDelay: number;
  private retryRequestDelay: number;
  private maxRequestRetries: number;

  private rpcAddr: string;
  private rpcClient?: PromiseClient<typeof YorkieService>;
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
    this.authTokenInjector = opts.authTokenInjector;
    this.conditions = {
      [ClientCondition.SyncLoop]: false,
      [ClientCondition.WatchLoop]: false,
    };
    this.syncLoopDuration =
      opts.syncLoopDuration ?? DefaultClientOptions.syncLoopDuration;
    this.reconnectStreamDelay =
      opts.reconnectStreamDelay ?? DefaultClientOptions.reconnectStreamDelay;
    this.retrySyncLoopDelay =
      opts.retrySyncLoopDelay ?? DefaultClientOptions.retrySyncLoopDelay;
    this.retryRequestDelay =
      opts.retryRequestDelay ?? DefaultClientOptions.retryRequestDelay;
    this.maxRequestRetries =
      opts.maxRequestRetries ?? DefaultClientOptions.maxRequestRetries;
    this.rpcAddr = rpcAddr;

    this.taskQueue = [];
  }

  /**
   * `activate` activates this client. That is, it registers itself to the server
   * and receives a unique ID from the server. The given ID is used to
   * distinguish different clients.
   */
  public async activate(): Promise<void> {
    if (this.isActive()) {
      return Promise.resolve();
    }

    // Here we make the client itself, combining the service
    // definition with the transport.
    const token = this.authTokenInjector && (await this.authTokenInjector());
    this.rpcClient = createPromiseClient(
      YorkieService,
      createGrpcWebTransport({
        baseUrl: this.rpcAddr,
        interceptors: [
          createAuthInterceptor(this.apiKey, token),
          createMetricInterceptor(),
        ],
      }),
    );

    return this.enqueueTask(async () => {
      const requestActivateClient = async (retryCount = 0): Promise<void> => {
        return this.rpcClient!.activateClient(
          { clientKey: this.key },
          { headers: { 'x-shard-key': this.apiKey } },
        )
          .then((res) => {
            this.id = res.clientId;
            this.status = ClientStatus.Activated;
            this.runSyncLoop();
            logger.info(`[AC] c:"${this.getKey()}" activated, id:"${this.id}`);
          })
          .catch(async (err) => {
            if (retryCount >= this.maxRequestRetries) {
              logger.error(
                `[AC] c:"${this.getKey()}" max retries (${
                  this.maxRequestRetries
                }) exceeded`,
              );
              throw err;
            }

            if (await this.handleConnectError(err)) {
              await delay(this.retryRequestDelay);
              return requestActivateClient(retryCount + 1);
            }

            logger.error(`[AC] c:"${this.getKey()}" err :`, err);
            throw err;
          });
      };
      return requestActivateClient();
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
      const requestDeactivateClient = async (retryCount = 0): Promise<void> => {
        return this.rpcClient!.deactivateClient(
          { clientId: this.id! },
          { headers: { 'x-shard-key': this.apiKey } },
        )
          .then(() => {
            this.deactivateInternal();
            logger.info(`[DC] c"${this.getKey()}" deactivated`);
          })
          .catch(async (err) => {
            if (retryCount >= this.maxRequestRetries) {
              logger.error(
                `[DC] c:"${this.getKey()}" max retries (${
                  this.maxRequestRetries
                }) exceeded, id:"${this.id}`,
              );
              throw err;
            }

            if (await this.handleConnectError(err)) {
              await delay(this.retryRequestDelay);
              return requestDeactivateClient(retryCount + 1);
            }

            logger.error(`[DC] c:"${this.getKey()}" err :`, err);
            throw err;
          });
      };
      return requestDeactivateClient();
    });
  }

  /**
   * `attach` attaches the given document to this client. It tells the server that
   * this client will synchronize the given document.
   */
  public attach<T, P extends Indexable>(
    doc: Document<T, P>,
    options: {
      initialRoot?: T;
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
    const unsubscribeBroacastEvent = doc.subscribe(
      'local-broadcast',
      async (event) => {
        const { topic, payload } = event.value;
        const errorFn = event.options?.error;
        const options = event.options;

        try {
          await this.broadcast(doc.getKey(), topic, payload, options);
        } catch (error: unknown) {
          if (error instanceof Error) {
            errorFn?.(error);
          }
        }
      },
    );

    const syncMode = options.syncMode ?? SyncMode.Realtime;
    return this.enqueueTask(async () => {
      const requestAttachDocument = async (
        retryCount = 0,
      ): Promise<Document<T, P>> => {
        return this.rpcClient!.attachDocument(
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
                unsubscribeBroacastEvent,
              ),
            );

            if (syncMode !== SyncMode.Manual) {
              await this.runWatchLoop(doc.getKey());
            }

            logger.info(
              `[AD] c:"${this.getKey()}" attaches d:"${doc.getKey()}"`,
            );

            const crdtObject = doc.getRootObject();
            if (options.initialRoot) {
              const initialRoot = options.initialRoot;
              doc.update((root) => {
                for (const [k, v] of Object.entries(initialRoot)) {
                  if (!crdtObject.has(k)) {
                    const key = k as keyof T;
                    root[key] = v as any;
                  }
                }
              });
            }

            return doc;
          })
          .catch(async (err) => {
            if (retryCount >= this.maxRequestRetries) {
              logger.error(
                `[AD] c:"${this.getKey()}" max retries (${
                  this.maxRequestRetries
                }) exceeded, id:"${this.id}`,
              );
              throw err;
            }

            if (await this.handleConnectError(err)) {
              if (
                err instanceof ConnectError &&
                errorCodeOf(err) === Code.ErrUnauthenticated
              ) {
                doc.publish([
                  {
                    type: DocEventType.AuthError,
                    value: {
                      reason: errorMetadataOf(err).reason,
                      method: 'AttachDocument',
                    },
                  },
                ]);
              }
              await delay(this.retryRequestDelay);
              return requestAttachDocument(retryCount + 1);
            }

            logger.error(`[AD] c:"${this.getKey()}" err :`, err);
            throw err;
          });
      };
      return requestAttachDocument();
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
      const requestDetachDocument = async (
        retryCount = 0,
      ): Promise<Document<T, P>> => {
        return this.rpcClient!.detachDocument(
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

            logger.info(
              `[DD] c:"${this.getKey()}" detaches d:"${doc.getKey()}"`,
            );
            return doc;
          })
          .catch(async (err) => {
            if (retryCount >= this.maxRequestRetries) {
              logger.error(
                `[DD] c:"${this.getKey()}" max retries (${
                  this.maxRequestRetries
                }) exceeded, id:"${this.id}`,
              );
              throw err;
            }

            if (await this.handleConnectError(err)) {
              if (
                err instanceof ConnectError &&
                errorCodeOf(err) === Code.ErrUnauthenticated
              ) {
                doc.publish([
                  {
                    type: DocEventType.AuthError,
                    value: {
                      reason: errorMetadataOf(err).reason,
                      method: 'DetachDocument',
                    },
                  },
                ]);
              }
              await delay(this.retryRequestDelay);
              return requestDetachDocument(retryCount + 1);
            }

            logger.error(`[DD] c:"${this.getKey()}" err :`, err);
            throw err;
          });
      };
      return requestDetachDocument();
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
      return this.rpcClient!.removeDocument(
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
   * `broadcast` broadcasts the given payload to the given topic.
   */
  public broadcast(
    docKey: DocumentKey,
    topic: string,
    payload: Json,
    options?: BroadcastOptions,
  ): Promise<void> {
    if (!this.isActive()) {
      throw new YorkieError(
        Code.ErrClientNotActivated,
        `${this.key} is not active`,
      );
    }
    const attachment = this.attachmentMap.get(docKey);
    if (!attachment) {
      throw new YorkieError(
        Code.ErrDocumentNotAttached,
        `${docKey} is not attached`,
      );
    }

    if (!validateSerializable(payload)) {
      throw new YorkieError(
        Code.ErrInvalidArgument,
        'payload is not serializable',
      );
    }

    const maxRetries =
      options?.maxRetries ?? DefaultBroadcastOptions.maxRetries;
    const maxBackoff = DefaultBroadcastOptions.maxBackoff;

    let retryCount = 0;

    const exponentialBackoff = (retryCount: number) => {
      const retryInterval = Math.min(
        DefaultBroadcastOptions.initialRetryInterval * 2 ** retryCount,
        maxBackoff,
      );
      return retryInterval;
    };

    const doLoop = async (): Promise<any> => {
      return this.enqueueTask(async () => {
        return this.rpcClient!.broadcast(
          {
            clientId: this.id!,
            documentId: attachment.docID,
            topic,
            payload: new TextEncoder().encode(JSON.stringify(payload)),
          },
          { headers: { 'x-shard-key': `${this.apiKey}/${docKey}` } },
        )
          .then(() => {
            logger.info(
              `[BC] c:"${this.getKey()}" broadcasts d:"${docKey}" t:"${topic}"`,
            );
          })
          .catch(async (err) => {
            logger.error(`[BC] c:"${this.getKey()}" err:`, err);
            if (await this.handleConnectError(err)) {
              if (retryCount < maxRetries) {
                retryCount++;
                setTimeout(() => doLoop(), exponentialBackoff(retryCount - 1));
                logger.info(
                  `[BC] c:"${this.getKey()}" retry attempt ${retryCount}/${maxRetries}`,
                );
              } else {
                logger.error(
                  `[BC] c:"${this.getKey()}" exceeded maximum retry attempts`,
                );

                // Stop retrying after maxRetries
                throw err;
              }
            } else {
              // Stop retrying if the error is not retryable
              throw err;
            }
          });
      });
    };

    return doLoop();
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
        .catch(async (err) => {
          logger.error(`[SL] c:"${this.getKey()}" sync failed:`, err);

          if (await this.handleConnectError(err)) {
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
    let retryCount = 0;
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
        const stream = this.rpcClient!.watchDocument(
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

              if (await this.handleConnectError(err)) {
                if (
                  err instanceof ConnectError &&
                  errorCodeOf(err) === Code.ErrUnauthenticated
                ) {
                  if (retryCount >= this.maxRequestRetries) {
                    logger.error(
                      `[WD] c:"${this.getKey()}" max retries (${
                        this.maxRequestRetries
                      }) exceeded`,
                    );
                    reject(err);
                    return;
                  }
                  attachment.doc.publish([
                    {
                      type: DocEventType.AuthError,
                      value: {
                        reason: errorMetadataOf(err).reason,
                        method: 'WatchDocuments',
                      },
                    },
                  ]);
                }
                onDisconnect();
                retryCount++;
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
    attachment.unsubscribeBroadcastEvent();
    this.attachmentMap.delete(docKey);
  }

  private syncInternal<T, P extends Indexable>(
    attachment: Attachment<T, P>,
    syncMode: SyncMode,
  ): Promise<Document<T, P>> {
    const { doc, docID } = attachment;

    const reqPack = doc.createChangePack();
    const requestPushPullChanges = async (
      retryCount = 0,
    ): Promise<Document<T, P>> => {
      return this.rpcClient!.pushPullChanges(
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
        .catch(async (err) => {
          if (retryCount >= this.maxRequestRetries) {
            doc.publish([
              {
                type: DocEventType.SyncStatusChanged,
                value: DocumentSyncStatus.SyncFailed,
              },
            ]);
            logger.error(
              `[PP] c:"${this.getKey()}" max retries (${
                this.maxRequestRetries
              }) exceeded`,
            );
            throw err;
          }

          if (await this.handleConnectError(err)) {
            if (
              err instanceof ConnectError &&
              errorCodeOf(err) === Code.ErrUnauthenticated
            ) {
              doc.publish([
                {
                  type: DocEventType.AuthError,
                  value: {
                    reason: errorMetadataOf(err).reason,
                    method: 'PushPull',
                  },
                },
              ]);
              await delay(this.retryRequestDelay);
              return requestPushPullChanges(retryCount + 1);
            }
          }

          doc.publish([
            {
              type: DocEventType.SyncStatusChanged,
              value: DocumentSyncStatus.SyncFailed,
            },
          ]);
          logger.error(`[PP] c:"${this.getKey()}" err :`, err);
          throw err;
        });
    };
    return requestPushPullChanges();
  }

  /**
   * `handleConnectError` handles the given error. If the given error can be
   * retried after handling, it returns true.
   */
  private async handleConnectError(err: any): Promise<boolean> {
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

    // NOTE(chacha912): If the error is `Unauthenticated`, it means that the
    // token is invalid or expired. In this case, the client gets a new token
    // from the `authTokenInjector` and retries the api call.
    if (errorCodeOf(err) === Code.ErrUnauthenticated) {
      const token =
        this.authTokenInjector &&
        (await this.authTokenInjector(errorMetadataOf(err).reason));

      this.rpcClient = createPromiseClient(
        YorkieService,
        createGrpcWebTransport({
          baseUrl: this.rpcAddr,
          interceptors: [
            createAuthInterceptor(this.apiKey, token),
            createMetricInterceptor(),
          ],
        }),
      );
      return true;
    }

    // NOTE(hackerwins): Some errors should fix the state of the client.
    if (
      errorCodeOf(err) === Code.ErrClientNotActivated ||
      errorCodeOf(err) === Code.ErrClientNotFound
    ) {
      this.deactivateInternal();
    }

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
