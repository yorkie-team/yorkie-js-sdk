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

import { describe, it, expect } from 'vitest';
import { stringifyValue, replaceBigInts } from '../src/devtools/stringify';

describe('stringifyValue', () => {
  it('renders a bigint that JSON.stringify refuses', () => {
    expect(() => JSON.stringify({ at: 1n })).toThrow();
    expect(stringifyValue({ at: 1740000000000n })).toBe(
      '{"at":"1740000000000n"}',
    );
  });

  it('marks a bigint apart from the number that prints the same', () => {
    expect(stringifyValue(9007199254740992n)).toBe('"9007199254740992n"');
    expect(stringifyValue(9007199254740992)).toBe('9007199254740992');
  });

  it('finds a bigint nested anywhere in the value', () => {
    expect(stringifyValue({ counts: [1n, { deep: 2n }] })).toBe(
      '{"counts":["1n",{"deep":"2n"}]}',
    );
  });

  it('indents exactly as JSON.stringify does when given a space', () => {
    const value = { a: 1, b: { c: [true, null] } };
    expect(stringifyValue(value, 2)).toBe(JSON.stringify(value, null, 2));
  });

  it('leaves everything else as JSON.stringify left it', () => {
    const value = { s: 'a', n: 1, b: false, nil: null, arr: [1, 'two'] };
    expect(stringifyValue(value)).toBe(JSON.stringify(value));
    expect(stringifyValue(undefined)).toBe(undefined);
  });
});

describe('replaceBigInts', () => {
  it('replaces a bigint the way stringifyValue renders one', () => {
    expect(replaceBigInts(1740000000000n)).toBe('1740000000000n');
    expect(stringifyValue(replaceBigInts({ at: 1n }))).toBe(
      stringifyValue({ at: 1n }),
    );
  });

  it('reaches a bigint nested in objects and arrays', () => {
    expect(
      replaceBigInts({
        type: 'local-change',
        value: { operations: [{ value: 5n }] },
      }),
    ).toEqual({
      type: 'local-change',
      value: { operations: [{ value: '5n' }] },
    });
  });

  it('leaves the given value untouched', () => {
    const value = { operations: [{ value: 5n }] };
    replaceBigInts(value);
    expect(value.operations[0].value).toBe(5n);
  });

  it('keeps everything that is not a bigint', () => {
    const value = { s: 'a', n: 1, b: false, nil: null, u: undefined, arr: [1] };
    expect(replaceBigInts(value)).toEqual(value);
    expect(replaceBigInts([])).toEqual([]);
    expect(replaceBigInts(null)).toBe(null);
    expect(replaceBigInts(undefined)).toBe(undefined);
  });
});
