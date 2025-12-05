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

import { Code, YorkieError } from '@yorkie-js/sdk/src/util/error';
import type {
  YSONValue,
  YSONText,
  YSONTree,
  YSONTextNode,
  YSONTreeNode,
  YSONInt,
  YSONLong,
  YSONDate,
  YSONBinData,
  YSONCounter,
} from './types';

/**
 * `parse` parses a YSON string into a typed JavaScript object.
 *
 * YSON extends JSON to support Yorkie CRDT types:
 * - `Text([...])` for Text CRDT
 * - `Tree(...)` for Tree CRDT
 * - Standard JSON for primitives, objects, and arrays
 *
 * @param yson - YSON formatted string
 * @returns Parsed YSONValue
 * @throws YorkieError if parsing fails
 *
 * @example
 * ```typescript
 * const data = parse('{"content":Text([{"val":"Hi"}])}');
 * // { content: { type: 'Text', nodes: [{ val: 'Hi' }] } }
 * ```
 */
export function parse(yson: string): YSONValue {
  try {
    // Preprocess YSON string to handle special types
    const processed = preprocessYSON(yson);

    // Parse as JSON
    const parsed = JSON.parse(processed);

    // Post-process to restore type information
    return postprocessValue(parsed);
  } catch (err) {
    throw new YorkieError(
      Code.ErrInvalidArgument,
      `Failed to parse YSON: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * `preprocessYSON` converts YSON special syntax to JSON-compatible format.
 *
 * Transformations:
 * - `Text([...])` → `{"__yson_type":"Text","__yson_data":[...]}`
 * - `Tree(...)` → `{"__yson_type":"Tree","__yson_data":...}`
 * - `Int(42)` → `{"__yson_type":"Int","__yson_data":42}`
 * - `Long(64)` → `{"__yson_type":"Long","__yson_data":64}`
 * - `Date("...")` → `{"__yson_type":"Date","__yson_data":"..."}`
 * - `BinData("...")` → `{"__yson_type":"BinData","__yson_data":"..."}`
 * - `Counter(Int(10))` → `{"__yson_type":"Counter","__yson_data":{"__yson_type":"Int","__yson_data":10}}`
 */
function preprocessYSON(yson: string): string {
  let result = yson;

  // Handle Counter type first (as it may contain Int/Long)
  // Counter(Int(10)) → {"__yson_type":"Counter","__yson_data":{"__yson_type":"Int","__yson_data":10}}
  result = result.replace(
    /Counter\((Int|Long)\((-?\d+)\)\)/g,
    (_, type, value) => {
      return `{"__yson_type":"Counter","__yson_data":{"__yson_type":"${type}","__yson_data":${value}}}`;
    },
  );

  // Handle Int type: Int(42) → {"__yson_type":"Int","__yson_data":42}
  result = result.replace(/Int\((-?\d+)\)/g, (_, value) => {
    return `{"__yson_type":"Int","__yson_data":${value}}`;
  });

  // Handle Long type: Long(64) → {"__yson_type":"Long","__yson_data":64}
  result = result.replace(/Long\((-?\d+)\)/g, (_, value) => {
    return `{"__yson_type":"Long","__yson_data":${value}}`;
  });

  // Handle Date type: Date("2025-01-02T15:04:05.058Z") → {"__yson_type":"Date","__yson_data":"2025-01-02T15:04:05.058Z"}
  result = result.replace(/Date\("([^"]*)"\)/g, (_, value) => {
    return `{"__yson_type":"Date","__yson_data":"${value}"}`;
  });

  // Handle BinData type: BinData("AQID") → {"__yson_type":"BinData","__yson_data":"AQID"}
  result = result.replace(/BinData\("([^"]*)"\)/g, (_, value) => {
    return `{"__yson_type":"BinData","__yson_data":"${value}"}`;
  });

  // Handle Text type: Text([...]) → {"__yson_type":"Text","__yson_data":[...]}
  result = result.replace(
    /Text\((\[(?:[^[\]]|\[(?:[^[\]]|\[[^[\]]*\])*\])*\])\)/g,
    (_, content) => {
      return `{"__yson_type":"Text","__yson_data":${content}}`;
    },
  );

  // Handle Tree type: Tree({...}) → {"__yson_type":"Tree","__yson_data":{...}}
  result = result.replace(
    /Tree\((\{[^{}]*(?:\{[^{}]*(?:\{[^{}]*\})*[^{}]*\})*[^{}]*\})\)/g,
    (_, content) => {
      return `{"__yson_type":"Tree","__yson_data":${content}}`;
    },
  );

  return result;
}

/**
 * `postprocessValue` recursively processes parsed JSON to restore YSON types.
 */
function postprocessValue(value: any): YSONValue {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  // Check for YSON type markers
  if (value.__yson_type === 'Int' && typeof value.__yson_data === 'number') {
    return {
      type: 'Int',
      value: value.__yson_data,
    } as YSONInt;
  }

  if (value.__yson_type === 'Long' && typeof value.__yson_data === 'number') {
    return {
      type: 'Long',
      value: value.__yson_data,
    } as YSONLong;
  }

  if (value.__yson_type === 'Date' && typeof value.__yson_data === 'string') {
    return {
      type: 'Date',
      value: value.__yson_data,
    } as YSONDate;
  }

  if (
    value.__yson_type === 'BinData' &&
    typeof value.__yson_data === 'string'
  ) {
    return {
      type: 'BinData',
      value: value.__yson_data,
    } as YSONBinData;
  }

  if (
    value.__yson_type === 'Counter' &&
    typeof value.__yson_data === 'object'
  ) {
    const counterValue = postprocessValue(value.__yson_data);
    if (
      typeof counterValue === 'object' &&
      counterValue !== null &&
      'type' in counterValue &&
      (counterValue.type === 'Int' || counterValue.type === 'Long')
    ) {
      return {
        type: 'Counter',
        value: counterValue as YSONInt | YSONLong,
      } as YSONCounter;
    }
    throw new YorkieError(
      Code.ErrInvalidArgument,
      'Counter must contain Int or Long',
    );
  }

  if (value.__yson_type === 'Text' && Array.isArray(value.__yson_data)) {
    return {
      type: 'Text',
      nodes: value.__yson_data.map((node: any) => postprocessTextNode(node)),
    } as YSONText;
  }

  if (value.__yson_type === 'Tree' && typeof value.__yson_data === 'object') {
    return {
      type: 'Tree',
      root: postprocessTreeNode(value.__yson_data),
    } as YSONTree;
  }

  // Handle arrays
  if (Array.isArray(value)) {
    return value.map((item) => postprocessValue(item));
  }

  // Handle objects
  const result: any = {};
  for (const [key, val] of Object.entries(value)) {
    result[key] = postprocessValue(val);
  }
  return result;
}

/**
 * `postprocessTextNode` processes a text node object.
 */
function postprocessTextNode(node: any): YSONTextNode {
  if (
    typeof node !== 'object' ||
    node === null ||
    typeof node.val !== 'string'
  ) {
    throw new YorkieError(Code.ErrInvalidArgument, 'invalid text node format');
  }

  const result: YSONTextNode = { val: node.val };

  if (node.attrs && typeof node.attrs === 'object') {
    result.attrs = node.attrs;
  }

  return result;
}

/**
 * `postprocessTreeNode` processes a tree node object recursively.
 */
function postprocessTreeNode(node: any): YSONTreeNode {
  if (
    typeof node !== 'object' ||
    node === null ||
    typeof node.type !== 'string'
  ) {
    throw new YorkieError(Code.ErrInvalidArgument, 'invalid tree node format');
  }

  const result: YSONTreeNode = { type: node.type };

  // Text node
  if (node.type === 'text' && typeof node.value === 'string') {
    result.value = node.value;
    return result;
  }

  // Element node
  if (node.attrs && typeof node.attrs === 'object') {
    result.attrs = node.attrs;
  }

  if (Array.isArray(node.children)) {
    result.children = node.children.map((child: any) =>
      postprocessTreeNode(child),
    );
  }

  return result;
}

/**
 * `textToString` extracts plain text content from YSONText.
 *
 * @param text - YSONText object
 * @returns Plain text string
 *
 * @example
 * ```typescript
 * const text = { type: 'Text', nodes: [{val: 'H'}, {val: 'i'}] };
 * textToString(text); // "Hi"
 * ```
 */
export function textToString(text: YSONText): string {
  return text.nodes.map((node) => node.val).join('');
}

/**
 * `treeToXML` converts YSONTree to XML string representation.
 *
 * @param tree - YSONTree object
 * @returns XML string
 */
export function treeToXML(tree: YSONTree): string {
  return treeNodeToXML(tree.root);
}

/**
 * `treeNodeToXML` recursively converts a tree node to XML.
 */
function treeNodeToXML(node: YSONTreeNode): string {
  // Element node with attributes
  const attrs = node.attrs
    ? Object.entries(node.attrs)
        .map(([key, value]) => ` ${key}="${escapeXML(value)}"`)
        .join('')
    : '';

  // Text node with value
  if (node.type === 'text' && node.value !== undefined) {
    return `<${node.type}${attrs}>${escapeXML(node.value)}</${node.type}>`;
  }

  // Empty element node
  if (!node.children || node.children.length === 0) {
    return `<${node.type}${attrs} />`;
  }

  // Element node with children
  const children = node.children.map((child) => treeNodeToXML(child)).join('');
  return `<${node.type}${attrs}>${children}</${node.type}>`;
}

/**
 * `escapeXML` escapes special XML characters.
 */
function escapeXML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
