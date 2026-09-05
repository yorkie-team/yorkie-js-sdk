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
import {
  createConnectTransport,
  createGrpcWebTransport,
} from '@connectrpc/connect-web';
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
  LocalChangesDroppedReason,
} from '@yorkie-js/sdk/src/document/document';
import { ChangeStruct } from '@yorkie-js/sdk/src/document/change/change';
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
import { DocStore } from '@yorkie-js/sdk/src/client/doc-store';
import {
  SessionLock,
  SessionLockHandle,
  WebLocksSessionLock,
} from '@yorkie-js/sdk/src/client/session-lock';
import { runWatchStream } from '@yorkie-js/sdk/src/client/watch';

/**
 * `Key` is a string representing the key of Document or Channel.
 */
type Key = string;

/**
 * `SyncMode` defines synchronization modes for the PushPullChanges API
 * (documents) and the RefreshChannel heartbeat (channels).
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

  /**
   * `Polling` mode runs the sync loop without opening a watch stream.
   * - For Channel: heartbeat refreshes TTL and brings sessionCount.
   * - For Document: PushPullChanges runs at the polling interval. Remote
   *   changes arrive on the next tick (latency = interval). Not suitable
   *   for collaborative editing — use Realtime for that.
   */
  Polling = 'polling',
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
   * `channelHeartbeatInterval` is the interval of the channel heartbeat (ms).
   * The client sends a `RefreshChannel` heartbeat to refresh the channel
   * session TTL. The default value is `5000` (ms) — co-tuned to the server's
   * `ChannelSessionTTL` (15 s) at TTL/3. Values larger than the server TTL
   * risk premature session expiry.
   */
  channelHeartbeatInterval?: number;

  /**
   * `userAgent` is the user agent of the client. It is used to identify the
   * client.
   */
  userAgent?: string;

  /**
   * `useGrpcWebTransport` determines the transport protocol.
   * If true, uses gRPC-Web transport for backward compatibility.
   * If false (default), uses Connect Protocol transport.
   */
  useGrpcWebTransport?: boolean;

  /**
   * `deactivateOnUnload` controls whether the client registers a
   * `beforeunload` listener during `activate()` that deactivates the client
   * when the page is unloaded. The default value is `true`.
   *
   * Setting this to `false` skips the listener registration. This is useful
   * for apps that don't need GC or presence cleanup on unload (for example,
   * `disableGC` documents without collaboration): the unload-time
   * deactivate becomes pure overhead and its `fetch({ keepalive: true })`
   * request can reject mid-flight during hard navigation, surfacing as an
   * unhandled `[unknown]` `ConnectError`. The server reaps the stale
   * client after its `clientDeactivateThreshold`, so opting out is safe.
   */
  deactivateOnUnload?: boolean;

  /**
   * `store` is a pluggable persistence backend for offline document state.
   * When set, the client persists `doc.toBytes()` after every local change on
   * a document attached through it, and on `attach` it rehydrates the document
   * from any persisted bytes so un-pushed local changes survive a reload. The
   * restored checkpoint is presented in the attach ChangePack so the server
   * seeds the client's document sequence from it and re-accepts the re-pushed
   * local changes. When unset (the default), no persistence happens.
   *
   * For offline persistence you also want `deactivateOnUnload: false`: the
   * default `true` deactivates the client on page unload, which detaches
   * documents server-side and defeats the point of resuming un-pushed local
   * changes on the next load. Setting `store` therefore auto-defaults
   * `deactivateOnUnload` to `false`; pass it explicitly to override.
   */
  store?: DocStore;

  /**
   * `sessionLock` is the single-active-session guard used only on the offline
   * persistence path (when `store` is set). Offline persistence derives a
   * stable actor from the app's clientKey, so two tabs of the same app+user
   * share it; two live tabs would share one server checkpoint and mint
   * colliding `clientSeq` values — silent edit loss. On `attach` the client
   * acquires a lock keyed by `apiKey/clientKey/docKey` and holds it for the
   * attachment lifetime; if it is already held (another tab) the attach fails
   * fast. The default {@link WebLocksSessionLock} uses the Web Locks API and is
   * a no-op in non-browser runtimes; inject a fake for testing. Ignored when
   * `store` is unset (non-persistence clients keep today's behavior).
   */
  sessionLock?: SessionLock;
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
   * `documentPollInterval` (ms) — only used when `syncMode` is `Polling`.
   * Default: 3000.
   */
  documentPollInterval?: number;

  /**
   * `schema` is the schema of the document. It is used to validate the
   * document.
   */
  schema?: string;

  /**
   * `disableGC` declares that this attachment will not produce or consume
   * tombstones. The server skips minVV tracking and omits the response
   * VersionVector for this client. Use only with Counter or primitive
   * workloads; misuse on a document that uses Tree, Text, or Array
   * deletions leads to undefined GC behavior on this client.
   *
   * This option controls the wire contract with the server. It is
   * distinct from any local-only GC toggle on the Document.
   */
  disableGC?: boolean;

  /**
   * `disablePresence` declares that this document does not use presence.
   * The first client to attach a document sets the persisted server-side
   * flag — subsequent attaches inherit the fixated value regardless of
   * what they pass. The client uses the server response to gate
   * `Document.update`'s presence emits (silently dropped) and skips the
   * initial `presence.set(opts.initialPresence)` emitted on attach.
   *
   * If omitted, the resolved value is `doc.isPresenceDisabled()` (the
   * value seeded from `DocumentOptions.disablePresence`, then overwritten
   * by any previous attach response on the same Document instance), with
   * a final fallback of `false`.
   */
  disablePresence?: boolean;
}

/**
 * `AttachChannelOptions` are user-settable options used when attaching channels.
 */
export interface AttachChannelOptions {
  /**
   * `syncMode` selects how the channel keeps presence in sync with the server.
   * Default is `SyncMode.Realtime`.
   * - `SyncMode.Realtime`: open a watch stream and run the heartbeat. Required
   *   to receive broadcast events.
   * - `SyncMode.Polling`: heartbeat-only. No watch stream is opened. The
   *   heartbeat refreshes TTL and brings the latest sessionCount. Recommended
   *   for large channels where broadcast is not needed.
   * - `SyncMode.Manual`: no automatic activity. Caller must invoke `sync()`.
   */
  syncMode?: SyncMode;

  /**
   * `channelHeartbeatInterval` overrides the heartbeat interval (ms) for
   * this attachment. If unset, the client-level default
   * (`ClientOptions.channelHeartbeatInterval`, default 5000 ms) applies
   * to both Realtime and Polling modes.
   */
  channelHeartbeatInterval?: number;
}

/**
 * `DefaultDocumentPollIntervalMs` is the default poll interval (ms) for
 * `SyncMode.Polling` documents when the user has not set an explicit
 * `documentPollInterval`.
 */
const DefaultDocumentPollIntervalMs = 3000;

/**
 * `DefaultChannelHeartbeatMs` is the default heartbeat interval for both
 * Realtime and Polling channel modes. Co-tuned to the server's
 * `ChannelSessionTTL` (15 s) at TTL/3.
 */
const DefaultChannelHeartbeatMs = 5000;

/**
 * `DefaultClientOptions` is the default options for Client.
 */
const DefaultClientOptions = {
  rpcAddr: 'https://api.yorkie.dev',
  syncLoopDuration: 50,
  retrySyncLoopDelay: 1000,
  reconnectStreamDelay: 1000,
  channelHeartbeatInterval: DefaultChannelHeartbeatMs,
  deactivateOnUnload: true,
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
  // actorID is the stable actor stamped into document changes. It comes from
  // `ActivateClientResponse.actor_id` (a new server), and falls back to the
  // per-session `id` against an older server that does not return it. It is
  // kept separate from `id` so RPC calls keep using the per-session client id
  // for row lookups while documents author changes under the stable actor.
  private actorID?: ActorID;
  private key: string;
  private metadata: Record<string, string>;
  private status: ClientStatus;
  private attachmentMap: Map<string, Attachment<Attachable>>;
  // `attachingDocs` holds keys with an in-flight attach. attachmentMap is
  // only populated after the attach round-trip resolves, so this set is
  // needed to reject a concurrent duplicate attach of the same key.
  private attachingDocs: Set<string>;

  private apiKey: string;
  private authTokenInjector?: (reason?: string) => Promise<string>;
  private conditions: Record<ClientCondition, boolean>;
  private syncLoopDuration: number;
  private reconnectStreamDelay: number;
  private retrySyncLoopDelay: number;
  private channelHeartbeatInterval: number;
  private deactivateOnUnload: boolean;
  private store?: DocStore;
  // Per-store-key write chain that serializes `store.save` calls for a single
  // document. Async saves (esp. IndexedDB) for the same key can otherwise
  // interleave and let an earlier save resolve after a later one, persisting
  // stale bytes. Each key's tail promise is kept here so the next save chains
  // after it; see `persistToStore`.
  private persistQueues: Map<string, Promise<void>> = new Map();
  // Single-active-session guard for the offline persistence path. Only consulted
  // when `store` is set; a stable Web Locks default is created so store-backed
  // clients get multi-tab safety out of the box.
  private sessionLock: SessionLock;

  private rpcClient: ConnectClient<typeof YorkieService>;
  private setAuthToken: (token: string) => void;
  private taskQueue: Array<() => Promise<any>>;
  private processing = false;
  private keepalive = false;
  private deactivating = false;

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
    this.attachingDocs = new Set();

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
    this.store = opts.store;
    // Offline persistence needs the client to stay attached across an unload:
    // the default deactivate-on-unload would detach and reset the server
    // checkpoint, defeating a later resume. So when a store is configured,
    // default deactivateOnUnload to false unless the app set it explicitly.
    this.deactivateOnUnload =
      opts.deactivateOnUnload ??
      (this.store ? false : DefaultClientOptions.deactivateOnUnload);
    // Default to the Web Locks-backed guard; it is a no-op outside browsers and
    // is only consulted on the store-backed attach path below.
    this.sessionLock = opts.sessionLock ?? new WebLocksSessionLock();

    const { authInterceptor, setToken } = createAuthInterceptor(this.apiKey);
    this.setAuthToken = setToken;

    const transportOptions = {
      baseUrl: rpcAddr,
      interceptors: [authInterceptor, createMetricInterceptor(opts?.userAgent)],
      fetch: (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        // Server-streaming RPCs (Watch/WatchDocument/WatchChannel) need the
        // caller's signal active for the response body's full lifetime so
        // user-initiated cancellation can reach the underlying connection.
        if (/\/yorkie\.v1\.YorkieService\/Watch/.test(url)) {
          return fetch(input as RequestInfo, {
            ...init,
            keepalive: this.keepalive,
          });
        }

        // For unary RPCs, @connectrpc/connect calls AbortController.abort()
        // on its per-call signal as cleanup after the call completes — even
        // on success. In browsers that stray abort surfaces as an
        // "Uncaught (in promise) AbortError: The user aborted a request."
        // tied to the (already-finished) fetch's body stream and gets picked
        // up by global error trackers once per call. Decouple our underlying
        // fetch from the caller's signal once the response is in hand so the
        // post-success cleanup abort does not propagate. Aborts that arrive
        // before the response settles still cancel the fetch via the
        // forwarding listener.
        const callerSignal =
          init?.signal ?? (input instanceof Request ? input.signal : undefined);
        const innerAC = new AbortController();
        let onCallerAbort: (() => void) | undefined;
        if (callerSignal) {
          if (callerSignal.aborted) {
            innerAC.abort(callerSignal.reason);
          } else {
            onCallerAbort = () => innerAC.abort(callerSignal.reason);
            callerSignal.addEventListener('abort', onCallerAbort);
          }
        }
        const detach = () => {
          if (callerSignal && onCallerAbort) {
            callerSignal.removeEventListener('abort', onCallerAbort);
          }
        };

        return fetch(input as RequestInfo, {
          ...init,
          signal: innerAC.signal,
          keepalive: this.keepalive,
        }).then(
          (res) => {
            detach();
            return res;
          },
          (err) => {
            detach();
            throw err;
          },
        );
      },
    };

    // Here we make the client itself, combining the service
    // definition with the transport.
    this.rpcClient = createConnectClient(
      YorkieService,
      opts.useGrpcWebTransport
        ? createGrpcWebTransport(transportOptions)
        : createConnectTransport(transportOptions),
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
        this.actorID = res.actorId || res.clientId;
        this.status = ClientStatus.Activated;
        this.deactivating = false;
        this.runSyncLoop();

        logger.info(`[AC] c:"${this.getKey()}" activated, id:"${this.id}"`);

        // NOTE(hackerwins): Set up beforeunload event to deactivate the client
        // when the page is being unloaded.
        if (typeof window !== 'undefined' && this.deactivateOnUnload) {
          window.addEventListener('beforeunload', () => {
            void this.deactivate({ keepalive: true }).catch((err) => {
              logger.debug(
                `[DC] c:"${this.getKey()}" beforeunload deactivate failed:`,
                err,
              );
            });
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

    // Mark as deactivating immediately so the sync loop exits early.
    this.deactivating = true;

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
        this.deactivating = false;
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
   * `attach` attaches the given channel to this client. The channel is
   * registered locally and the server is notified on the next RefreshChannel
   * heartbeat.
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
    // Reject a duplicate attach of the same key on this client. Without this
    // guard the request reaches the server, which reports the already-attached
    // key as a misleading `ErrClientNotFound`; the SDK then deactivates the
    // whole client. `attachmentMap` covers the resolved case and
    // `attachingDocs` covers a concurrent in-flight attach.
    if (
      this.attachmentMap.has(doc.getKey()) ||
      this.attachingDocs.has(doc.getKey())
    ) {
      throw new YorkieError(
        Code.ErrAlreadyAttached,
        `${doc.getKey()} is already attached`,
      );
    }

    // Stamp the actor before any local elements are rehydrated. `setActor`
    // has a known limitation: it does not rewrite the actor of existing
    // elements, so the restore (which repopulates the root/changeID/pending
    // changes under their persisted actor) must run after this call. The
    // restore itself is deferred into the enqueued task because the store
    // load is async; see the `store.load` step below.
    doc.setActor((this.actorID ?? this.id)!);
    // Resolve the effective presence-disabled state at attach time. The
    // local option wins; absent that, the Document's seeded value (from
    // construction or a prior attach response on this instance) is used;
    // final fallback is `false`. The server is authoritative — the
    // attach response overwrites this with the fixated value — so this
    // is purely a local pre-attach decision controlling whether to push
    // the initial presence and (once the wire field lands) what to send
    // on the request.
    const resolvedDisablePresence =
      opts.disablePresence ?? doc.isPresenceDisabled() ?? false;

    // 02. Attach the document to the client.
    const syncMode = opts.syncMode ?? SyncMode.Realtime;
    if (
      opts.documentPollInterval !== undefined &&
      opts.documentPollInterval <= 0
    ) {
      throw new YorkieError(
        Code.ErrInvalidArgument,
        'documentPollInterval must be greater than 0',
      );
    }
    const pollIntervalPinned = opts.documentPollInterval !== undefined;
    const pollInterval = pollIntervalPinned
      ? opts.documentPollInterval!
      : syncMode === SyncMode.Polling
        ? DefaultDocumentPollIntervalMs
        : 0;
    // Mark the attach in flight synchronously so a concurrent duplicate
    // attach of the same key is rejected by the guard above before it is
    // enqueued. Cleared in the task's `finally`.
    this.attachingDocs.add(doc.getKey());
    return this.enqueueTask(async () => {
      // Single-active-session lock, held for the attachment lifetime and
      // released either on the failure path below or by `detachInternal`. Kept
      // in this local until the attachment exists to capture it; if attach
      // throws before then, the `catch` releases it so the lock is not leaked.
      let sessionLockHandle: SessionLockHandle | undefined;
      try {
        // Acquire the single-active-session guard before any restore or RPC, so
        // a second tab of the same offline-persistence client fails fast instead
        // of driving sync on a shared checkpoint. Only on the store-backed path:
        // non-store clients keep today's behavior (no guard). The Web Locks
        // default is a no-op in non-browser runtimes.
        if (this.store) {
          const lockName =
            `yorkie-session:${this.apiKey}/${this.key}/` + doc.getKey();
          sessionLockHandle = await this.sessionLock.acquire(lockName);
          if (!sessionLockHandle) {
            throw new YorkieError(
              Code.ErrInvalidArgument,
              `document "${doc.getKey()}" is already open in another tab under ` +
                `offline persistence; only one active session per document is ` +
                `allowed to avoid silent edit loss`,
            );
          }
        }

        // `attachOnce` runs the restore + attach RPC + apply-response sequence.
        // It is a closure so the store-backed path can retry it once as a
        // fresh (non-restored) attach after an `ErrEpochMismatch` re-anchor.
        // `reanchor` skips the store restore and clears any state the caller
        // reset, so the pack presents an initial checkpoint/epoch and the
        // server sends the current snapshot.
        const attachOnce = async (reanchor: boolean) => {
          // Restore any persisted offline state before building the attach
          // pack. The actor was already stamped above, so rehydrating here
          // respects the actor-set-before-elements ordering. `createChangePack`
          // reads `doc.checkpoint`, so the restored (non-zero) checkpoint flows
          // straight into the attach ChangePack; the server (Q3) seeds the
          // client's document sequence from it instead of 0 and re-accepts the
          // re-pushed local changes.
          let restored = false;
          if (this.store && !reanchor) {
            // A flaky store must not abort attach: on a load/restore failure,
            // fall back to a fresh (unrestored) attach instead of throwing out
            // of attach. `restoreFromBytes` also throws on an actor mismatch
            // (store reused under a different clientKey); that is genuine data
            // loss, so surface it and clear the stale entry rather than
            // divergently restoring.
            let bytes: Uint8Array | undefined;
            try {
              bytes = await this.store.load(this.storeKey(doc.getKey()));
            } catch (err) {
              logger.warn(
                `[AD] c:"${this.getKey()}" d:"${doc.getKey()}" store load ` +
                  `failed; falling back to a fresh attach:`,
                err,
              );
              bytes = undefined;
            }
            if (bytes) {
              try {
                doc.restoreFromBytes(bytes);
                restored = true;
              } catch (err) {
                // A persisted envelope that cannot be safely restored is
                // unusable and MUST never abort attach or poison every future
                // one. Two failure classes are handled the same way:
                //   - actor mismatch (a YorkieError: store reused under a
                //     different clientKey) — restoring would diverge the CRDT;
                //   - any other failure (a native error such as a SyntaxError
                //     from a corrupt/truncated envelope) — the bytes cannot be
                //     decoded at all.
                // In both cases emit an app-visible data-loss event with
                // whatever pending changes are recoverable, clear the stale
                // entry, and fall through to a fresh attach. Treating a native
                // decode error as unusable (rather than rethrowing) is what
                // keeps a single poisoned store entry from failing every later
                // attach.
                const reason: LocalChangesDroppedReason =
                  err instanceof YorkieError
                    ? 'actor-mismatch'
                    : 'restore-failed';
                logger.warn(
                  `[AD] c:"${this.getKey()}" d:"${doc.getKey()}" ` +
                    `persisted state unusable (${reason}); dropping stale ` +
                    `edits:`,
                  err,
                );
                let dropped: Array<ChangeStruct<P>> = [];
                try {
                  dropped = Document.fromBytes<R, P>(
                    doc.getKey(),
                    bytes,
                  ).getPendingChangeStructs();
                } catch {
                  // The envelope itself may be undecodable; recover nothing.
                  dropped = [];
                }
                this.emitLocalChangesDropped(doc, reason, dropped);
                await this.removeFromStore(doc.getKey());
              }
            }
          }

          // Seed the initial presence after restore so it is not overwritten by
          // the rehydrated presences map. Skipped when presence is disabled.
          // When restoring, the presence map already came back from storage, so
          // adding an initial-presence change here would append a spurious
          // local change.
          if (!resolvedDisablePresence && !restored) {
            doc.update((_, p) => p.set(opts.initialPresence || {}));
          }

          // Snapshot the pre-attach state used by the Tier-3 silent-purge
          // guard: the docID persisted with the restored envelope and whether
          // the local snapshot is non-empty. Captured before `applyChangePack`
          // overwrites the checkpoint/root with the server's response.
          const persistedDocID = doc.getDocID();
          const hadLocalState =
            restored && doc.getCheckpoint().getServerSeq() > 0n;
          const persistedPending = restored
            ? doc.getPendingChangeStructs()
            : [];

          const res = await this.rpcClient.attachDocument(
            {
              clientId: this.id!,
              changePack: converter.toChangePack(doc.createChangePack()),
              schemaKey: opts.schema,
              disableGc: opts.disableGC ?? false,
              disablePresence: resolvedDisablePresence,
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

          // Tier-3 silent-purge guard: if the server GC'd/deleted the document
          // while this client was offline, attach mints a fresh empty doc with
          // a new documentId and a server sequence back at 0. Restoring the
          // local snapshot on top would present un-pushed edits against an
          // unrelated document. Detect it by comparing the returned documentId
          // against the persisted one, or a serverSeq that regressed to 0 while
          // the local snapshot was non-empty, and surface an app-visible
          // data-loss event carrying the dropped edits before clearing the
          // stale entry and attaching fresh.
          if (this.store && restored) {
            const serverSeq = res.changePack?.checkpoint?.serverSeq ?? 0n;
            const idChanged =
              persistedDocID !== '' && res.documentId !== persistedDocID;
            const seqRegressed = hadLocalState && serverSeq === 0n;
            if (idChanged || seqRegressed) {
              logger.warn(
                `[AD] c:"${this.getKey()}" d:"${doc.getKey()}" server ` +
                  `purged the document (docID or serverSeq reset); dropping ` +
                  `persisted offline state`,
              );
              this.emitLocalChangesDropped(
                doc,
                'document-purged',
                persistedPending,
              );
              await this.removeFromStore(doc.getKey());
              doc.resetForReanchor();
              doc.setActor((this.actorID ?? this.id)!);
              doc.setDisableGC(opts.disableGC ?? false);
              doc.setDisablePresence(res.disablePresence);
              doc.applyChangePack(converter.fromChangePack<P>(res.changePack!));
              doc.setDocID(res.documentId);
              return res;
            }
          }

          const pack = converter.fromChangePack<P>(res.changePack!);
          // Record the opt-out decision before applying the attach response
          // so the first applyChangePack already routes remote changes
          // through the lamport-only sync path.
          doc.setDisableGC(opts.disableGC ?? false);
          doc.setDisablePresence(res.disablePresence);
          doc.applyChangePack(pack);
          // Record the server-assigned document id so the next persisted
          // envelope carries it for the Tier-3 guard on a later restore.
          doc.setDocID(res.documentId);
          return res;
        };

        let res;
        try {
          res = await attachOnce(false);
        } catch (err) {
          // Store-backed re-anchor: a resume attach that presents a persisted
          // (stale) checkpoint/epoch is rejected with `ErrEpochMismatch` when
          // the document was force-compacted while this client was offline.
          // The persisted entry is unusable, so drop it, reset the document to
          // a fresh state (re-stamping the actor, since reset clears changeID),
          // and retry a clean attach — the server re-anchors us from the
          // current snapshot. Gated to the store path so non-store clients keep
          // today's app-driven `epoch-mismatch` behavior.
          //
          // Data loss is not silent: before discarding, capture the un-pushed
          // local changes and emit an app-visible `LocalChangesDropped` event
          // carrying them, so the app can react/re-apply. Replaying them on top
          // of the re-anchored (compacted) state is a follow-up enhancement.
          if (this.store && isErrorCode(err, Code.ErrEpochMismatch)) {
            logger.warn(
              `[AD] c:"${this.getKey()}" d:"${doc.getKey()}" stale epoch on ` +
                `resume; clearing persisted state and re-anchoring`,
            );
            const dropped = doc.getPendingChangeStructs();
            this.emitLocalChangesDropped(doc, 'epoch-reanchor', dropped);
            await this.removeFromStore(doc.getKey());
            doc.resetForReanchor();
            doc.setActor((this.actorID ?? this.id)!);
            res = await attachOnce(true);
          } else {
            throw err;
          }
        }

        if (doc.getStatus() === DocStatus.Removed) {
          // The document was already removed server-side, so no Attachment is
          // created here and nothing will ever call `detachInternal` to release
          // the session lock. Release it now before the early return, otherwise
          // the lock leaks and every later attach of this doc key fails fast.
          sessionLockHandle?.release();
          return doc;
        }

        doc.applyStatus(DocStatus.Attached);
        const attachment = new Attachment(
          this.reconnectStreamDelay,
          doc,
          res.documentId,
          syncMode,
          pollInterval,
          pollIntervalPinned,
          opts.disableGC ?? false,
          res.disablePresence,
        );
        // Hand the held session lock to the attachment so `detachInternal`
        // releases it on detach/deactivate, freeing a later tab to take over.
        attachment.sessionLockHandle = sessionLockHandle;
        this.attachmentMap.set(doc.getKey(), attachment);

        // Persist the full restorable envelope (`doc.toBytes()`) on every local
        // mutation. This is a plain full overwrite (not an append), so it does
        // not grow unbounded. The unsubscribe is captured on the attachment so
        // `detachInternal` can tear it down and re-attaches do not accumulate
        // handlers. Errors are logged, not thrown, so a failing store never
        // breaks the editing path.
        //
        // Persist on:
        //   - LocalChange: a new un-pushed edit must be captured.
        //   - PresenceChanged (local source): a presence-only local change
        //     appends to `localChanges` but emits no LocalChange (gated by
        //     opInfos.length), so it would otherwise never be persisted.
        //
        // The post-sync checkpoint is persisted separately in `syncInternal`:
        // an ack-only push emits no Remote/Snapshot event, so it cannot be
        // captured here.
        if (this.store) {
          const storeKey = this.storeKey(doc.getKey());
          const persist = () => {
            this.persistToStore(storeKey, doc.toBytes(), (err) => {
              logger.error(
                `[PS] c:"${this.getKey()}" persist d:"${doc.getKey()}" failed:`,
                err,
              );
            });
          };
          // Subscribe via 'all': the default `subscribe(fn)` overload only
          // delivers Local/Remote/Snapshot, but a presence-only local change
          // surfaces as PresenceChanged, which must also trigger a persist.
          attachment.unsubscribePersist = doc.subscribe('all', (events) => {
            for (const event of events) {
              if (
                event.type === DocEventType.LocalChange ||
                (event.type === DocEventType.PresenceChanged &&
                  event.source === OpSource.Local)
              ) {
                persist();
                break;
              }
            }
          });
        }

        if (syncMode !== SyncMode.Manual && syncMode !== SyncMode.Polling) {
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

        // Clear undo/redo stacks so that initialRoot setup operations
        // are not reachable via undo.
        doc.clearHistory();

        return doc;
      } catch (err) {
        // Release the session lock on any failure so the guard is not leaked
        // and a later attach (this or another tab) can acquire it. Release is
        // idempotent, so this is safe even if `detachInternal` also runs.
        sessionLockHandle?.release();
        logger.error(`[AD] c:"${this.getKey()}" err :`, err);
        await this.handleConnectError(err);
        throw err;
      } finally {
        this.attachingDocs.delete(doc.getKey());
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
   * `detach` detaches the given channel from this client. The detach is a
   * local cleanup; the server reclaims the session via TTL when heartbeats
   * stop.
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

    // Mark as detaching immediately so the sync loop skips this document.
    attachment.markDetaching();

    const task = async () => {
      try {
        // Wait for any in-progress sync to finish before detaching.
        await attachment.waitForSyncComplete();

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
        attachment.resetDetaching();
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
   * `attachChannel` attaches the given channel to this client. The channel is
   * registered locally and the server is notified on the next RefreshChannel
   * heartbeat.
   */
  public async attachChannel(
    channel: Channel,
    opts: AttachChannelOptions = {},
  ): Promise<Channel> {
    if (channel.getStatus() !== ChannelStatus.Detached) {
      throw new YorkieError(
        Code.ErrNotDetached,
        `${channel.getKey()} is not detached`,
      );
    }

    const syncMode = opts.syncMode ?? SyncMode.Realtime;
    this.assertValidChannelSyncMode(syncMode);

    if (
      opts.channelHeartbeatInterval !== undefined &&
      opts.channelHeartbeatInterval <= 0
    ) {
      throw new YorkieError(
        Code.ErrInvalidArgument,
        'channelHeartbeatInterval must be greater than 0',
      );
    }

    const pollIntervalPinned = opts.channelHeartbeatInterval !== undefined;
    const pollInterval =
      opts.channelHeartbeatInterval ?? this.channelHeartbeatInterval;

    const task = async () => {
      // Channel gets its actor ID from the first refresh response. If the
      // client was already activated (or another channel has triggered the
      // first refresh), propagate the existing id.
      if (this.id) {
        channel.setActor(this.id);
      }

      const attachment = new Attachment<Channel>(
        this.reconnectStreamDelay,
        channel,
        '', // sessionID populated on first refresh response
        syncMode,
        pollInterval,
        pollIntervalPinned,
      );

      // Forward local broadcast events to the RPC client. Capture the
      // unsubscribe so `detachInternal` can tear it down — otherwise
      // re-attaching the same channel accumulates duplicate handlers.
      attachment.unsubscribeLocalBroadcast = channel.subscribe(
        'local-broadcast',
        (event) => {
          const { topic, payload, options } = event;
          this.broadcast(channel.getKey(), topic, payload, options).catch(
            (error) => {
              if (options?.error) options.error(error);
              logger.error(`[BC] c:"${this.getKey()}" failed: ${error}`);
            },
          );
        },
      );

      this.attachmentMap.set(channel.getKey(), attachment);

      // Make sure the sync loop is running so the first refresh fires.
      // The watch stream is opened later by syncInternal once the first
      // refresh response populates this.id (the watch RPC requires it).
      if (!this.conditions[ClientCondition.SyncLoop]) {
        this.runSyncLoop();
      }

      logger.info(
        `[AP] c:"${this.getKey()}" attaches p:"${channel.getKey()}" mode:${syncMode}`,
      );
      return channel;
    };

    return this.enqueueTask(task);
  }

  /**
   * `detachChannel` detaches the given channel from this client. The detach
   * is a local cleanup; the server reclaims the session via TTL when
   * heartbeats stop.
   */
  public async detachChannel(channel: Channel): Promise<Channel> {
    const attachment = this.attachmentMap.get(channel.getKey()) as
      | Attachment<Channel>
      | undefined;
    if (!attachment) {
      throw new YorkieError(
        Code.ErrNotAttached,
        `${channel.getKey()} is not attached`,
      );
    }

    // Mark the attachment as detaching so the sync loop's
    // `attachment.isDetaching()` guard skips it, and wait for any
    // in-flight RefreshChannel to finish before tearing down. Without
    // this, a concurrent first-call refresh would land on a detached
    // channel and emit a PresenceChanged event after the user has
    // detached — and would even re-create the session on the server.
    attachment.markDetaching();
    await attachment.waitForSyncComplete();

    const task = async () => {
      // No DetachChannel RPC: the server reclaims the session via TTL.
      // We only need local cleanup.
      channel.applyStatus(ChannelStatus.Detached);
      this.detachInternal(channel.getKey());

      logger.info(
        `[DP] c:"${this.getKey()}" detaches p:"${channel.getKey()}" (local)`,
      );
      return channel;
    };

    return this.enqueueTask(task);
  }

  /**
   * `changeSyncMode` changes the synchronization mode of the given document.
   */
  public async changeSyncMode<R, P extends Indexable>(
    doc: Document<R, P>,
    syncMode: SyncMode,
  ): Promise<Document<R, P>>;

  /**
   * `changeSyncMode` changes the synchronization mode of the given channel.
   */
  public async changeSyncMode(
    channel: Channel,
    syncMode: SyncMode,
  ): Promise<Channel>;

  /**
   * `changeSyncMode` changes the synchronization mode of the given resource.
   */
  public async changeSyncMode(
    resource: Document<any, any> | Channel,
    syncMode: SyncMode,
  ): Promise<Document<any, any> | Channel> {
    return this.enqueueTask(async () => {
      if (resource instanceof Channel) {
        return this.changeChannelSyncMode(resource, syncMode);
      }
      return this.changeDocumentSyncMode(resource, syncMode);
    });
  }

  private async changeDocumentSyncMode<R, P extends Indexable>(
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

    // Tear down stream first if leaving a stream-using mode (prevents the
    // sync loop from observing an inconsistent mode while the stream is
    // still live).
    if (syncMode === SyncMode.Manual || syncMode === SyncMode.Polling) {
      attachment.cancelWatchStream();
    }

    attachment.changeSyncMode(syncMode);

    // NOTE(hackerwins): In non-pushpull mode, the client does not receive
    // change events from the server. Therefore, we need to set
    // `changeEventReceived` to true to sync the local and remote changes.
    // This has limitations in that unnecessary syncs occur if the client
    // and server do not have any changes.
    if (syncMode === SyncMode.Realtime) {
      attachment.changeEventReceived = true;
    }

    // Recompute interval default if the user did not pin it.
    if (!attachment.pollIntervalPinned) {
      attachment.pollInterval =
        syncMode === SyncMode.Polling ? DefaultDocumentPollIntervalMs : 0;
    }

    // RealtimePushOnly and RealtimeSyncOff retain the watch stream, so
    // no restart is needed when transitioning between them and Realtime.
    // Only Manual and Polling are stream-less modes.
    // Start watch stream if entering a stream-using mode from a stream-less one.
    if (
      (prevSyncMode === SyncMode.Manual || prevSyncMode === SyncMode.Polling) &&
      syncMode !== SyncMode.Manual &&
      syncMode !== SyncMode.Polling
    ) {
      attachment.resetCancelled();
      await this.runWatchLoop(doc.getKey());
    }

    return doc;
  }

  /**
   * `assertValidChannelSyncMode` rejects sync modes that are not valid for
   * channels. `RealtimePushOnly` and `RealtimeSyncOff` are document-only.
   */
  private assertValidChannelSyncMode(syncMode: SyncMode): void {
    if (
      syncMode !== SyncMode.Manual &&
      syncMode !== SyncMode.Realtime &&
      syncMode !== SyncMode.Polling
    ) {
      throw new YorkieError(
        Code.ErrInvalidArgument,
        `invalid channel sync mode: ${syncMode}`,
      );
    }
  }

  private async changeChannelSyncMode(
    channel: Channel,
    syncMode: SyncMode,
  ): Promise<Channel> {
    const attachment = this.attachmentMap.get(channel.getKey());
    if (!attachment) {
      throw new YorkieError(
        Code.ErrNotAttached,
        `${channel.getKey()} is not attached`,
      );
    }

    const prevSyncMode = attachment.syncMode;
    if (prevSyncMode === syncMode) {
      return channel;
    }

    this.assertValidChannelSyncMode(syncMode);

    // Tear down stream if leaving Realtime.
    if (prevSyncMode === SyncMode.Realtime) {
      attachment.cancelWatchStream();
    }

    attachment.changeSyncMode(syncMode);

    // Recompute interval default if the user did not pin it.
    if (!attachment.pollIntervalPinned) {
      attachment.pollInterval =
        syncMode === SyncMode.Manual ? 0 : this.channelHeartbeatInterval;
    }

    // Start watch stream if entering Realtime.
    if (syncMode === SyncMode.Realtime) {
      attachment.resetCancelled();
      await this.runWatchLoop(channel.getKey());
    }

    return channel;
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
    if (!(resource instanceof Channel) && !this.isActive()) {
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
            if (isErrorCode(err, Code.ErrEpochMismatch)) {
              attachment.resource.publish([
                {
                  type: DocEventType.EpochMismatch,
                  value: {
                    method: 'PushPull',
                  },
                },
              ]);
            }
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
    doc.setActor((this.actorID ?? this.id)!);

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
   * `storeKey` scopes a document key to this client's identity before it is
   * used as a `DocStore` key. The session lock is already scoped by
   * `apiKey/clientKey/docKey`; the store must match so a store shared across
   * identities (different apiKey/clientKey) cannot collide on the bare docKey
   * and hand one identity another's persisted envelope.
   */
  private storeKey(docKey: string): string {
    return `${this.apiKey}/${this.key}/${docKey}`;
  }

  /**
   * `persistToStore` saves the given bytes for a store key, serializing writes
   * per key so concurrent saves for the same document cannot interleave and
   * persist stale bytes (an earlier save resolving after a later one). Each key
   * chains onto its previous save; failures are logged, not thrown, and do not
   * break the chain for the next write. `onError` labels the log site.
   */
  private persistToStore(
    storeKey: string,
    bytes: Uint8Array,
    onError: (err: unknown) => void,
  ): void {
    const store = this.store;
    if (!store) {
      return;
    }
    const prev = this.persistQueues.get(storeKey);
    // With no in-flight write for this key, start `store.save` synchronously so
    // a store whose `save` has synchronous side effects (e.g. MemoryDocStore)
    // lands immediately, preserving the pre-serialization observable timing.
    // Only when a previous write is still pending do we chain after it, which
    // is exactly the interleaving case this guards against.
    const next = (
      prev
        ? prev.catch(() => undefined).then(() => store.save(storeKey, bytes))
        : store.save(storeKey, bytes)
    ).catch(onError);
    this.persistQueues.set(storeKey, next);
    // Drop the queue entry once this write is the tail, so the map does not grow
    // for keys that stop being written.
    void next.finally(() => {
      if (this.persistQueues.get(storeKey) === next) {
        this.persistQueues.delete(storeKey);
      }
    });
  }

  /**
   * `removeFromStore` clears the persisted envelope for a document key, scoped
   * to this client's identity. A flaky store must not abort the attach/recover
   * path, so a rejection is logged rather than thrown.
   */
  private async removeFromStore(docKey: string): Promise<void> {
    if (!this.store) {
      return;
    }
    try {
      await this.store.remove(this.storeKey(docKey));
    } catch (err) {
      logger.warn(
        `[PS] c:"${this.getKey()}" store remove d:"${docKey}" failed:`,
        err,
      );
    }
  }

  /**
   * `emitLocalChangesDropped` surfaces an app-visible data-loss event carrying
   * the un-pushed local changes the offline-persistence layer had to discard.
   * The design mandates raising this instead of silently dropping edits when a
   * persisted envelope cannot be reconciled with the server (a stale-epoch
   * re-anchor, a server-side purge, or a store reused under a different actor).
   */
  private emitLocalChangesDropped<R, P extends Indexable>(
    doc: Document<R, P>,
    reason: LocalChangesDroppedReason,
    changes: Array<ChangeStruct<P>>,
  ): void {
    doc.publish([
      {
        type: DocEventType.LocalChangesDropped,
        value: { reason, changes },
      },
    ]);
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
   * `peekChannel` reads the current session count of a channel without
   * creating a session on the server. Use this when the caller only needs
   * to display the count (e.g. "N people writing") without contributing to
   * it and without receiving broadcasts.
   *
   * Unlike `attach({ readOnly: true })`, this does not occupy a `Session`
   * entry on the server, does not generate heartbeat RPCs, and does not
   * subscribe to channel events. Polling is the caller's responsibility.
   */
  public async peekChannel(channelKey: string): Promise<number> {
    return this.enqueueTask(async () => {
      const firstKeyPath = channelKey.split('.')[0];
      const res = await this.rpcClient.peekChannel(
        { channelKey },
        {
          headers: {
            'x-shard-key': `${this.apiKey}/${firstKeyPath}`,
          },
        },
      );
      return Number(res.sessionCount);
    });
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
      if (this.deactivating) {
        logger.debug(`[SL] c:"${this.getKey()}" exit sync loop (deactivating)`);
        this.conditions[ClientCondition.SyncLoop] = false;
        return;
      }
      // Stop the loop only when nothing remains to sync. A channel-only client
      // has no `Activated` status until the first refresh succeeds, but its
      // attachment is enough to keep ticking.
      if (!this.isActive() && this.attachmentMap.size === 0) {
        logger.debug(`[SL] c:"${this.getKey()}" exit sync loop (idle)`);
        this.conditions[ClientCondition.SyncLoop] = false;
        return;
      }

      try {
        await this.enqueueTask(async () => {
          const syncs: Array<any> = [];
          for (const [, attachment] of this.attachmentMap) {
            // Stop syncing if client is being deactivated.
            if (this.deactivating) {
              break;
            }

            if (!attachment.needSync(this.channelHeartbeatInterval)) {
              continue;
            }

            // Skip documents that are being detached.
            if (attachment.isDetaching()) {
              continue;
            }

            // Reset changeEventReceived for Document resources
            if (attachment.changeEventReceived !== undefined) {
              attachment.changeEventReceived = false;
            }

            const syncPromise = this.syncInternal(
              attachment,
              attachment.syncMode!,
            )
              .then(() => {})
              .catch((e) => {
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

                if (isErrorCode(e, Code.ErrEpochMismatch)) {
                  attachment.resource.publish([
                    {
                      type: DocEventType.EpochMismatch,
                      value: {
                        method: 'PushPull',
                      },
                    },
                  ]);
                }

                throw e;
              })
              .finally(() => {
                attachment.clearSyncPromise();
              });

            attachment.setSyncPromise(syncPromise);
            syncs.push(syncPromise);
          }

          await Promise.all(syncs);
          setTimeout(doLoop, this.syncLoopDuration);
        });
      } catch (err) {
        // If the client is deactivating, suppress sync errors from
        // in-flight RPCs and stop the sync loop quietly.
        if (this.deactivating) {
          this.conditions[ClientCondition.SyncLoop] = false;
          return;
        }

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
    // Tear down the `local-broadcast` subscription installed by
    // attachChannel, if any. Without this a re-attach would stack
    // duplicate handlers on the same channel.
    if (attachment.unsubscribeLocalBroadcast) {
      attachment.unsubscribeLocalBroadcast();
      attachment.unsubscribeLocalBroadcast = undefined;
    }
    // Tear down the persist-on-local-change subscription installed by
    // attachDocument, if any. Without this a re-attach would stack duplicate
    // persist handlers on the same document.
    if (attachment.unsubscribePersist) {
      attachment.unsubscribePersist();
      attachment.unsubscribePersist = undefined;
    }
    // Release the single-active-session lock installed by attachDocument on the
    // offline persistence path, so a later tab can take over the document.
    if (attachment.sessionLockHandle) {
      attachment.sessionLockHandle.release();
      attachment.sessionLockHandle = undefined;
    }
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
      const isFirstCall = !resource.getSessionID();
      try {
        const res = await this.rpcClient.refreshChannel(
          {
            clientId: this.id ?? '',
            channelKey: resource.getKey(),
            sessionId: resource.getSessionID() ?? '',
            // First-call only — these fields are ignored by the server
            // once a session_id is established.
            clientKey: isFirstCall ? this.key : '',
            metadata: isFirstCall ? this.metadata : {},
          },
          {
            headers: {
              'x-shard-key': `${this.apiKey}/${resource.getFirstKeyPath()}`,
            },
          },
        );

        if (isFirstCall) {
          // Drop late first-call responses that arrive after `deactivate()`
          // started, so we don't resurrect `this.id`/`this.status` that
          // deactivate is about to clear.
          if (this.deactivating || attachment.isDetaching()) {
            return resource;
          }
          // Server has just activated the client and attached the channel.
          // Only adopt the server-issued client_id when we don't already
          // have one. If the client was already activated (e.g. via
          // `client.activate()` or a previous channel's first-call), keep
          // our existing id so prior document attachments stay valid.
          if (res.clientId && !this.id) {
            this.id = res.clientId;
            this.status = ClientStatus.Activated;
            resource.setActor(res.clientId);
          } else if (this.id) {
            resource.setActor(this.id);
          }
          // Defer the Attached transition until a real session_id arrives.
          // If the server replies with empty `sessionId` (protocol drift,
          // partial response) the channel stays Detached and the next tick
          // re-enters the first-call branch instead of flapping through
          // an Attached state with no session.
          if (res.sessionId) {
            resource.setSessionID(res.sessionId);
            attachment.resourceID = res.sessionId;
            resource.applyStatus(ChannelStatus.Attached);
          }

          // Realtime channels need a watch stream; open it now that
          // this.id is populated. `runWatchLoop` is idempotent against
          // re-entry via `attachment.watchStream`, so no global flag check
          // is needed (and using a global flag would silently block any
          // subsequent attachment from opening its own stream).
          if (attachment.syncMode === SyncMode.Realtime) {
            this.runWatchLoop(resource.getKey()).catch((err) => {
              logger.error(
                `[WP] c:"${this.getKey()}" failed to start watch for p:"${resource.getKey()}":`,
                err,
              );
            });
          }
        }

        const prevCount = resource.getSessionCount();
        if (resource.updateSessionCount(Number(res.sessionCount), 0)) {
          if (resource.getSessionCount() !== prevCount) {
            resource.publish({
              type: ChannelEventType.PresenceChanged,
              count: resource.getSessionCount(),
            });
          }
        }
        attachment.updateHeartbeatTime();

        logger.debug(
          `[RP] c:"${this.getKey()}" refreshes p:"${resource.getKey()}" mode:${attachment.syncMode}`,
        );
      } catch (err) {
        if (isErrorCode(err, Code.ErrSessionNotFound)) {
          // Server has reclaimed our session (TTL expiry, restart, etc.).
          // Clear local sessionID so the next tick re-enters the first-call
          // branch and re-attaches transparently. Do not surface to caller.
          logger.info(
            `[RP] c:"${this.getKey()}" session expired for p:"${resource.getKey()}", re-attaching`,
          );
          resource.setSessionID('');
          attachment.resourceID = '';
          return resource;
        }

        // Surface the failure to channel subscribers so React layers can
        // render an error state. Any subsequent successful event implies
        // recovery — there is no separate "recovered" event. Skip the
        // publish during teardown so a spurious error badge doesn't flash
        // on the way out (mirrors the deactivate guard in the success path).
        if (!this.deactivating && !attachment.isDetaching()) {
          resource.publish({
            type: ChannelEventType.SyncError,
            error: err,
            method: 'RefreshChannel',
          });
        }

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
          disableGc: attachment.disableGC,
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
      attachment.updateHeartbeatTime();

      // Re-persist after a successful sync when a store is configured. A push
      // that is merely acked (nothing pulled) advances the checkpoint and
      // drops the pushed changes from `localChanges` without emitting any
      // Remote/Snapshot event, so the event-driven persist alone would leave
      // the stored envelope holding already-pushed changes and a stale
      // checkpoint until the next local edit. This is a full overwrite (not an
      // append), so it does not grow unbounded. Errors are logged, not thrown.
      if (this.store) {
        this.persistToStore(
          this.storeKey(doc.getKey()),
          doc.toBytes(),
          (err) => {
            logger.error(
              `[PS] c:"${this.getKey()}" persist-on-sync d:"${doc.getKey()}" ` +
                `failed:`,
              err,
            );
          },
        );
      }

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
      logger.error(`[WD] c:"${this.getKey()}" err :`, err.rawMessage);
      return true;
    }

    // NOTE(emplam27): If the error is 'ErrTooManyAttachments' it means,
    // that the client has reached the maximum number of allowed attachments.
    // In this case, the client should remove some attachments.
    if (errorCodeOf(err) === Code.ErrTooManyAttachments) {
      return false;
    }

    // NOTE(hackerwins): If the error is 'ErrEpochMismatch', it means the
    // document has been compacted and the client's checkpoint is stale.
    // The sync loop should stop, and the user must detach and reattach.
    if (errorCodeOf(err) === Code.ErrEpochMismatch) {
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
