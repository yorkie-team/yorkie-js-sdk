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

import { describe, it, expect } from 'vitest';
import {
  parseContentExpression,
  matchContentExpression,
} from '@yorkie-js/sdk/src/document/schema/content-expression';

describe('Content Expression Parser', () => {
  const identity = (name: string) => [name];

  it('should match simple type', () => {
    const expr = parseContentExpression('paragraph');
    expect(matchContentExpression(expr, ['paragraph'], identity).valid).toBe(
      true,
    );
    expect(matchContentExpression(expr, ['heading'], identity).valid).toBe(
      false,
    );
    expect(matchContentExpression(expr, [], identity).valid).toBe(false);
  });

  it('should match + quantifier (one or more)', () => {
    const expr = parseContentExpression('paragraph+');
    expect(matchContentExpression(expr, ['paragraph'], identity).valid).toBe(
      true,
    );
    expect(
      matchContentExpression(expr, ['paragraph', 'paragraph'], identity).valid,
    ).toBe(true);
    expect(matchContentExpression(expr, [], identity).valid).toBe(false);
  });

  it('should match * quantifier (zero or more)', () => {
    const expr = parseContentExpression('text*');
    expect(matchContentExpression(expr, [], identity).valid).toBe(true);
    expect(matchContentExpression(expr, ['text', 'text'], identity).valid).toBe(
      true,
    );
    expect(matchContentExpression(expr, ['paragraph'], identity).valid).toBe(
      false,
    );
  });

  it('should match ? quantifier (zero or one)', () => {
    const expr = parseContentExpression('title?');
    expect(matchContentExpression(expr, [], identity).valid).toBe(true);
    expect(matchContentExpression(expr, ['title'], identity).valid).toBe(true);
    expect(
      matchContentExpression(expr, ['title', 'title'], identity).valid,
    ).toBe(false);
  });

  it('should match sequence', () => {
    const expr = parseContentExpression('heading paragraph+');
    expect(
      matchContentExpression(expr, ['heading', 'paragraph'], identity).valid,
    ).toBe(true);
    expect(
      matchContentExpression(
        expr,
        ['heading', 'paragraph', 'paragraph'],
        identity,
      ).valid,
    ).toBe(true);
    expect(matchContentExpression(expr, ['paragraph'], identity).valid).toBe(
      false,
    );
  });

  it('should match alternatives', () => {
    const expr = parseContentExpression('paragraph | heading');
    expect(matchContentExpression(expr, ['paragraph'], identity).valid).toBe(
      true,
    );
    expect(matchContentExpression(expr, ['heading'], identity).valid).toBe(
      true,
    );
    expect(matchContentExpression(expr, ['blockquote'], identity).valid).toBe(
      false,
    );
  });

  it('should match grouped alternatives with quantifier', () => {
    const expr = parseContentExpression('(paragraph | heading)+');
    expect(
      matchContentExpression(
        expr,
        ['paragraph', 'heading', 'paragraph'],
        identity,
      ).valid,
    ).toBe(true);
    expect(matchContentExpression(expr, [], identity).valid).toBe(false);
  });

  it('should resolve groups', () => {
    const resolver = (name: string) =>
      name === 'block' ? ['paragraph', 'heading', 'blockquote'] : [name];
    const expr = parseContentExpression('block+');
    expect(
      matchContentExpression(expr, ['paragraph', 'heading'], resolver).valid,
    ).toBe(true);
    expect(matchContentExpression(expr, ['inline'], resolver).valid).toBe(
      false,
    );
  });
});
