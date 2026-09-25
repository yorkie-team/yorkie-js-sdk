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
