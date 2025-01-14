/*
 * Copyright 2024 The Yorkie Authors. All rights reserved.
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

import type { PrimitiveValue } from '@yorkie-js-sdk/src/document/crdt/primitive';
import type { CRDTTreePosStruct } from '@yorkie-js-sdk/src/document/crdt/tree';
import { CounterValue } from '@yorkie-js-sdk/src/document/crdt/counter';
import {
  Json,
  DocEvent,
  DocEventType,
  type Indexable,
  type StatusChangedEvent,
  type SnapshotEvent,
  type LocalChangeEvent,
  type RemoteChangeEvent,
  type InitializedEvent,
  type WatchedEvent,
  type UnwatchedEvent,
  type PresenceChangedEvent,
} from '@yorkie-js-sdk/src/document/document';
import type { OperationInfo } from '@yorkie-js-sdk/src/document/operation/operation';

/**
 * `Client` represents a client value in devtools.
 */
export type Client = {
  clientID: string;
  presence: Json;
};

/**
 * `JSONElement` represents the result of `Element.toJSForTest()`.
 */
export type JSONElement = {
  type: JSONElementType;
  key?: string;
  value: JSONElementValue;
  createdAt: string;
};

type JSONElementType =
  | 'YORKIE_PRIMITIVE'
  | 'YORKIE_COUNTER'
  | 'YORKIE_OBJECT'
  | 'YORKIE_ARRAY'
  | 'YORKIE_TEXT'
  | 'YORKIE_TREE';

/**
 * `ElementValue` represents the result of `Element.toJSForTest()`.
 *
 * NOTE(chacha912): Json type is used to represent the result of
 * `Text.toJSForTest()` and `Tree.toJSForTest()`.
 */
type JSONElementValue =
  | PrimitiveValue
  | CounterValue
  | ContainerValue // Array | Object
  | Json; // Text | Tree

/**
 * `ContainerValue` represents the result of `Array.toJSForTest()` and
 * `Object.toJSForTest()`.
 */
export type ContainerValue = {
  [key: string]: JSONElement;
};

/**
 * `TreeNodeInfo` represents the crdt tree node information in devtools.
 */
export type TreeNodeInfo = {
  id: string;
  type: string;
  parent?: string;
  size: number;
  value?: string;
  removedAt?: string;
  isRemoved: boolean;
  insPrev?: string;
  insNext?: string;
  children: Array<TreeNodeInfo>;
  attributes?: object; // TODO(chacha912): Specify the type accurately.
  depth: number;
  index?: number;
  path?: Array<number>;
  pos?: CRDTTreePosStruct;
};

/**
 * `DocEventForReplay` is an event used to replay a document.
 */
export type DocEventForReplay<
  P extends Indexable = Indexable,
  T = OperationInfo,
> =
  | StatusChangedEvent
  | SnapshotEvent
  | LocalChangeEvent<T, P>
  | RemoteChangeEvent<T, P>
  | InitializedEvent<P>
  | WatchedEvent<P>
  | UnwatchedEvent<P>
  | PresenceChangedEvent<P>;

/**
 * `DocEventsForReplay` is a list of events used to replay a document.
 */
export type DocEventsForReplay = Array<DocEventForReplay>;

/**
 * `isDocEventForReplay` checks if an event can be used to replay a document.
 */
export function isDocEventForReplay(
  event: DocEvent,
): event is DocEventForReplay {
  const types = [
    DocEventType.StatusChanged,
    DocEventType.Snapshot,
    DocEventType.LocalChange,
    DocEventType.RemoteChange,
    DocEventType.Initialized,
    DocEventType.Watched,
    DocEventType.Unwatched,
    DocEventType.PresenceChanged,
  ];

  return types.includes(event.type);
}

/**
 * `isDocEventsForReplay` checks if a list of events can be used to replay a document.
 */
export function isDocEventsForReplay(
  events: Array<DocEvent>,
): events is DocEventsForReplay {
  return events.every(isDocEventForReplay);
}
