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

/**
 * `Json` represents a JSON value.
 *
 * TODO(hackerwins): We need to replace `Indexable` with `Json`.
 */
export type Json =
  | string
  | number
  | boolean
  // eslint-disable-next-line @typescript-eslint/ban-types
  | null
  | { [key: string]: Json }
  | Array<Json>;

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
