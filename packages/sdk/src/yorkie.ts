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

import { Client } from '@yorkie-js-sdk/src/client/client';
import { Document } from '@yorkie-js-sdk/src/document/document';
import { Text } from '@yorkie-js-sdk/src/document/json/text';
import { Tree } from '@yorkie-js-sdk/src/document/json/tree';
import { Counter } from '@yorkie-js-sdk/src/document/json/counter';
import { CounterType } from '@yorkie-js-sdk/src/document/crdt/counter';
import * as Devtools from '@yorkie-js-sdk/src/devtools/types';

export {
  Client,
  ClientStatus,
  ClientCondition,
  SyncMode,
  type ClientOptions,
} from '@yorkie-js-sdk/src/client/client';
export {
  DocEventType,
  type SnapshotEvent,
  type LocalChangeEvent,
  type RemoteChangeEvent,
  type ConnectionChangedEvent,
  type SyncStatusChangedEvent,
  type WatchedEvent,
  type UnwatchedEvent,
  type PresenceChangedEvent,
  type InitializedEvent,
  StreamConnectionStatus,
  DocSyncStatus,
  DocStatus,
  type Indexable,
  type DocEvent,
  type TransactionEvent,
  Document,
  type ChangeInfo,
} from '@yorkie-js-sdk/src/document/document';
export {
  type Observer,
  type Observable,
  type NextFn,
  type ErrorFn,
  type CompleteFn,
  type Unsubscribe,
} from '@yorkie-js-sdk/src/util/observable';
export {
  TimeTicket,
  type TimeTicketStruct,
} from '@yorkie-js-sdk/src/document/time/ticket';
export { type ActorID } from '@yorkie-js-sdk/src/document/time/actor_id';
export { VersionVector } from '@yorkie-js-sdk/src/document/time/version_vector';
export type {
  OperationInfo,
  TextOperationInfo,
  CounterOperationInfo,
  ArrayOperationInfo,
  ObjectOperationInfo,
  TreeOperationInfo,
  AddOpInfo,
  IncreaseOpInfo,
  RemoveOpInfo,
  SetOpInfo,
  MoveOpInfo,
  EditOpInfo,
  StyleOpInfo,
  TreeEditOpInfo,
  TreeStyleOpInfo,
} from '@yorkie-js-sdk/src/document/operation/operation';
export { OpSource } from '@yorkie-js-sdk/src/document/operation/operation';

export {
  Primitive,
  type PrimitiveValue,
} from '@yorkie-js-sdk/src/document/crdt/primitive';
import { Primitive } from '@yorkie-js-sdk/src/document/crdt/primitive';

export {
  type WrappedElement,
  type JSONElement,
} from '@yorkie-js-sdk/src/document/json/element';
export { type JSONObject } from '@yorkie-js-sdk/src/document/json/object';
export { type JSONArray } from '@yorkie-js-sdk/src/document/json/array';
export { Counter } from '@yorkie-js-sdk/src/document/json/counter';
export { type CounterValue } from '@yorkie-js-sdk/src/document/crdt/counter';
export {
  Text,
  type TextPosStruct,
  type TextPosStructRange,
} from '@yorkie-js-sdk/src/document/json/text';
export {
  Tree,
  type TreeNode,
  type ElementNode,
  type TextNode,
  type TreeChange,
  type TreeChangeType,
  type CRDTTreeNodeIDStruct,
  type TreePosStructRange,
} from '@yorkie-js-sdk/src/document/json/tree';
export { Change } from '@yorkie-js-sdk/src/document/change/change';
export { converter } from '@yorkie-js-sdk/src/api/converter';

import { LogLevel, setLogLevel } from '@yorkie-js-sdk/src/util/logger';
export { LogLevel, setLogLevel } from '@yorkie-js-sdk/src/util/logger';

export {
  EventSourceDevPanel,
  EventSourceSDK,
  type PanelToSDKMessage,
  type SDKToPanelMessage,
  type FullPanelToSDKMessage,
  type FullSDKToPanelMessage,
} from '@yorkie-js-sdk/src/devtools/protocol';
export { Devtools };

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
export default {
  Client,
  Document,
  Primitive,
  Text,
  Counter,
  Tree,
  LogLevel,
  setLogLevel,
  IntType: CounterType.IntegerCnt,
  LongType: CounterType.LongCnt,
};

// TODO(hackerwins): Remove this when we have a better way to expose the API.
if (typeof globalThis !== 'undefined') {
  (globalThis as any).yorkie = {
    Client,
    Document,
    Primitive,
    Text,
    Counter,
    Tree,
    LogLevel,
    setLogLevel,
    IntType: CounterType.IntegerCnt,
    LongType: CounterType.LongCnt,
  };
}
