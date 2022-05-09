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

import { Client, ClientOptions } from '@yorkie-js-sdk/src/core/client';
import {
  DocumentReplica,
  Indexable,
} from '@yorkie-js-sdk/src/document/document';

export {
  Client,
  PresenceInfo,
  ClientEvent,
  ClientStatus,
  StreamConnectionStatus,
  DocumentSyncResultType,
  ClientEventType,
  StatusChangedEvent,
  DocumentsChangedEvent,
  PeersChangedEvent,
  StreamConnectionStatusChangedEvent,
  DocumentSyncedEvent,
  ClientOptions,
} from '@yorkie-js-sdk/src/core/client';
export {
  DocEventType,
  SnapshotEvent,
  LocalChangeEvent,
  RemoteChangeEvent,
  Indexable,
  DocEvent,
  DocumentReplica,
} from '@yorkie-js-sdk/src/document/document';
export {
  Observer,
  Observable,
  NextFn,
  ErrorFn,
  CompleteFn,
  Unsubscribe,
} from '@yorkie-js-sdk/src/util/observable';
export { TimeTicket } from '@yorkie-js-sdk/src/document/time/ticket';
export { ActorID } from '@yorkie-js-sdk/src/document/time/actor_id';
export {
  TextChange,
  TextChangeType,
} from '@yorkie-js-sdk/src/document/json/rga_tree_split';
export { JSONElement } from '@yorkie-js-sdk/src/document/json/element';
export { JSONArray } from '@yorkie-js-sdk/src/document/proxy/array_proxy';
export { Counter } from '@yorkie-js-sdk/src/document/proxy/counter_proxy';
export { JSONObject } from '@yorkie-js-sdk/src/document/proxy/object_proxy';
export { RichText } from '@yorkie-js-sdk/src/document/proxy/rich_text_proxy';
export { PlainText } from '@yorkie-js-sdk/src/document/proxy/text_proxy';

/**
 * `createClient` creates a new instance of `Client`.
 *
 * @public
 */
export function createClient<M = Indexable>(
  rpcAddr: string,
  opts?: ClientOptions<M>,
): Client<M> {
  return new Client(rpcAddr, opts);
}

/**
 * `createDocument` creates a new instance of `DocumentReplica`.
 *
 * @public
 */
export function createDocument<T = Indexable>(key: string): DocumentReplica<T> {
  return new DocumentReplica<T>(key);
}

/**
 * The top-level yorkie namespace with additional properties.
 *
 * In production, this will be called exactly once and the result
 * assigned to the `yorkie` global.
 *
 * e.g) `yorkie.createClient(...);`
 *
 * @public
 */
const yorkie = {
  createClient,
  createDocument,
};

export default yorkie;
