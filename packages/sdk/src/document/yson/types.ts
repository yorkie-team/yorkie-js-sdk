/*
 * Copyright 2025 The Yorkie Authors. All rights reserved.
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
 * `YSONTextNode` represents a single character in a Text CRDT.
 *
 * @example
 * ```typescript
 * { val: 'H', attrs: { bold: true } }
 * ```
 */
export interface YSONTextNode {
  /**
   * The character value
   */
  val: string;

  /**
   * Optional attributes (e.g., formatting)
   */
  attrs?: Record<string, any>;
}

/**
 * `YSONText` represents a Text CRDT structure.
 *
 * @example
 * ```typescript
 * {
 *   type: 'Text',
 *   nodes: [
 *     { val: 'H' },
 *     { val: 'i' }
 *   ]
 * }
 * ```
 */
export interface YSONText {
  type: 'Text';
  nodes: Array<YSONTextNode>;
}

/**
 * `YSONTreeNode` represents a node in a Tree CRDT.
 *
 * For text nodes: `{ type: 'text', value: 'content' }`
 * For element nodes: `{ type: 'p', children: [...] }`
 */
export interface YSONTreeNode {
  /**
   * Node type (e.g., 'text', 'p', 'div')
   */
  type: string;

  /**
   * Text content (for text nodes)
   */
  value?: string;

  /**
   * Attributes (for element nodes)
   */
  attrs?: Record<string, string>;

  /**
   * Child nodes (for element nodes)
   */
  children?: Array<YSONTreeNode>;
}

/**
 * `YSONTree` represents a Tree CRDT structure.
 *
 * @example
 * ```typescript
 * {
 *   type: 'Tree',
 *   root: {
 *     type: 'doc',
 *     children: [
 *       { type: 'p', children: [{ type: 'text', value: 'Hello' }] }
 *     ]
 *   }
 * }
 * ```
 */
export interface YSONTree {
  type: 'Tree';
  root: YSONTreeNode;
}

/**
 * `YSONInt` represents a 32-bit integer.
 *
 * @example
 * ```typescript
 * { type: 'Int', value: 42 }
 * ```
 */
export interface YSONInt {
  type: 'Int';
  value: number;
}

/**
 * `YSONLong` represents a 64-bit integer.
 *
 * @example
 * ```typescript
 * { type: 'Long', value: 64 }
 * ```
 */
export interface YSONLong {
  type: 'Long';
  value: number;
}

/**
 * `YSONDate` represents an ISO 8601 timestamp.
 *
 * @example
 * ```typescript
 * { type: 'Date', value: '2025-01-02T15:04:05.058Z' }
 * ```
 */
export interface YSONDate {
  type: 'Date';
  value: string;
}

/**
 * `YSONBinData` represents Base64-encoded binary data.
 *
 * @example
 * ```typescript
 * { type: 'BinData', value: 'AQID' }
 * ```
 */
export interface YSONBinData {
  type: 'BinData';
  value: string;
}

/**
 * `YSONCounter` represents a Counter CRDT for collaborative counting.
 *
 * @example
 * ```typescript
 * { type: 'Counter', value: { type: 'Int', value: 10 } }
 * ```
 */
export interface YSONCounter {
  type: 'Counter';
  value: YSONInt | YSONLong;
}

/**
 * `YSONValue` represents any valid YSON value.
 *
 * Can be:
 * - Primitives: string, number, boolean, null
 * - Collections: arrays, objects
 * - CRDT types: Text, Tree, Counter
 * - Special types: Int, Long, Date, BinData
 */
export type YSONValue =
  | string
  | number
  | boolean
  // eslint-disable-next-line @typescript-eslint/no-restricted-types
  | null
  | YSONText
  | YSONTree
  | YSONInt
  | YSONLong
  | YSONDate
  | YSONBinData
  | YSONCounter
  | { [key: string]: YSONValue }
  | Array<YSONValue>;

/**
 * `isText` checks if a value is a YSONText object.
 */
export function isText(value: any): value is YSONText {
  return (
    typeof value === 'object' &&
    value !== null &&
    value.type === 'Text' &&
    Array.isArray(value.nodes)
  );
}

/**
 * `isTree` checks if a value is a YSONTree object.
 */
export function isTree(value: any): value is YSONTree {
  return (
    typeof value === 'object' &&
    value !== null &&
    value.type === 'Tree' &&
    typeof value.root === 'object'
  );
}

/**
 * `isInt` checks if a value is a YSONInt object.
 */
export function isInt(value: any): value is YSONInt {
  return (
    typeof value === 'object' &&
    value !== null &&
    value.type === 'Int' &&
    typeof value.value === 'number'
  );
}

/**
 * `isLong` checks if a value is a YSONLong object.
 */
export function isLong(value: any): value is YSONLong {
  return (
    typeof value === 'object' &&
    value !== null &&
    value.type === 'Long' &&
    typeof value.value === 'number'
  );
}

/**
 * `isDate` checks if a value is a YSONDate object.
 */
export function isDate(value: any): value is YSONDate {
  return (
    typeof value === 'object' &&
    value !== null &&
    value.type === 'Date' &&
    typeof value.value === 'string'
  );
}

/**
 * `isBinData` checks if a value is a YSONBinData object.
 */
export function isBinData(value: any): value is YSONBinData {
  return (
    typeof value === 'object' &&
    value !== null &&
    value.type === 'BinData' &&
    typeof value.value === 'string'
  );
}

/**
 * `isCounter` checks if a value is a YSONCounter object.
 */
export function isCounter(value: any): value is YSONCounter {
  return (
    typeof value === 'object' &&
    value !== null &&
    value.type === 'Counter' &&
    typeof value.value === 'object'
  );
}

/**
 * `isObject` checks if a value is a plain YSON object (not a special type).
 */
export function isObject(value: any): value is { [key: string]: YSONValue } {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !isText(value) &&
    !isTree(value) &&
    !isInt(value) &&
    !isLong(value) &&
    !isDate(value) &&
    !isBinData(value) &&
    !isCounter(value)
  );
}
