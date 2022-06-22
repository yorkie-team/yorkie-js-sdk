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

import { Client } from '@yorkie-js-sdk/src/core/client';
import { Document } from '@yorkie-js-sdk/src/document/document';
import { Text } from '@yorkie-js-sdk/src/document/json/text';
import { RichText } from '@yorkie-js-sdk/src/document/json/rich_text';
import { Counter } from '@yorkie-js-sdk/src/document/json/counter';

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
  Document,
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
} from '@yorkie-js-sdk/src/document/crdt/rga_tree_split';
export {
  Primitive,
  PrimitiveValue,
} from '@yorkie-js-sdk/src/document/crdt/primitive';
export {
  WrappedElement,
  JSONElement,
} from '@yorkie-js-sdk/src/document/json/element';
export { JSONObject } from '@yorkie-js-sdk/src/document/json/object';
export { JSONArray } from '@yorkie-js-sdk/src/document/json/array';
export { Counter } from '@yorkie-js-sdk/src/document/json/counter';
export { RichText } from '@yorkie-js-sdk/src/document/json/rich_text';
export { Text } from '@yorkie-js-sdk/src/document/json/text';

/**
 * The top-level yorkie namespace with additional properties.
 *
 * In production, this will be called exactly once and the result
 * assigned to the `yorkie` global.
 *
 * e.g) `new yorkie.Client(...);`
 *
 * @public
 */
const yorkie = {
  Client,
  Document,
  Text,
  RichText,
  Counter,
};

export default yorkie;
