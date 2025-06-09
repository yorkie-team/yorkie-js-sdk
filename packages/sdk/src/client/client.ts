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

import { ActorID } from '@yorkie-js/sdk/src/document/time/actor_id';
import {
  createClient as createConnectClient,
  Client as ConnectClient,
  ConnectError,
  Code as ConnectCode,
} from '@connectrpc/connect';
import { createGrpcWebTransport } from '@connectrpc/connect-web';
import { YorkieService } from '@yorkie-js/sdk/src/api/yorkie/v1/yorkie_connect';
import { WatchDocumentResponse } from '@yorkie-js/sdk/src/api/yorkie/v1/yorkie_pb';
import { DocEventType as PbDocEventType } from '@yorkie-js/sdk/src/api/yorkie/v1/resources_pb';
import {
  converter,
  errorCodeOf,
  errorMetadataOf,
} from '@yorkie-js/sdk/src/api/converter';
import { Code, YorkieError } from '@yorkie-js/sdk/src/util/error';
import { logger } from '@yorkie-js/sdk/src/util/logger';
import { uuid } from '@yorkie-js/sdk/src/util/uuid';
import { Attachment, WatchStream } from '@yorkie-js/sdk/src/client/attachment';
import {
  Document,
  DocKey,
  DocStatus,
  Indexable,
  DocEventType,
  StreamConnectionStatus,
  DocSyncStatus,
} from '@yorkie-js/sdk/src/document/document';
import { OpSource } from '@yorkie-js/sdk/src/document/operation/operation';
import { createAuthInterceptor } from '@yorkie-js/sdk/src/client/auth_interceptor';
import { createMetricInterceptor } from '@yorkie-js/sdk/src/client/metric_interceptor';
import { validateSerializable } from '../util/validator';
import { Json, BroadcastOptions } from '@yorkie-js/sdk/src/document/document';

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
   * `rpcAddr` is the address of the RPC server. It is used to connect to
   * the server.
   */
  rpcAddr?: string;

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
   * `metadata` is the metadata of the client. It is used to store additional
   * information about the client.
   */
  metadata?: Record<string, string>;

  /**
   * `authTokenInjector` is a function that provides a token for the auth webhook.
   * When the webhook response status code is 401, this function is called to refresh the token.
   * The `reason` parameter is the reason from the webhook response.
   */
  authTokenInjector?: (reason?: string) => Promise<string>;

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
   * `userAgent` is the user agent of the client. It is used to identify the
   * client.
   */
  userAgent?: string;
}

/**
 * `AttachOptions` are user-settable options used when attaching documents.
 */
export interface AttachOptions<R, P> {
  /**
   * `initialRoot` is the initial root of the document. It is used to
   * initialize the document. It is used when the fields are not set in the
   * document.
   */
  initialRoot?: R;

  /**
   * `initialPresence` is the initial presence of the client.
   */
  initialPresence?: P;

  /**
   * `syncMode` defines the synchronization mode of the document.
   */
  syncMode?: SyncMode;

  /**
   * `schema` is the schema of the document. It is used to validate the
   * document.
   */
  schema?: string;
}

/**
 * `DefaultClientOptions` is the default options for Client.
 */
const DefaultClientOptions = {
  rpcAddr: 'https://api.yorkie.dev',
  syncLoopDuration: 50,
  retrySyncLoopDelay: 1000,
  reconnectStreamDelay: 1000,
};

/**
 * `DefaultBroadcastOptions` is the default options for broadcast.
 */
const DefaultBroadcastOptions = {
  maxRetries: Infinity,
  initialRetryInterval: 1000,
  maxBackoff: 20000,
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
  private metadata: Record<string, string>;
  private status: ClientStatus;
  private attachmentMap: Map<DocKey, Attachment<unknown, any>>;

  private apiKey: string;
  private authTokenInjector?: (reason?: string) => Promise<string>;
  private conditions: Record<ClientCondition, boolean>;
  private syncLoopDuration: number;
  private reconnectStreamDelay: number;
  private retrySyncLoopDelay: number;

  private rpcClient: ConnectClient<typeof YorkieService>;
  private setAuthToken: (token: string) => void;
  private taskQueue: Array<() => Promise<any>>;
  private processing = false;
  private keepalive = false;

  /**
   * @param rpcAddr - the address of the RPC server.
   * @param opts - the options of the client.
   */
  constructor(opts?: ClientOptions) {
    opts = opts || DefaultClientOptions;

    const rpcAddr = opts.rpcAddr || DefaultClientOptions.rpcAddr;
    this.key = opts.key || uuid();
    this.metadata = opts.metadata || {};
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

    const { authInterceptor, setToken } = createAuthInterceptor(this.apiKey);
    this.setAuthToken = setToken;

    // Here we make the client itself, combining the service
    // definition with the transport.
    this.rpcClient = createConnectClient(
      YorkieService,
      createGrpcWebTransport({
        baseUrl: rpcAddr,
        interceptors: [
          authInterceptor,
          createMetricInterceptor(opts?.userAgent),
        ],
        fetch: (input, init) => {
          const newInit = {
            ...init,
            keepalive: this.keepalive,
          };

          return fetch(input as RequestInfo, newInit);
        },
      }),
    );
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

    if (this.authTokenInjector) {
      const token = await this.authTokenInjector();
      this.setAuthToken(token);
    }

    return this.enqueueTask(async () => {
      try {
        const res = await this.rpcClient.activateClient(
          {
            clientKey: this.key,
            metadata: this.metadata,
          },
          { headers: { 'x-shard-key': this.apiKey } },
        );

        this.id = res.clientId;
        this.status = ClientStatus.Activated;
        this.runSyncLoop();

        logger.info(`[AC] c:"${this.getKey()}" activated, id:"${this.id}"`);

        // NOTE(hackerwins): Set up beforeunload event to deactivate the client
        // when the page is being unloaded.
        if (typeof window !== 'undefined') {
          window.addEventListener('beforeunload', async () => {
            await this.deactivate({ keepalive: true });
          });
        }
      } catch (err) {
        logger.error(`[AC] c:"${this.getKey()}" err :`, err);
        await this.handleConnectError(err);
        throw err;
      }
    });
  }

  /**
   * `deactivate` deactivates this client.
   *
   * @param options - If keepalive is true, the client will request deactivation
   * immediately using `fetch` with the `keepalive` option enabled. This is
   * useful for ensuring the deactivation request completes even if the page is
   * being unloaded, such as in `beforeunload` or `unload` event listeners.
   */
  public deactivate(options = { keepalive: false }): Promise<void> {
    if (this.status === ClientStatus.Deactivated) {
      return Promise.resolve();
    }

    const task = async () => {
      try {
        await this.rpcClient.deactivateClient(
          { clientId: this.id! },
          { headers: { 'x-shard-key': this.apiKey } },
        );
        this.deactivateInternal();
        logger.info(`[DC] c"${this.getKey()}" deactivated`);
      } catch (err) {
        logger.error(`[DC] c:"${this.getKey()}" err :`, err);
        await this.handleConnectError(err);
        throw err;
      }
    };

    if (options.keepalive) {
      this.keepalive = true;
      const resp = task();
      this.keepalive = false;
      return resp;
    }

    return this.enqueueTask(task);
  }

  /**
   * `hasDocument` checks if the given document is attached to this client.
   * @param docKey - the key of the document.
   * @returns true if the document is attached to this client.
   */
  public hasDocument(docKey: DocKey): boolean {
    return this.attachmentMap.has(docKey);
  }

  /**
   * `attach` attaches the given document to this client. It tells the server that
   * this client will synchronize the given document.
   */
  public attach<R, P extends Indexable>(
    doc: Document<R, P>,
    opts: AttachOptions<R, P> = {},
  ): Promise<Document<R, P>> {
    // 01. Check if the client is ready to attach documents.
    if (!this.isActive()) {
      throw new YorkieError(
        Code.ErrClientNotActivated,
        `${this.key} is not active`,
      );
    }
    if (doc.getStatus() !== DocStatus.Detached) {
      throw new YorkieError(
        Code.ErrDocumentNotDetached,
        `${doc.getKey()} is not detached`,
      );
    }

    doc.setActor(this.id!);
    doc.update((_, p) => p.set(opts.initialPresence || {}));

    // 02. Subscribe local broadcast event.
    const unsub = doc.subscribe('local-broadcast', async (event) => {
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
    });

    // 03. Attach the document to the client.
    const syncMode = opts.syncMode ?? SyncMode.Realtime;
    return this.enqueueTask(async () => {
      try {
        const res = await this.rpcClient.attachDocument(
          {
            clientId: this.id!,
            changePack: converter.toChangePack(doc.createChangePack()),
            schema: opts.schema,
          },
          { headers: { 'x-shard-key': `${this.apiKey}/${doc.getKey()}` } },
        );

        const maxSize = res.maxSizePerDocument ?? 0;
        if (maxSize > 0) {
          doc.setMaxSizePerDocument(res.maxSizePerDocument);
        }
        if (res.schemaRules.length > 0) {
          doc.setSchemaRules(converter.fromSchemaRules(res.schemaRules));
        }

        const pack = converter.fromChangePack<P>(res.changePack!);
        doc.applyChangePack(pack);

        if (doc.getStatus() === DocStatus.Removed) {
          return doc;
        }

        doc.applyStatus(DocStatus.Attached);
        this.attachmentMap.set(
          doc.getKey(),
          new Attachment(
            this.reconnectStreamDelay,
            doc,
            res.documentId,
            syncMode,
            unsub,
          ),
        );

        if (syncMode !== SyncMode.Manual) {
          await this.runWatchLoop(doc.getKey());
        }

        logger.info(`[AD] c:"${this.getKey()}" attaches d:"${doc.getKey()}"`);

        const crdtObject = doc.getRootObject();
        if (opts.initialRoot) {
          const initialRoot = opts.initialRoot;
          doc.update((root) => {
            for (const [k, v] of Object.entries(initialRoot)) {
              if (!crdtObject.has(k)) {
                const key = k as keyof R;
                root[key] = v as any;
              }
            }
          });
        }

        return doc;
      } catch (err) {
        logger.error(`[AD] c:"${this.getKey()}" err :`, err);
        await this.handleConnectError(err);
        throw err;
      }
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
  public detach<R, P extends Indexable>(
    doc: Document<R, P>,
    opts: {
      removeIfNotAttached?: boolean;
      keepalive?: boolean;
    } = { keepalive: false },
  ): Promise<Document<R, P>> {
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

    const task = async () => {
      try {
        const res = await this.rpcClient.detachDocument(
          {
            clientId: this.id!,
            documentId: attachment.docID,
            changePack: converter.toChangePack(doc.createChangePack()),
            removeIfNotAttached: opts.removeIfNotAttached ?? false,
          },
          { headers: { 'x-shard-key': `${this.apiKey}/${doc.getKey()}` } },
        );

        const pack = converter.fromChangePack<P>(res.changePack!);
        doc.applyChangePack(pack);

        if (doc.getStatus() !== DocStatus.Removed) {
          doc.applyStatus(DocStatus.Detached);
        }

        this.detachInternal(doc.getKey());
        logger.info(`[DD] c:"${this.getKey()}" detaches d:"${doc.getKey()}"`);
        return doc;
      } catch (err) {
        logger.error(`[DD] c:"${this.getKey()}" err :`, err);
        await this.handleConnectError(err);
        throw err;
      }
    };

    if (opts.keepalive) {
      this.keepalive = true;
      const resp = task();
      this.keepalive = false;
      return resp;
    }

    return this.enqueueTask(task);
  }

  /**
   * `changeRealtimeSync` changes the synchronization mode of the given document.
   */
  public async changeSyncMode<R, P extends Indexable>(
    doc: Document<R, P>,
    syncMode: SyncMode,
  ): Promise<Document<R, P>> {
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
  public sync<R, P extends Indexable>(
    doc?: Document<R, P>,
  ): Promise<Array<Document<R, P>>> {
    if (!this.isActive()) {
      throw new YorkieError(
        Code.ErrClientNotActivated,
        `${this.key} is not active`,
      );
    }
    if (doc) {
      // prettier-ignore
      const attachment = this.attachmentMap.get(doc.getKey()) as Attachment<R, P>;
      if (!attachment) {
        throw new YorkieError(
          Code.ErrDocumentNotAttached,
          `${doc.getKey()} is not attached`,
        );
      }
      return this.enqueueTask(async () => {
        return this.syncInternal(attachment, SyncMode.Realtime).catch(
          async (err) => {
            logger.error(`[SY] c:"${this.getKey()}" err :`, err);
            await this.handleConnectError(err);
            throw err;
          },
        );
      });
    }

    return this.enqueueTask(async () => {
      const promises = [];
      for (const [, attachment] of this.attachmentMap) {
        promises.push(this.syncInternal(attachment, attachment.syncMode));
      }
      return Promise.all(promises).catch(async (err) => {
        logger.error(`[SY] c:"${this.getKey()}" err :`, err);
        await this.handleConnectError(err);
        throw err;
      });
    });
  }

  /**
   * `remove` removes the given document.
   */
  public remove<R, P extends Indexable>(doc: Document<R, P>): Promise<void> {
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
      try {
        const res = await this.rpcClient.removeDocument(
          {
            clientId: this.id!,
            documentId: attachment.docID,
            changePack: pbChangePack,
          },
          { headers: { 'x-shard-key': `${this.apiKey}/${doc.getKey()}` } },
        );

        const pack = converter.fromChangePack<P>(res.changePack!);
        doc.applyChangePack(pack);
        this.detachInternal(doc.getKey());

        logger.info(`[RD] c:"${this.getKey()}" removes d:"${doc.getKey()}"`);
      } catch (err) {
        logger.error(`[RD] c:"${this.getKey()}" err :`, err);
        await this.handleConnectError(err);
        throw err;
      }
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
    docKey: DocKey,
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

    const doLoop = async (): Promise<void> => {
      return this.enqueueTask(async () => {
        try {
          await this.rpcClient.broadcast(
            {
              clientId: this.id!,
              documentId: attachment.docID,
              topic,
              payload: new TextEncoder().encode(JSON.stringify(payload)),
            },
            { headers: { 'x-shard-key': `${this.apiKey}/${docKey}` } },
          );

          logger.info(
            `[BC] c:"${this.getKey()}" broadcasts d:"${docKey}" t:"${topic}"`,
          );
        } catch (err) {
          logger.error(`[BC] c:"${this.getKey()}" err:`, err);

          if (await this.handleConnectError(err)) {
            if (
              err instanceof ConnectError &&
              errorCodeOf(err) === Code.ErrUnauthenticated
            ) {
              attachment.doc.publish([
                {
                  type: DocEventType.AuthError,
                  value: {
                    reason: errorMetadataOf(err).reason,
                    method: 'Broadcast',
                  },
                },
              ]);
            }

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
              throw err; // Stop retrying after maxRetries
            }
          } else {
            throw err; // Stop retrying if the error is not retryable
          }
        }
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
          syncJobs.push(
            this.syncInternal(attachment, attachment.syncMode).catch(
              async (err) => {
                if (
                  err instanceof ConnectError &&
                  errorCodeOf(err) === Code.ErrUnauthenticated
                ) {
                  attachment.doc.publish([
                    {
                      type: DocEventType.AuthError,
                      value: {
                        reason: errorMetadataOf(err).reason,
                        method: 'PushPull',
                      },
                    },
                  ]);
                }
                throw err;
              },
            ),
          );
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
  private async runWatchLoop(docKey: DocKey): Promise<void> {
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

              if (await this.handleConnectError(err)) {
                if (
                  err instanceof ConnectError &&
                  errorCodeOf(err) === Code.ErrUnauthenticated
                ) {
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

  private handleWatchDocumentsResponse<R, P extends Indexable>(
    attachment: Attachment<R, P>,
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
      attachment.doc.applyStatus(DocStatus.Detached);
    }
  }

  private detachInternal(docKey: DocKey) {
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

  private async syncInternal<R, P extends Indexable>(
    attachment: Attachment<R, P>,
    syncMode: SyncMode,
  ): Promise<Document<R, P>> {
    const { doc, docID } = attachment;

    const reqPack = doc.createChangePack();
    try {
      const res = await this.rpcClient.pushPullChanges(
        {
          clientId: this.id!,
          documentId: docID,
          changePack: converter.toChangePack(reqPack),
          pushOnly: syncMode === SyncMode.RealtimePushOnly,
        },
        { headers: { 'x-shard-key': `${this.apiKey}/${doc.getKey()}` } },
      );

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
          value: DocSyncStatus.Synced,
        },
      ]);

      // NOTE(chacha912): If a document has been removed, watchStream should
      // be disconnected to not receive an event for that document.
      if (doc.getStatus() === DocStatus.Removed) {
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
    } catch (err) {
      doc.publish([
        {
          type: DocEventType.SyncStatusChanged,
          value: DocSyncStatus.SyncFailed,
        },
      ]);
      logger.error(`[PP] c:"${this.getKey()}" err :`, err);
      throw err;
    }
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
      err.code === ConnectCode.Canceled ||
      err.code === ConnectCode.Unknown ||
      err.code === ConnectCode.ResourceExhausted ||
      err.code === ConnectCode.Unavailable
    ) {
      return true;
    }

    // NOTE(chacha912): If the error is `Unauthenticated`, it means that the
    // token is invalid or expired. In this case, the client gets a new token
    // from the `authTokenInjector` and retries the api call.
    if (errorCodeOf(err) === Code.ErrUnauthenticated) {
      if (this.authTokenInjector) {
        const token = await this.authTokenInjector(errorMetadataOf(err).reason);
        this.setAuthToken(token);
      }
      return true;
    }

    // NOTE(emplam27): If the error is 'ErrTooManySubscribers' it means,
    // that the document has reached the maximum number of allowed subscriptions.
    // In this case, the client should retry the connection.
    if (errorCodeOf(err) === Code.ErrTooManySubscribers) {
      logger.error(`[WD] c:"${this.getKey()}" err :`, err.rawMessage);
      return true;
    }

    // NOTE(emplam27): If the error is 'ErrTooManyAttachments' it means,
    // that the client has reached the maximum number of allowed attachments.
    // In this case, the client should remove some attachments.
    if (errorCodeOf(err) === Code.ErrTooManyAttachments) {
      return false;
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
