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
import { validateYorkieRuleset } from '@yorkie-js/sdk/src/schema/ruleset_validator';
import yorkie from '@yorkie-js/sdk/src/yorkie';
import { Rule } from '@yorkie-js/schema/src/rulesets';

describe('ruleset-validator', () => {
  it('should validate string type correctly', () => {
    const ruleset: Array<Rule> = [{ path: '$.name', type: 'string' }];

    const validData = { name: 'test' };
    expect(validateYorkieRuleset(validData, ruleset).valid).to.eq(true);

    const invalidData = { name: 123 };
    expect(validateYorkieRuleset(invalidData, ruleset).valid).to.eq(false);
    expect(validateYorkieRuleset(invalidData, ruleset).errors).to.deep.eq([
      {
        path: '$.name',
        message: 'Expected string at path $.name, got number',
      },
    ]);

    const emptyData = {};
    expect(validateYorkieRuleset(emptyData, ruleset).valid).to.eq(false);
    expect(validateYorkieRuleset(emptyData, ruleset).errors).to.deep.eq([
      {
        path: '$.name',
        message: 'Expected string at path $.name, got undefined',
      },
    ]);
  });

  it('should validate object type correctly', () => {
    const ruleset: Array<Rule> = [
      { path: '$.user', type: 'object', properties: {} },
    ];

    const validData = { user: { name: 'test' } };
    expect(validateYorkieRuleset(validData, ruleset).valid).to.eq(true);

    const invalidData = { user: 'not an object' };
    expect(validateYorkieRuleset(invalidData, ruleset).valid).to.eq(false);
    expect(validateYorkieRuleset(invalidData, ruleset).errors).to.deep.eq([
      {
        path: '$.user',
        message: 'Expected object at path $.user, got string',
      },
    ]);
  });

  it('should validate array type correctly', () => {
    const ruleset: Array<Rule> = [{ path: '$.items', type: 'array' }];

    const validData = { items: [1, 2, 3] };
    expect(validateYorkieRuleset(validData, ruleset).valid).to.eq(true);

    const invalidData = { items: 'not an array' };
    expect(validateYorkieRuleset(invalidData, ruleset).valid).to.eq(false);
    expect(validateYorkieRuleset(invalidData, ruleset).errors).to.deep.eq([
      {
        path: '$.items',
        message: 'Expected array at path $.items, got string',
      },
    ]);
  });

  it('should validate nested paths correctly', () => {
    const ruleset: Array<Rule> = [
      { path: '$.user.name', type: 'string' },
      { path: '$.user.age', type: 'string' },
    ];

    const validData = {
      user: {
        name: 'test',
        age: '25',
      },
    };
    expect(validateYorkieRuleset(validData, ruleset).valid).to.eq(true);

    const invalidData = {
      user: {
        name: 123,
        age: '25',
      },
    };
    expect(validateYorkieRuleset(invalidData, ruleset).valid).to.eq(false);
    expect(validateYorkieRuleset(invalidData, ruleset).errors).to.deep.eq([
      {
        path: '$.user.name',
        message: 'Expected string at path $.user.name, got number',
      },
    ]);
  });

  it.todo('should handle missing or unexpected values correctly', () => {
    const ruleset: Array<Rule> = [
      { path: '$.user.name', type: 'string' },
      { path: '$.user.age', type: 'string' },
    ];

    const missingData = {
      user: {
        name: 'test',
      },
    };
    expect(validateYorkieRuleset(missingData, ruleset).valid).to.eq(false);
    expect(validateYorkieRuleset(missingData, ruleset).errors).to.deep.eq([
      {
        path: '$.user.age',
        message: 'Expected string at path $.user.age, got undefined',
      },
    ]);

    // TODO(chacha912): Implement unexpected values handling.
    const unexpectedData = {
      user: {
        name: 'test',
        age: '25',
        address: '123 Main St',
      },
    };
    expect(validateYorkieRuleset(unexpectedData, ruleset).valid).to.eq(false);
  });

  it('should handle yorkie types correctly', () => {
    const ruleset: Array<Rule> = [
      { path: '$.text', type: 'yorkie.Text' },
      { path: '$.tree', type: 'yorkie.Tree' },
      { path: '$.counter', type: 'yorkie.Counter' },
    ];

    const validData = {
      text: new yorkie.Text(),
      tree: new yorkie.Tree({
        type: 'doc',
        children: [],
      }),
      counter: new yorkie.Counter(yorkie.IntType, 0),
    };
    expect(validateYorkieRuleset(validData, ruleset).valid).to.eq(true);

    const invalidData = {
      text: 'text',
      tree: 'doc',
      counter: 1,
    };
    expect(validateYorkieRuleset(invalidData, ruleset).valid).to.eq(false);
    expect(validateYorkieRuleset(invalidData, ruleset).errors).to.deep.eq([
      {
        path: '$.text',
        message: 'Expected yorkie.Text at path $.text, got string',
      },
      {
        path: '$.tree',
        message: 'Expected yorkie.Tree at path $.tree, got string',
      },
      {
        path: '$.counter',
        message: 'Expected yorkie.Counter at path $.counter, got number',
      },
    ]);
  });
});
