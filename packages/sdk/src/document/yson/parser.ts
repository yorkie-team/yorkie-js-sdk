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
  YSONDedupCounter,
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
 *
 * // With type parameter:
 * const data = parse<{ content: YSONText }>('{"content":Text([{"val":"Hi"}])}');
 * // data.content is now typed as YSONText
 * ```
 */
export function parse<T = YSONValue>(yson: string): T {
  try {
    // Preprocess YSON string to handle special types
    const processed = preprocessYSON(yson);

    // Parse as JSON
    const parsed = JSON.parse(processed);

    // Post-process to restore type information
    return postprocessValue(parsed) as T;
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
 * - `DedupCounter(Int(15),"b64")` → `{"__yson_type":"DedupCounter","__yson_data":{"__yson_type":"Int","__yson_data":15},"__yson_registers":"b64"}`
 * - `Counter(Int(10))` → `{"__yson_type":"Counter","__yson_data":{"__yson_type":"Int","__yson_data":10}}`
 */
/**
 * `ysonConstructors` lists the YSON type constructor names the scanner
 * recognizes. Longer names are listed before their suffixes (e.g.
 * `DedupCounter` before `Counter`) so the scanner prefers the longest match.
 */
const ysonConstructors = [
  'DedupCounter',
  'Counter',
  'BinData',
  'Date',
  'Long',
  'Int',
  'Text',
  'Tree',
];

/**
 * `isIdentChar` reports whether `ch` can appear inside an identifier. Used to
 * ensure a constructor keyword is matched at a token boundary, not as the tail
 * of some longer word.
 */
function isIdentChar(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z0-9_]/.test(ch);
}

/**
 * `skipString` returns the index just past the JSON string literal that starts
 * at `start` (which must point at the opening quote), honouring `\"` escapes.
 */
function skipString(s: string, start: number): number {
  let i = start + 1;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === '"') {
      return i + 1;
    }
    i++;
  }
  throw new YorkieError(Code.ErrInvalidArgument, 'unterminated string literal');
}

/**
 * `findMatchingParen` returns the index of the `)` that closes the `(` whose
 * argument begins at `start`. Parentheses inside string literals are ignored,
 * so the boundary is found by depth counting rather than a fixed-arity pattern.
 */
function findMatchingParen(s: string, start: number): number {
  let depth = 1;
  let i = start;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '"') {
      i = skipString(s, i);
      continue;
    }
    if (ch === '(') {
      depth++;
    } else if (ch === ')') {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
    i++;
  }
  throw new YorkieError(
    Code.ErrInvalidArgument,
    'unbalanced parentheses in YSON',
  );
}

/**
 * `splitTopLevelArgs` splits a constructor argument list on top-level commas,
 * ignoring commas that appear inside nested brackets or string literals.
 */
function splitTopLevelArgs(s: string): Array<string> {
  const args: Array<string> = [];
  let depth = 0;
  let start = 0;
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '"') {
      i = skipString(s, i);
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') {
      depth++;
    } else if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
    } else if (ch === ',' && depth === 0) {
      args.push(s.slice(start, i).trim());
      start = i + 1;
    }
    i++;
  }
  args.push(s.slice(start).trim());
  return args;
}

/**
 * `matchConstructorAt` returns the constructor name that begins at `i` (when
 * immediately followed by `(` and starting on a token boundary), or `null`.
 */
function matchConstructorAt(s: string, i: number): string | undefined {
  if (isIdentChar(s[i - 1])) {
    return undefined;
  }
  for (const name of ysonConstructors) {
    if (s.startsWith(name, i) && s[i + name.length] === '(') {
      return name;
    }
  }
  return undefined;
}

/**
 * `preprocessYSON` converts YSON special syntax to JSON-compatible format.
 *
 * A single left-to-right pass rewrites constructor literals into their
 * `__yson_type` marker objects. The scanner tracks string literals (so
 * brackets and parentheses inside string values are never counted as
 * structure) and matches constructor arguments by paren depth (so there is no
 * nesting-depth ceiling). Nested constructors such as `Counter(Int(10))` are
 * handled by recursing into the argument content.
 *
 * Transformations:
 * - `Text([...])` → `{"__yson_type":"Text","__yson_data":[...]}`
 * - `Tree(...)` → `{"__yson_type":"Tree","__yson_data":...}`
 * - `Int(42)` → `{"__yson_type":"Int","__yson_data":42}`
 * - `Long(64)` → `{"__yson_type":"Long","__yson_data":64}`
 * - `Date("...")` → `{"__yson_type":"Date","__yson_data":"..."}`
 * - `BinData("...")` → `{"__yson_type":"BinData","__yson_data":"..."}`
 * - `DedupCounter(Int(15),"b64")` → `{"__yson_type":"DedupCounter","__yson_data":{"__yson_type":"Int","__yson_data":15},"__yson_registers":"b64"}`
 * - `Counter(Int(10))` → `{"__yson_type":"Counter","__yson_data":{"__yson_type":"Int","__yson_data":10}}`
 */
function preprocessYSON(yson: string): string {
  let result = '';
  let i = 0;
  while (i < yson.length) {
    const ch = yson[i];

    // Copy string literals verbatim so their contents are never interpreted
    // as structure.
    if (ch === '"') {
      const end = skipString(yson, i);
      result += yson.slice(i, end);
      i = end;
      continue;
    }

    const name = matchConstructorAt(yson, i);
    if (name === undefined) {
      result += ch;
      i++;
      continue;
    }

    const argStart = i + name.length + 1;
    const argEnd = findMatchingParen(yson, argStart);
    const argContent = yson.slice(argStart, argEnd);

    if (name === 'DedupCounter') {
      const args = splitTopLevelArgs(argContent);
      if (args.length !== 2) {
        throw new YorkieError(
          Code.ErrInvalidArgument,
          'DedupCounter expects a value and a registers argument',
        );
      }
      const [value, registers] = args;
      result += `{"__yson_type":"DedupCounter","__yson_data":${preprocessYSON(
        value,
      )},"__yson_registers":${registers}}`;
    } else {
      result += `{"__yson_type":"${name}","__yson_data":${preprocessYSON(
        argContent,
      )}}`;
    }

    i = argEnd + 1;
  }

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
    value.__yson_type === 'DedupCounter' &&
    typeof value.__yson_data === 'object' &&
    typeof value.__yson_registers === 'string'
  ) {
    const counterValue = postprocessValue(value.__yson_data);
    if (
      typeof counterValue === 'object' &&
      counterValue !== null &&
      'type' in counterValue &&
      counterValue.type === 'Int'
    ) {
      return {
        type: 'DedupCounter',
        value: counterValue as YSONInt,
        registers: value.__yson_registers,
      } as YSONDedupCounter;
    }
    throw new YorkieError(
      Code.ErrInvalidArgument,
      'DedupCounter must contain Int',
    );
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
