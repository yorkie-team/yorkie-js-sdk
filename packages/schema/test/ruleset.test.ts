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

import { describe, expect, it } from 'vitest';
import { buildRuleset } from '../src/rulesets';

describe('RulesetBuilder', () => {
  it('should create rules for primitive types', () => {
    const schema = `
      type Document = {
        field1: null;
        field2: boolean;
        field3: integer;
        field4: double;
        field5: long;
        field6: string;
        field7: date;
        field8: bytes;
      };
    `;

    const ruleset = buildRuleset(schema);
    expect(ruleset).to.deep.equal([
      {
        path: '$',
        type: 'object',
        properties: [
          'field1',
          'field2',
          'field3',
          'field4',
          'field5',
          'field6',
          'field7',
          'field8',
        ],
      },
      { path: '$.field1', type: 'null' },
      { path: '$.field2', type: 'boolean' },
      { path: '$.field3', type: 'integer' },
      { path: '$.field4', type: 'double' },
      { path: '$.field5', type: 'long' },
      { path: '$.field6', type: 'string' },
      { path: '$.field7', type: 'date' },
      { path: '$.field8', type: 'bytes' },
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
      {
        path: '$',
        type: 'object',
        properties: ['user'],
      },
      {
        path: '$.user',
        type: 'object',
        properties: ['name', 'address'],
      },
      { path: '$.user.name', type: 'string' },
      {
        path: '$.user.address',
        type: 'object',
        properties: ['street', 'city'],
      },
      { path: '$.user.address.street', type: 'string' },
      { path: '$.user.address.city', type: 'string' },
    ]);
  });

  it('should handle nested objects regardless of order', () => {
    const schema = `
      type Document = {
        user: User;
      };
      
      type Address = {
        street: string;
        city: string;
      };

      type User = {
        name: string;
        address: Address;
      };
    `;

    const ruleset = buildRuleset(schema);
    expect(ruleset).to.deep.equal([
      {
        path: '$',
        type: 'object',
        properties: ['user'],
      },
      {
        path: '$.user',
        type: 'object',
        properties: ['name', 'address'],
      },
      { path: '$.user.name', type: 'string' },
      {
        path: '$.user.address',
        type: 'object',
        properties: ['street', 'city'],
      },
      { path: '$.user.address.street', type: 'string' },
      { path: '$.user.address.city', type: 'string' },
    ]);
  });

  it('should handle optional properties', () => {
    const schema = `
      type Document = {
        user: User;
      };

      type User = {
        name: string;
        address?: string;
      };
    `;

    const ruleset = buildRuleset(schema);
    expect(ruleset).to.deep.equal([
      {
        path: '$',
        type: 'object',
        properties: ['user'],
      },
      {
        path: '$.user',
        type: 'object',
        properties: ['name', 'address'],
        optional: ['address'],
      },
      { path: '$.user.name', type: 'string' },
      { path: '$.user.address', type: 'string' },
    ]);
  });

  it('should handle array types - Array<T>', () => {
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
      {
        path: '$',
        type: 'object',
        properties: ['todos'],
      },
      {
        path: '$.todos',
        type: 'array',
        items: { type: 'object', properties: ['id', 'text'] },
      },
      {
        path: '$.todos[*].id',
        type: 'string',
      },
      {
        path: '$.todos[*].text',
        type: 'string',
      },
    ]);
  });

  it('should handle array types - T[]', () => {
    const schema = `
      type Document = {
        todos: Todo[];
      };

      type Todo = {
        id: string;
        text: string;
      };
    `;

    const ruleset = buildRuleset(schema);
    expect(ruleset).to.deep.equal([
      {
        path: '$',
        type: 'object',
        properties: ['todos'],
      },
      {
        path: '$.todos',
        type: 'array',
        items: { type: 'object', properties: ['id', 'text'] },
      },
      {
        path: '$.todos[*].id',
        type: 'string',
      },
      {
        path: '$.todos[*].text',
        type: 'string',
      },
    ]);
  });

  it('should handle recursive types', () => {
    const schema = `
      type Document = {
        linkedList: Node;
      };

      type Node = {
        value: string;
        next: Node;
      };
    `;

    const ruleset = buildRuleset(schema);
    expect(ruleset).to.deep.equal([
      {
        path: '$',
        properties: ['linkedList'],
        type: 'object',
      },
      {
        path: '$.linkedList',
        type: 'object',
        properties: ['value', 'next'],
      },
      { path: '$.linkedList.value', type: 'string' },
      {
        path: '$.linkedList.next',
        type: 'object',
        properties: ['value', 'next'],
      },
      { path: '$.linkedList.next[*].value', type: 'string' },
      {
        path: '$.linkedList.next[*].next',
        type: 'object',
        properties: ['value', 'next'],
      },
    ]);
  });

  it('should handle recursive array types', () => {
    const schema = `
      type Document = {
        tree: Node;
      };

      type Node = {
        value: string;
        children: Node[];
      };
    `;

    const ruleset = buildRuleset(schema);
    expect(ruleset).to.deep.equal([
      {
        path: '$',
        properties: ['tree'],
        type: 'object',
      },
      {
        path: '$.tree',
        type: 'object',
        properties: ['value', 'children'],
      },
      { path: '$.tree.value', type: 'string' },
      {
        path: '$.tree.children',
        type: 'array',
        items: {
          type: 'object',
          properties: ['value', 'children'],
        },
      },
      { path: '$.tree.children[*].value', type: 'string' },
      {
        path: '$.tree.children[*].children',
        type: 'array',
        items: {
          type: 'object',
          properties: ['value', 'children'],
        },
      },
    ]);
  });

  it('should handle Yorkie types', () => {
    const schema = `
      type Document = {
        counter: yorkie.Counter;
        tree: yorkie.Tree;
        text: yorkie.Text;
      };
    `;

    const ruleset = buildRuleset(schema);
    expect(ruleset).to.deep.equal([
      {
        path: '$',
        type: 'object',
        properties: ['counter', 'tree', 'text'],
      },
      { path: '$.counter', type: 'yorkie.Counter' },
      { path: '$.tree', type: 'yorkie.Tree' },
      { path: '$.text', type: 'yorkie.Text' },
    ]);
  });

  it.todo('should handle complex Yorkie types with generics', () => {
    const schema = `
      type Document = {
        richText: yorkie.Text<{
          bold: boolean;
          italic: boolean;
          color: "red" | "blue" | "green";
        }>;
      };
    `;

    const ruleset = buildRuleset(schema);
    expect(ruleset).to.deep.equal([
      {
        path: '$',
        type: 'object',
        properties: ['richText'],
      },
      {
        path: '$.richText',
        type: 'yorkie.Text',
        attributes: {
          bold: { type: 'boolean' },
          italic: { type: 'boolean' },
          color: { type: 'enum', values: ['red', 'blue', 'green'] },
        },
      },
    ]);
  });

  it.todo('should handle Yorkie complex types', () => {
    const schema = `
      type Document = {
        object: yorkie.Object<{}>;
        array: yorkie.Array<string>;
        array2: yorkie.Array<Array<string>>;
        array3: yorkie.Array<Todo>;
      };
      type Todo = {
        title: string;
        completed: boolean;
      };
    `;

    const ruleset = buildRuleset(schema);
    expect(ruleset).to.deep.equal([
      {
        path: '$',
        type: 'object',
        properties: ['object', 'array', 'array2', 'array3'],
      },
    ]);
  });

  it('should handle enum types', () => {
    const schema = `
      type Document = {
        theme: "light" | "dark";
        statusCode: 200 | 400;
      };
    `;

    const ruleset = buildRuleset(schema);
    expect(ruleset).to.deep.equal([
      {
        path: '$',
        type: 'object',
        properties: ['theme', 'statusCode'],
      },
      { path: '$.theme', type: 'enum', values: ['light', 'dark'] },
      { path: '$.statusCode', type: 'enum', values: [200, 400] },
    ]);
  });

  it.todo('should handle union types', () => {
    const schema = `
      type Document = {
        union: string | integer;
        complexUnion: (string | integer)[] | boolean;
        nestedUnion: (string | { value: integer }) | null;
        multipleUnion: string | integer | boolean | null;
      };
    `;

    const ruleset = buildRuleset(schema);
    expect(ruleset).to.deep.equal([
      {
        path: '$',
        type: 'object',
        properties: ['union', 'complexUnion', 'nestedUnion', 'multipleUnion'],
      },
      {
        path: '$.union',
        type: 'union',
        values: ['string', 'integer'],
      },
      {
        path: '$.complexUnion',
        type: 'union',
        values: [
          {
            type: 'array',
            items: { type: 'union', values: ['string', 'integer'] },
          },
          'boolean',
        ],
      },
      {
        path: '$.nestedUnion',
        type: 'union',
        values: [
          {
            type: 'union',
            values: ['string', { type: 'object', properties: ['value'] }],
          },
          'null',
        ],
      },
      {
        path: '$.multipleUnion',
        type: 'union',
        values: ['string', 'integer', 'boolean', 'null'],
      },
    ]);
  });
});
