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
import { buildRuleset } from '../src/rulesets';

describe('RulesetBuilder', () => {
  it('should create rules for simple document', () => {
    const schema = `
      type Document = {
        name: string;
        age: number;
      };
    `;

    const ruleset = buildRuleset(schema);
    expect(ruleset).to.deep.equal([
      { path: '$.name', type: 'string' },
      { path: '$.age', type: 'number' },
    ]);
  });

  it('should handle nested objects', () => {
    const schema = `
      type Document = {
        user: User;
      };
      
      type User = {
        name: string;
        address: Address;
      };
      
      type Address = {
        street: string;
        city: string;
      };
    `;

    const ruleset = buildRuleset(schema);
    expect(ruleset).to.deep.equal([
      { path: '$.user.name', type: 'string' },
      { path: '$.user.address.street', type: 'string' },
      { path: '$.user.address.city', type: 'string' },
    ]);
  });

  // TODO(hackerwins): Implement array type handling.
  it.todo('should handle array types', () => {
    const schema = `
      type Document = {
        todos: Array<Todo>;
      };
      
      type Todo = {
        id: string;
        text: string;
      };
    `;

    const ruleset = buildRuleset(schema);
    expect(ruleset).to.deep.equal([
      { path: '$.todos', type: 'array' },
      { path: '$.todos[*].id', type: 'string' },
      { path: '$.todos[*].text', type: 'string' },
    ]);
  });
});
