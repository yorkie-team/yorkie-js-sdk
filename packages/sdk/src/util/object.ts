/*
 * Copyright 2023 The Yorkie Authors. All rights reserved.
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

import { Indexable } from '@yorkie-js/sdk/src/document/document';

/**
 * `deepcopy` returns a deep copy of the given object.
 */
export function deepcopy<T>(object: T): T {
  if (object instanceof Map) {
    const pairs = Array.from(object);
    return new Map(JSON.parse(JSON.stringify(pairs))) as unknown as T;
  }

  return JSON.parse(JSON.stringify(object));
}

/**
 `isEmpty` returns whether parameter object is empty or not 
 */
export const isEmpty = (object: object) => {
  if (!object) {
    return true;
  }

  return Object.entries(object).length === 0;
};

/**
 * `stringifyObjectValues` makes values of attributes to JSON parsable string.
 */
export const stringifyObjectValues = <A extends Indexable>(
  attributes: A,
): Record<string, string> => {
  const attrs: Record<string, string> = {};
  for (const [key, value] of Object.entries(attributes)) {
    // A string that is not itself a JSON document is stored as-is, which is
    // what the Go SDK stores for the same attribute: its `Style` takes
    // map[string]string and holds what it is given. `color="red"` therefore
    // puts the same three bytes on the wire from either SDK.
    //
    // A string that IS a JSON document keeps its quotes, because raw storage
    // could not tell it from the value it encodes: '1' would come back as the
    // number 1 and 'true' as the boolean. Those keep the encoding that
    // preserves their type, at the cost of still differing from Go -- which
    // cannot express the distinction at all.
    attrs[key] =
      typeof value === 'string' && !isJSONDocument(value)
        ? value
        : JSON.stringify(value);
  }
  return attrs;
};

/**
 `parseObjectValues` returns the JSON parsable string values to the origin states.
 */
export const parseObjectValues = <A extends Indexable>(
  attrs: Record<string, string>,
): A => {
  const attributes: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(attrs)) {
    attributes[key] = parseAttrValue(value);
  }
  return attributes as A;
};

/**
 * `isJSONDocument` reports whether the given string would parse as JSON, and
 * so could not be told apart from the value it encodes if it were stored raw.
 */
const isJSONDocument = (value: string): boolean => {
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
};

/**
 * `parseAttrValue` decodes one stored attribute value, tolerating one written
 * by a peer that stores values RAW.
 *
 * The Go SDK's `Style` takes `map[string]string` and stores what it is given,
 * so `color="red"` arrives here as the three characters `red`, which is not a
 * JSON document. Parsing it unguarded threw `SyntaxError` out of
 * `applyChangePack` before the checkpoint advanced, so the server redelivered
 * the same change forever and the client could never open the document.
 *
 * Falling back to the raw string is lossless: it is exactly what the peer
 * wrote. It cannot change how a JS-authored value reads, because everything
 * this SDK writes goes through `JSON.stringify` and is valid JSON by
 * construction, so the fallback is unreachable for those.
 */
export const parseAttrValue = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};
