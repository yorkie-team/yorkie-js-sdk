/*
 * Copyright 2022 The Yorkie Authors. All rights reserved.
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

import { Code, YorkieError } from '@yorkie-js/sdk/src/util/error';

/**
 * `EscapeString` escapes the given string.
 */
export function escapeString(str: string): string {
  return str.replace(/["'\\\n\r\f\b\t\u2028\u2029]/g, function (character) {
    switch (character) {
      case '"':
      case '\\':
        return '\\' + character;
      case '\n':
        return '\\n';
      case '\r':
        return '\\r';
      case '\f':
        return '\\f';
      case '\b':
        return '\\b';
      case '\t':
        return '\\t';
      case '\u2028':
        return '\\u2028';
      case '\u2029':
        return '\\u2029';
      default:
        return character;
    }
  });
}

/**
 * `splitsSurrogatePair` reports whether a boundary between the code units
 * `before` and `after` falls inside a surrogate pair. A missing unit (NaN,
 * what `charCodeAt` returns past either end) never pairs.
 */
export function splitsSurrogatePair(before: number, after: number): boolean {
  return (
    before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff
  );
}

/**
 * `isUTF16Boundary` reports whether `offset`, counted in UTF-16 code units, is
 * a valid boundary in `value`, i.e. it does not fall between the high and the
 * low surrogate of a pair.
 */
export function isUTF16Boundary(value: string, offset: number): boolean {
  return !splitsSurrogatePair(
    value.charCodeAt(offset - 1),
    value.charCodeAt(offset),
  );
}

/**
 * `ensureUTF16Boundary` throws when a local index between the code units
 * `before` and `after` splits a surrogate pair. An index there would split
 * the node mid-pair, and the SDKs store the lone halves differently: Go
 * turns each into U+FFFD, JS keeps the raw code unit. Rejecting it keeps the
 * same operation from leaving different text on different replicas.
 */
export function ensureUTF16Boundary(before: number, after: number): void {
  if (splitsSurrogatePair(before, after)) {
    throw new YorkieError(
      Code.ErrInvalidArgument,
      'index must not split a UTF-16 surrogate pair',
    );
  }
}
