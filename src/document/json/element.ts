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

import { ChangeContext } from '@yorkie-js-sdk/src/document/change/context';
import { CRDTElement } from '@yorkie-js-sdk/src/document/crdt/element';
import { CRDTObject } from '@yorkie-js-sdk/src/document/crdt/object';
import { CRDTArray } from '@yorkie-js-sdk/src/document/crdt/array';
import {
  Primitive,
  PrimitiveValue,
} from '@yorkie-js-sdk/src/document/crdt/primitive';
import { CRDTText } from '@yorkie-js-sdk/src/document/crdt/text';
import {
  CounterType,
  CRDTCounter,
} from '@yorkie-js-sdk/src/document/crdt/counter';
import { CRDTTree } from '@yorkie-js-sdk/src/document/crdt/tree';

import {
  JSONObject,
  createJSONObject,
} from '@yorkie-js-sdk/src/document/json/object';
import {
  JSONArray,
  createJSONArray,
} from '@yorkie-js-sdk/src/document/json/array';
import { Text } from '@yorkie-js-sdk/src/document/json/text';
import { Counter } from '@yorkie-js-sdk/src/document/json/counter';
import { Tree } from '@yorkie-js-sdk/src/document/json/tree';
import { Indexable } from '../document';

/**
 * `createJSON` create a new instance of JSONObject.
 */
export function createJSON<T>(
  context: ChangeContext,
  target: CRDTObject,
): JSONObject<T> {
  return createJSONObject(context, target);
}

/**
 * `WrappedElement` is a wrapper of JSONElement that provides `getID()`.
 */
export type WrappedElement<T = unknown, A extends Indexable = Indexable> =
  | Primitive
  | JSONObject<T>
  | JSONArray<T>
  | Text<A>
  | Counter
  | Tree;

/**
 * `JSONElement` is a wrapper for `CRDTElement` that provides users with an
 * easy-to-use interface for manipulating `Document`s.
 */
export type JSONElement<T = unknown, A extends Indexable = Indexable> =
  | PrimitiveValue
  | JSONObject<T>
  | JSONArray<T>
  | Text<A>
  | Counter
  | Tree;

/**
 * `toWrappedElement` converts the CRDT type to `WrappedElement`.
 */
export function toWrappedElement(
  context: ChangeContext,
  elem?: CRDTElement,
): WrappedElement | undefined {
  if (!elem) {
    return;
  } else if (elem instanceof Primitive) {
    return elem;
  } else if (elem instanceof CRDTObject) {
    return createJSONObject(context, elem);
  } else if (elem instanceof CRDTArray) {
    return createJSONArray(context, elem);
  } else if (elem instanceof CRDTText) {
    return new Text(context, elem);
  } else if (elem instanceof CRDTCounter) {
    const counter = new Counter(CounterType.IntegerCnt, 0);
    counter.initialize(context, elem);
    return counter;
  } else if (elem instanceof CRDTTree) {
    const tree = new Tree();
    tree.initialize(context, elem);
    return tree;
  }

  throw new TypeError(`Unsupported type of element: ${typeof elem}`);
}

/**
 * `toJSONElement` converts the CRDT type to `JSONElement`.
 */
export function toJSONElement(
  context: ChangeContext,
  elem?: CRDTElement,
): JSONElement | undefined {
  const wrappedElement = toWrappedElement(context, elem);
  if (wrappedElement instanceof Primitive) {
    return wrappedElement.getValue();
  }

  return wrappedElement;
}
