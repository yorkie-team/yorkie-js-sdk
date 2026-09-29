/*
 * Copyright 2026 The Yorkie Authors. All rights reserved.
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
 * `stringifyValue` renders a document or presence value for display.
 *
 * `JSON.stringify` throws on a `bigint`, and the panel has no error boundary,
 * so one such value anywhere in a document takes the whole panel down. A
 * document collects them without anyone asking: the SDK stores an integer
 * outside the int32 range as a Long, and reading it back gives a `bigint`. An
 * epoch-millisecond timestamp is already past that range, so any application
 * that keeps one in a document hits this.
 *
 * The suffix marks what a plain number would not say, since `9007199254740993`
 * and `9007199254740993n` are different values that both print the same.
 */
export function stringifyValue(value: unknown, space?: number): string {
  return JSON.stringify(
    value,
    (_key, item) => (typeof item === 'bigint' ? `${item}n` : item),
    space,
  );
}

/**
 * `replaceBigInts` returns a copy of the given value with every `bigint` inside
 * it rendered the way `stringifyValue` renders one, and everything else left
 * alone.
 *
 * Not every consumer of a document value is a string: `react-json-view` takes
 * the object itself, and a `chrome.runtime.Port` serializes one as JSON on the
 * way to the panel. Both refuse a `bigint` the same way `JSON.stringify` does,
 * so both need it replaced before they see it.
 */
export function replaceBigInts(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return `${value}n`;
  }
  if (Array.isArray(value)) {
    return value.map(replaceBigInts);
  }
  if (value !== null && typeof value === 'object') {
    const replaced: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      replaced[key] = replaceBigInts(item);
    }
    return replaced;
  }
  return value;
}
