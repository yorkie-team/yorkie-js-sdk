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
import {
  YorkieService,
  WatchResponse,
} from '@yorkie-js/sdk/src/api/yorkie/v1/yorkie_pb';
import {
  DocEventType as PbDocEventType,
  ChannelEvent_Type as PbChannelEventType,
} from '@yorkie-js/sdk/src/api/yorkie/v1/resources_pb';
import {
  converter,
  errorCodeOf,
  errorMetadataOf,
  isErrorCode,
} from '@yorkie-js/sdk/src/api/converter';
import { RevisionSummary } from '@yorkie-js/sdk/src/api/revision';
import { Code, YorkieError } from '@yorkie-js/sdk/src/util/error';
import { logger } from '@yorkie-js/sdk/src/util/logger';
import { uuid } from '@yorkie-js/sdk/src/util/uuid';
import { Attachment, WatchStream } from '@yorkie-js/sdk/src/client/attachment';
import {
  Document,
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
import {
  Channel,
  ChannelStatus,
  ChannelEventType,
  BroadcastOptions,
} from '@yorkie-js/sdk/src/channel/channel';
import { Attachable } from './attachable';
import { runWatchStream } from '@yorkie-js/sdk/src/client/watch';

/**
 * `Key` is a string representing the key of Document or Channel.
 */
type Key = string;

/**
 * `SyncMode` defines synchronization modes for the PushPullChanges API.
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
   * `channelHeartbeatInterval` is the interval of the channel heartbeat.
   * The client sends a heartbeat to the server to refresh the channel TTL.
   * The default value is `30000`(ms).
   */
  channelHeartbeatInterval?: number;

  /**
   * `userAgent` is the user agent of the client. It is used to identify the
   * client.
   */
  userAgent?: string;
}

/**
 * `DeactivateOptions` are user-settable options used when deactivating clients.
 */
export interface DeactivateOptions {
  /**
   * `keepalive` is used to enable the keepalive option when deactivating.
   * If true, the client will request deactivation immediately using `fetch`
   * with the `keepalive` option enabled. This is useful for ensuring the
   * deactivation request completes even if the page is being unloaded.
   */
  keepalive?: boolean;

  /**
   * `synchronous` is used to enable the synchronous option when deactivating.
   * If true, the server will wait for all pending operations to complete
   * before deactivating.
   */
  synchronous?: boolean;
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
 * `AttachChannelOptions` are user-settable options used when attaching channels.
 */
export interface AttachChannelOptions {
  /**
   * `isRealtime` determines whether to automatically watch channel changes
   * and send heartbeats. If false (manual mode), the client must call sync()
   * explicitly to refresh the TTL.
   * Default is true for backward compatibility.
   */
  isRealtime?: boolean;
}

/**
 * `DefaultClientOptions` is the default options for Client.
 */
const DefaultClientOptions = {
  rpcAddr: 'https://api.yorkie.dev',
  syncLoopDuration: 50,
  retrySyncLoopDelay: 1000,
  reconnectStreamDelay: 1000,
  channelHeartbeatInterval: 30000,
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
 */
export class Client {
  private id?: ActorID;
  private key: string;
  private metadata: Record<string, string>;
  private status: ClientStatus;
  private attachmentMap: Map<string, Attachment<Attachable>>;

  private apiKey: string;
  private authTokenInjector?: (reason?: string) => Promise<string>;
  private conditions: Record<ClientCondition, boolean>;
  private syncLoopDuration: number;
  private reconnectStreamDelay: number;
  private retrySyncLoopDelay: number;
  private channelHeartbeatInterval: number;

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
    this.channelHeartbeatInterval =
      opts.channelHeartbeatInterval ??
      DefaultClientOptions.channelHeartbeatInterval;

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
          return fetch(input as RequestInfo, {
            ...init,
            keepalive: this.keepalive,
          });
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
          { headers: { 'x-shard-key': `${this.apiKey}/${this.key}` } },
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
   * If synchronous is true, the server will wait for all pending operations to
   * complete before deactivating.
   */
  public deactivate(
    options: DeactivateOptions = { keepalive: false, synchronous: false },
  ): Promise<void> {
    if (this.status === ClientStatus.Deactivated) {
      return Promise.resolve();
    }

    const task = async () => {
      try {
        await this.rpcClient.deactivateClient(
          {
            clientId: this.id!,
            synchronous: options.synchronous,
          },
          { headers: { 'x-shard-key': `${this.apiKey}/${this.key}` } },
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
   * `has` checks if the given resource is attached to this client.
   * @param key - the key of the resource.
   * @returns true if the resource is attached to this client.
   */
  public has(key: Key): boolean {
    return this.attachmentMap.has(key);
  }

  /**
   * `attach` attaches a Document or Channel to this client.
   * Overloaded to support both types.
   */
  public attach<R, P extends Indexable>(
    resource: Document<R, P>,
    opts?: AttachOptions<R, P>,
  ): Promise<Document<R, P>>;

  /**
   * `attach` attaches the given channel to this client. It tells the server that
   * this client will track the channel.
   */
  public attach(
    resource: Channel,
    opts?: AttachChannelOptions,
  ): Promise<Channel>;

  /**
   * `attach` attaches a Document or Channel to this client.
   * Overloaded to support both types.
   */
  public attach<R, P extends Indexable>(
    resource: Document<R, P> | Channel,
    opts?: AttachOptions<R, P> | AttachChannelOptions,
  ): Promise<Document<R, P> | Channel> {
    if (resource instanceof Channel) {
      return this.attachChannel(resource, opts as AttachChannelOptions);
    } else {
      return this.attachDocument(resource, opts as AttachOptions<R, P>);
    }
  }

  /**
   * `attach` attaches the given document to this client. It tells the server that
   * this client will synchronize the given document.
   */
  private attachDocument<R, P extends Indexable>(
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
        Code.ErrNotDetached,
        `${doc.getKey()} is not detached`,
      );
    }

    doc.setActor(this.id!);
    doc.update((_, p) => p.set(opts.initialPresence || {}));

    // 02. Attach the document to the client.
    const syncMode = opts.syncMode ?? SyncMode.Realtime;
    return this.enqueueTask(async () => {
      try {
        const res = await this.rpcClient.attachDocument(
          {
            clientId: this.id!,
            changePack: converter.toChangePack(doc.createChangePack()),
            schemaKey: opts.schema,
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
   * `detach` detaches a Document or Channel from this client.
   * Overloaded to support both types.
   */
  public detach<R, P extends Indexable>(
    resource: Document<R, P>,
    opts?: {
      keepalive?: boolean;
    },
  ): Promise<Document<R, P>>;

  /**
   * `detach` detaches the given channel from this client.
   * It tells the server that this client will no longer track the channel.
   */
  public detach(resource: Channel): Promise<Channel>;

  /**
   * `detach` detaches a Document or Channel from this client.
   */
  public detach(resource: any, opts?: any): Promise<any> {
    if (resource instanceof Channel) {
      return this.detachChannel(resource);
    } else {
      return this.detachDocument(resource, opts);
    }
  }

  /**
   * `detach` detaches the given document from this client. It tells the
   * server that this client will no longer synchronize the given document.
   *
   * To collect garbage things like CRDT tombstones left on the document, all
   * the changes should be applied to other replicas before GC time. For this,
   * if the document is no longer used by this client, it should be detached.
   */
  private detachDocument<R, P extends Indexable>(
    doc: Document<R, P>,
    opts: {
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
        Code.ErrNotAttached,
        `${doc.getKey()} is not attached`,
      );
    }
    doc.update((_, p) => p.clear());

    const task = async () => {
      try {
        const res = await this.rpcClient.detachDocument(
          {
            clientId: this.id!,
            documentId: attachment.resourceID,
            changePack: converter.toChangePack(doc.createChangePack()),
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
   * `attach` attaches the given channel to this client.
   * It tells the server that this client will track the channel.
   */
  public async attachChannel(
    channel: Channel,
    opts: AttachChannelOptions = {},
  ): Promise<Channel> {
    // 01. Check if the client is ready to attach channel.
    if (!this.isActive()) {
      throw new YorkieError(
        Code.ErrClientNotActivated,
        `${this.key} is not active`,
      );
    }
    if (channel.getStatus() !== ChannelStatus.Detached) {
      throw new YorkieError(
        Code.ErrNotDetached,
        `${channel.getKey()} is not detached`,
      );
    }

    channel.setActor(this.id!);

    const task = async () => {
      try {
        const res = await this.rpcClient.attachChannel(
          {
            clientId: this.id!,
            channelKey: channel.getKey(),
          },
          {
            headers: {
              'x-shard-key': `${this.apiKey}/${channel.getFirstKeyPath()}`,
            },
          },
        );

        channel.setSessionID(res.sessionId);
        channel.updateSessionCount(Number(res.sessionCount), 0);
        channel.applyStatus(ChannelStatus.Attached);

        // Determine sync mode: default is Realtime for backward compatibility
        const syncMode =
          opts.isRealtime !== false ? SyncMode.Realtime : SyncMode.Manual;

        const attachment = new Attachment(
          this.reconnectStreamDelay,
          channel,
          res.sessionId,
          syncMode,
        );

        // TODO(hackerwins): Unsubscribe when detaching channel.
        channel.subscribe('local-broadcast', (event) => {
          const { topic, payload, options } = event;
          this.broadcast(channel.getKey(), topic, payload, options).catch(
            (error) => {
              if (options?.error) {
                options.error(error);
              }
              logger.error(`[BC] c:"${this.getKey()}" failed: ${error}`);
            },
          );
        });

        this.attachmentMap.set(channel.getKey(), attachment);

        // Start watching channel changes only in realtime mode
        if (syncMode === SyncMode.Realtime) {
          await this.runWatchLoop(channel.getKey());
        }

        logger.info(
          `[AP] c:"${this.getKey()}" attaches p:"${channel.getKey()}" mode:${syncMode} count:${channel.getSessionCount()}`,
        );
        return channel;
      } catch (err) {
        logger.error(`[AP] c:"${this.getKey()}" err :`, err);
        await this.handleConnectError(err);
        throw err;
      }
    };

    return this.enqueueTask(task);
  }

  /**
   * `detachChannel` detaches the given channel from this client.
   * It tells the server that this client will no longer track the channel.
   */
  public async detachChannel(channel: Channel): Promise<Channel> {
    if (!this.isActive()) {
      throw new YorkieError(
        Code.ErrClientNotActivated,
        `${this.key} is not active`,
      );
    }
    if (!this.attachmentMap.has(channel.getKey())) {
      throw new YorkieError(
        Code.ErrNotAttached,
        `${channel.getKey()} is not attached`,
      );
    }

    const task = async () => {
      try {
        const res = await this.rpcClient.detachChannel(
          {
            clientId: this.id!,
            channelKey: channel.getKey(),
            sessionId: channel.getSessionID()!,
          },
          {
            headers: {
              'x-shard-key': `${this.apiKey}/${channel.getFirstKeyPath()}`,
            },
          },
        );

        channel.updateSessionCount(Number(res.sessionCount), 0);
        channel.applyStatus(ChannelStatus.Detached);

        // Clean up watch stream and remove from attachment map
        this.detachInternal(channel.getKey());

        logger.info(
          `[DP] c:"${this.getKey()}" detaches p:"${channel.getKey()}" count:${channel.getSessionCount()}`,
        );
        return channel;
      } catch (err) {
        logger.error(`[DP] c:"${this.getKey()}" err :`, err);
        await this.handleConnectError(err);
        throw err;
      }
    };

    return this.enqueueTask(task);
  }

  /**
   * `changeSyncMode` changes the synchronization mode of the given document.
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
        Code.ErrNotAttached,
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

    // NOTE(hackerwins): In non-pushpull mode, the client does not receive change events
    // from the server. Therefore, we need to set `remoteChangeEventReceived` to true
    // to sync the local and remote changes. This has limitations in that unnecessary
    // syncs occur if the client and server do not have any changes.
    if (syncMode === SyncMode.Realtime) {
      attachment.changeEventReceived = true;
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
   *
   * For Channel in manual mode, it refreshes the TTL by sending a heartbeat.
   */
  public sync<R, P extends Indexable>(
    doc?: Document<R, P>,
  ): Promise<Array<Document<R, P>>>;

  /**
   * `sync` refreshes the TTL of the given channel by sending a heartbeat.
   * This is used for manual mode channel.
   */
  public sync(channel: Channel): Promise<Channel>;

  /**
   * `sync` implementation that handles both Document and Channel.
   */
  public sync<R, P extends Indexable>(
    resource?: Document<R, P> | Channel,
  ): Promise<Array<Document<R, P>> | Channel> {
    if (!this.isActive()) {
      throw new YorkieError(
        Code.ErrClientNotActivated,
        `${this.key} is not active`,
      );
    }

    if (resource instanceof Channel) {
      const attachment = this.attachmentMap.get(
        resource.getKey(),
      ) as Attachment<Channel>;
      if (!attachment) {
        throw new YorkieError(
          Code.ErrNotAttached,
          `${resource.getKey()} is not attached`,
        );
      }
      return this.enqueueTask(async () => {
        return this.syncInternal(attachment).catch(async (err) => {
          logger.error(`[SY] c:"${this.getKey()}" err :`, err);
          await this.handleConnectError(err);
          throw err;
        });
      }) as Promise<Channel>;
    }

    if (resource instanceof Document) {
      // prettier-ignore
      const attachment = this.attachmentMap.get(resource.getKey()) as Attachment<Document<R, P>>;
      if (!attachment) {
        throw new YorkieError(
          Code.ErrNotAttached,
          `${resource.getKey()} is not attached`,
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
      }) as Promise<Array<Document<R, P>>>;
    }

    return this.enqueueTask(async () => {
      const promises = [];
      for (const [, attachment] of this.attachmentMap) {
        // Only sync Document resources that have syncMode defined
        if (
          attachment.syncMode !== undefined &&
          attachment.resource instanceof Document
        ) {
          promises.push(
            this.syncInternal(
              attachment as Attachment<Document<R, P>>,
              attachment.syncMode,
            ),
          );
        }
      }
      return Promise.all(promises).catch(async (err) => {
        logger.error(`[SY] c:"${this.getKey()}" err :`, err);
        await this.handleConnectError(err);
        throw err;
      });
    }) as Promise<Array<Document<R, P>>>;
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
        Code.ErrNotAttached,
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
            documentId: attachment.resourceID,
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
   * `createRevision` creates a new revision for the given document.
   */
  public async createRevision<R, P extends Indexable>(
    doc: Document<R, P>,
    label: string,
    description?: string,
  ): Promise<RevisionSummary> {
    if (!this.isActive()) {
      throw new YorkieError(
        Code.ErrClientNotActivated,
        `${this.key} is not active`,
      );
    }
    const attachment = this.attachmentMap.get(doc.getKey());
    if (!attachment) {
      throw new YorkieError(
        Code.ErrNotAttached,
        `${doc.getKey()} is not attached`,
      );
    }

    const task = async () => {
      try {
        const res = await this.rpcClient.createRevision(
          {
            clientId: this.id!,
            documentId: attachment.resourceID,
            label,
            description: description || '',
          },
          { headers: { 'x-shard-key': `${this.apiKey}/${doc.getKey()}` } },
        );

        if (!res.revision) {
          throw new YorkieError(
            Code.ErrInvalidArgument,
            'revision is not returned',
          );
        }

        logger.info(
          `[CR] c:"${this.getKey()}" creates revision d:"${doc.getKey()}" l:"${label}"`,
        );

        return converter.toRevisionSummary(res.revision);
      } catch (err) {
        logger.error(`[CR] c:"${this.getKey()}" err :`, err);
        await this.handleConnectError(err);
        throw err;
      }
    };

    return this.enqueueTask(task);
  }

  /**
   * `listRevisions` lists all revisions for the given document.
   */
  public async listRevisions<R, P extends Indexable>(
    doc: Document<R, P>,
    options?: {
      pageSize?: number;
      offset?: number;
      isForward?: boolean;
    },
  ): Promise<Array<RevisionSummary>> {
    if (!this.isActive()) {
      throw new YorkieError(
        Code.ErrClientNotActivated,
        `${this.key} is not active`,
      );
    }
    const attachment = this.attachmentMap.get(doc.getKey());
    if (!attachment) {
      throw new YorkieError(
        Code.ErrNotAttached,
        `${doc.getKey()} is not attached`,
      );
    }

    const task = async () => {
      try {
        const res = await this.rpcClient.listRevisions(
          {
            clientId: this.id!,
            documentId: attachment.resourceID,
            pageSize: options?.pageSize || 10,
            offset: options?.offset || 0,
            isForward: options?.isForward ?? false,
          },
          { headers: { 'x-shard-key': `${this.apiKey}/${doc.getKey()}` } },
        );

        logger.info(
          `[LR] c:"${this.getKey()}" lists revisions d:"${doc.getKey()}" count:${
            res.revisions.length
          }`,
        );

        return res.revisions.map(converter.toRevisionSummary);
      } catch (err) {
        logger.error(`[LR] c:"${this.getKey()}" err :`, err);
        await this.handleConnectError(err);
        throw err;
      }
    };

    return this.enqueueTask(task);
  }

  /**
   * `getRevision` retrieves a specific revision by its ID with full snapshot data.
   */
  public async getRevision<R, P extends Indexable>(
    doc: Document<R, P>,
    revisionID: string,
  ): Promise<RevisionSummary> {
    if (!this.isActive()) {
      throw new YorkieError(
        Code.ErrClientNotActivated,
        `${this.key} is not active`,
      );
    }
    const attachment = this.attachmentMap.get(doc.getKey());
    if (!attachment) {
      throw new YorkieError(
        Code.ErrNotAttached,
        `${doc.getKey()} is not attached`,
      );
    }

    const task = async () => {
      try {
        const res = await this.rpcClient.getRevision(
          {
            clientId: this.id!,
            documentId: attachment.resourceID,
            revisionId: revisionID,
          },
          { headers: { 'x-shard-key': `${this.apiKey}/${doc.getKey()}` } },
        );

        if (!res.revision) {
          throw new YorkieError(
            Code.ErrInvalidArgument,
            'revision is not returned',
          );
        }

        logger.info(
          `[GR] c:"${this.getKey()}" gets revision d:"${doc.getKey()}" r:"${revisionID}"`,
        );

        return converter.toRevisionSummary(res.revision);
      } catch (err) {
        logger.error(`[GR] c:"${this.getKey()}" err :`, err);
        await this.handleConnectError(err);
        throw err;
      }
    };

    return this.enqueueTask(task);
  }

  /**
   * `restoreRevision` restores the document to the given revision.
   */
  public async restoreRevision<R, P extends Indexable>(
    doc: Document<R, P>,
    revisionId: string,
  ): Promise<void> {
    if (!this.isActive()) {
      throw new YorkieError(
        Code.ErrClientNotActivated,
        `${this.key} is not active`,
      );
    }
    const attachment = this.attachmentMap.get(doc.getKey());
    if (!attachment) {
      throw new YorkieError(
        Code.ErrNotAttached,
        `${doc.getKey()} is not attached`,
      );
    }

    const task = async () => {
      try {
        await this.rpcClient.restoreRevision(
          {
            clientId: this.id!,
            documentId: attachment.resourceID,
            revisionId,
          },
          { headers: { 'x-shard-key': `${this.apiKey}/${doc.getKey()}` } },
        );

        logger.info(
          `[RR] c:"${this.getKey()}" restores revision d:"${doc.getKey()}" r:"${revisionId}"`,
        );
      } catch (err) {
        logger.error(`[RR] c:"${this.getKey()}" err :`, err);
        await this.handleConnectError(err);
        throw err;
      }
    };

    return this.enqueueTask(task);
  }

  /**
   * `broadcast` broadcasts the given payload to the given topic.
   */
  public async broadcast(
    key: Key,
    topic: string,
    payload: any,
    options?: BroadcastOptions,
  ): Promise<void> {
    if (!this.isActive()) {
      throw new YorkieError(
        Code.ErrClientNotActivated,
        `${this.key} is not active`,
      );
    }
    const attachment = this.attachmentMap.get(key);
    if (!attachment) {
      throw new YorkieError(Code.ErrNotAttached, `${key} is not attached`);
    }

    if (!validateSerializable(payload)) {
      throw new YorkieError(
        Code.ErrInvalidArgument,
        'payload is not serializable',
      );
    }

    const ch = attachment.resource as Channel;

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
              channelKey: key,
              topic,
              payload: new TextEncoder().encode(JSON.stringify(payload)),
            },
            {
              headers: {
                'x-shard-key': `${this.apiKey}/${ch.getFirstKeyPath()}`,
              },
            },
          );

          logger.info(
            `[BC] c:"${this.getKey()}" broadcasts p:"${key}" t:"${topic}"`,
          );
        } catch (err) {
          logger.error(`[BC] c:"${this.getKey()}" err:`, err);

          if (await this.handleConnectError(err)) {
            // Publish auth-error event before handling the error
            if (isErrorCode(err, Code.ErrUnauthenticated)) {
              if (attachment.resource instanceof Channel) {
                attachment.resource.publish({
                  type: ChannelEventType.AuthError,
                  reason: errorMetadataOf(err).reason || 'unauthenticated',
                  method: 'Broadcast',
                });
              }
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
    const doLoop = async (): Promise<void> => {
      if (!this.isActive()) {
        logger.debug(`[SL] c:"${this.getKey()}" exit sync loop`);
        this.conditions[ClientCondition.SyncLoop] = false;
        return;
      }

      try {
        await this.enqueueTask(async () => {
          const syncs: Array<any> = [];
          for (const [, attachment] of this.attachmentMap) {
            if (!attachment.needSync(this.channelHeartbeatInterval)) {
              continue;
            }

            // Reset changeEventReceived for Document resources
            if (attachment.changeEventReceived !== undefined) {
              attachment.changeEventReceived = false;
            }

            syncs.push(
              this.syncInternal(attachment, attachment.syncMode!).catch((e) => {
                if (isErrorCode(e, Code.ErrUnauthenticated)) {
                  attachment.resource.publish([
                    {
                      type: DocEventType.AuthError,
                      value: {
                        reason: errorMetadataOf(e).reason,
                        method: 'PushPull',
                      },
                    },
                  ]);
                }

                throw e;
              }),
            );
          }

          await Promise.all(syncs);
          setTimeout(doLoop, this.syncLoopDuration);
        });
      } catch (err) {
        logger.error(`[SL] c:"${this.getKey()}" sync failed:`, err);
        if (await this.handleConnectError(err)) {
          setTimeout(doLoop, this.retrySyncLoopDelay);
        } else {
          this.conditions[ClientCondition.SyncLoop] = false;
        }
      }
    };

    logger.debug(`[SL] c:"${this.getKey()}" run sync loop`);
    this.conditions[ClientCondition.SyncLoop] = true;
    doLoop();
  }

  /**
   * `runWatchLoop` runs the watch loop for the given resource (Document or Channel).
   * The watch loop listens to the events of the given resource from the server.
   */
  private async runWatchLoop(key: Key): Promise<void> {
    const attachment = this.attachmentMap.get(key);
    if (!attachment) {
      throw new YorkieError(Code.ErrNotAttached, `${key} is not attached`);
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

        // NOTE(hackerwins): Check if the resource is still attached to prevent
        // watch stream creation after detachment.
        if (!this.attachmentMap.has(key)) {
          this.conditions[ClientCondition.WatchLoop] = false;
          return Promise.reject(
            new YorkieError(Code.ErrNotAttached, `${key} is not attached`),
          );
        }

        const ac = new AbortController();

        // Create watch stream based on resource type
        if (attachment.resource instanceof Document) {
          return this.createDocumentWatchStream(
            attachment as Attachment<Document<any, any>>,
            key,
            ac,
            onDisconnect,
          );
        } else if (attachment.resource instanceof Channel) {
          return this.createChannelWatchStream(
            attachment as Attachment<Channel>,
            key,
            ac,
            onDisconnect,
          );
        }

        return Promise.reject(
          new YorkieError(
            Code.ErrClientNotActivated,
            `Unknown resource type for ${key}`,
          ),
        );
      },
    );
  }

  /**
   * `createDocumentWatchStream` creates a watch stream for a Document.
   * @internal
   */
  private createDocumentWatchStream<R, P extends Indexable>(
    attachment: Attachment<Document<R, P>>,
    key: Key,
    ac: AbortController,
    onDisconnect: () => void,
  ): Promise<[WatchStream, AbortController]> {
    const stream = this.rpcClient.watch(
      {
        clientId: this.id!,
        resources: [
          {
            resource: {
              case: 'document',
              value: { documentId: attachment.resourceID },
            },
          },
        ],
      },
      {
        headers: { 'x-shard-key': `${this.apiKey}/${key}` },
        signal: ac.signal,
      },
    );

    attachment.resource.publish([
      {
        type: DocEventType.ConnectionChanged,
        value: StreamConnectionStatus.Connected,
      },
    ]);
    logger.info(`[WD] c:"${this.getKey()}" watches d:"${key}"`);

    // NOTE(hackerwins): Set changeEventReceived to true to prevent
    // event stream gap issues. This ensures sync loop continues even when
    // no remote change events are received immediately after watch stream starts.
    if (attachment.changeEventReceived !== undefined) {
      attachment.changeEventReceived = true;
    }

    const resetAndPublishDisconnect = () => {
      attachment.resource.resetOnlineClients();
      attachment.resource.publish([
        {
          type: DocEventType.Initialized,
          source: OpSource.Local,
          value: attachment.resource.getPresences(),
        },
      ]);
      attachment.resource.publish([
        {
          type: DocEventType.ConnectionChanged,
          value: StreamConnectionStatus.Disconnected,
        },
      ]);
    };

    return runWatchStream(
      {
        stream,
        ac,
        isInit: (resp) => resp.body.case === 'initialization',
        onResponse: (resp) =>
          this.handleWatchDocumentResponse(attachment, resp),
        onStreamEnd: () => {
          resetAndPublishDisconnect();
          logger.debug(`[WD] c:"${this.getKey()}" unwatches (stream ended)`);
        },
        onError: (err) => {
          resetAndPublishDisconnect();
          logger.debug(`[WD] c:"${this.getKey()}" unwatches`);
          if (isErrorCode(err, Code.ErrUnauthenticated)) {
            attachment.resource.publish([
              {
                type: DocEventType.AuthError,
                value: {
                  reason: errorMetadataOf(err).reason,
                  method: 'Watch',
                },
              },
            ]);
          }
        },
        onDisconnect,
        shouldIgnoreError: (err) => {
          if (err instanceof Error && err.name === 'AbortError') {
            logger.debug(`[WD] c:"${this.getKey()}" stream aborted`);
            return true;
          }
          return false;
        },
      },
      (err) => this.handleConnectError(err),
      () => {
        this.conditions[ClientCondition.WatchLoop] = false;
      },
    );
  }

  /**
   * `createChannelWatchStream` creates a watch stream for a Channel.
   * @internal
   */
  private createChannelWatchStream(
    attachment: Attachment<Channel>,
    key: Key,
    ac: AbortController,
    onDisconnect: () => void,
  ): Promise<[WatchStream, AbortController]> {
    const stream = this.rpcClient.watch(
      {
        clientId: this.id!,
        resources: [
          {
            resource: {
              case: 'channel',
              value: { channelKey: key },
            },
          },
        ],
      },
      {
        headers: {
          'x-shard-key': `${
            this.apiKey
          }/${attachment.resource.getFirstKeyPath()}`,
        },
        signal: ac.signal,
      },
    );

    logger.info(`[WP] c:"${this.getKey()}" watches p:"${key}"`);

    return runWatchStream(
      {
        stream,
        ac,
        isInit: (resp) => resp.body.case === 'initialization',
        onResponse: (resp) => this.handleWatchChannelResponse(attachment, resp),
        onStreamEnd: () => {
          logger.debug(`[WP] c:"${this.getKey()}" p:"${key}" stream ended`);
        },
        onError: (err) => {
          logger.debug(`[WP] c:"${this.getKey()}" p:"${key}" err:`, err);
        },
        onDisconnect,
        shouldIgnoreError: (err) => {
          if (err instanceof Error && err.name === 'AbortError') {
            logger.debug(`[WP] c:"${this.getKey()}" p:"${key}" stream aborted`);
            return true;
          }
          return false;
        },
      },
      (err) => this.handleConnectError(err),
      () => {
        this.conditions[ClientCondition.WatchLoop] = false;
      },
    );
  }

  /**
   * `handleWatchChannelResponse` handles the watch channel response from the server.
   * This method parses the protocol buffer response and updates the channel.
   * @internal
   */
  private handleWatchChannelResponse(
    attachment: Attachment<Channel>,
    resp: WatchResponse,
  ) {
    const channel = attachment.resource;

    if (resp.body.case === 'initialization') {
      for (const ri of resp.body.value.resourceInits) {
        if (ri.init.case === 'channelInit') {
          const { sessionCount, seq } = ri.init.value;
          if (channel.updateSessionCount(Number(sessionCount), Number(seq))) {
            channel.publish({
              type: ChannelEventType.Initialized,
              count: Number(sessionCount),
            });
          }
        }
      }
      return;
    }

    if (resp.body.case === 'event') {
      const watchEvent = resp.body.value;
      if (watchEvent.event.case === 'channelEvent') {
        const event = watchEvent.event.value.event;
        if (!event) return;

        // Handle broadcast events
        if (event.type === PbChannelEventType.BROADCAST) {
          const decoder = new TextDecoder();
          try {
            const payload = JSON.parse(decoder.decode(event.payload));
            channel.publish({
              type: ChannelEventType.Broadcast,
              clientID: event.publisher,
              topic: event.topic,
              payload,
            });
          } catch (err) {
            logger.error(
              `[WP] c:"${this.getKey()}" failed to parse broadcast payload:`,
              err,
            );
          }
          return;
        }

        // Handle count change events
        if (
          channel.updateSessionCount(
            Number(event.sessionCount),
            Number(event.seq),
          )
        ) {
          channel.publish({
            type: ChannelEventType.PresenceChanged,
            count: Number(event.sessionCount),
          });
        }
      }
    }
  }

  private handleWatchDocumentResponse<R, P extends Indexable>(
    attachment: Attachment<Document<R, P>>,
    resp: WatchResponse,
  ) {
    if (resp.body.case === 'initialization') {
      for (const ri of resp.body.value.resourceInits) {
        if (ri.init.case === 'documentInit') {
          attachment.resource.applyWatchInit(ri.init.value.clientIds);
        }
      }
      return;
    }

    if (resp.body.case === 'event') {
      const watchEvent = resp.body.value;
      if (watchEvent.event.case === 'docEvent') {
        const docEvent = watchEvent.event.value;
        if (docEvent.event?.type === PbDocEventType.DOCUMENT_CHANGED) {
          if (attachment.changeEventReceived !== undefined) {
            attachment.changeEventReceived = true;
          }
          return;
        }
        if (docEvent.event) {
          attachment.resource.applyDocEvent(
            docEvent.event.type,
            docEvent.event.publisher,
          );
        }
      }
    }
  }

  private deactivateInternal() {
    this.status = ClientStatus.Deactivated;

    for (const [key, attachment] of this.attachmentMap) {
      this.detachInternal(key);
      if (attachment.resource instanceof Document) {
        attachment.resource.applyStatus(DocStatus.Detached);
      } else if (attachment.resource instanceof Channel) {
        attachment.resource.applyStatus(ChannelStatus.Detached);
      }
    }
  }

  private detachInternal(key: Key) {
    // NOTE(hackerwins): If attachment is not found, it means that the document
    // has been already detached by another routine.
    // This can happen when detach or remove is called while the watch loop is
    // running.
    const attachment = this.attachmentMap.get(key);
    if (!attachment) {
      return;
    }

    attachment.cancelWatchStream();
    if (attachment.resource instanceof Document) {
      attachment.resource.resetOnlineClients();
    }
    this.attachmentMap.delete(key);
  }

  private async syncInternal<R, P extends Indexable>(
    attachment: Attachment<Attachable>,
    syncMode?: SyncMode,
  ): Promise<Attachable> {
    const { resource } = attachment;

    // Handle channel heartbeat
    if (resource instanceof Channel) {
      try {
        const res = await this.rpcClient.refreshChannel(
          {
            clientId: this.id!,
            channelKey: resource.getKey(),
            sessionId: resource.getSessionID()!,
          },
          {
            headers: {
              'x-shard-key': `${this.apiKey}/${resource.getFirstKeyPath()}`,
            },
          },
        );

        resource.updateSessionCount(Number(res.sessionCount), 0);
        attachment.updateHeartbeatTime();

        logger.debug(
          `[RP] c:"${this.getKey()}" refreshes p:"${resource.getKey()}" mode:${
            attachment.syncMode
          }`,
        );
      } catch (err) {
        logger.error(`[RP] c:"${this.getKey()}" err :`, err);
        throw err;
      }
      return resource;
    }

    // Handle Document sync
    const doc = resource as Document<R, P>;
    const { resourceID: docID } = attachment;

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
      attachment.resource.publish([
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

      const key = doc.getKey();
      const remoteSize = respPack.getChangeSize();
      logger.info(
        `[PP] c:"${this.getKey()}" sync d:"${key}", push:${reqPack.getChangeSize()} pull:${remoteSize} cp:${respPack
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
      logger.warn(`[WD] c:"${this.getKey()}" err :`, err.rawMessage);
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
    } catch {
      logger.error(`[TQ] c:"${this.getKey()}" process failed, id:"${this.id}"`);
    }

    this.processNext();
  }
}
