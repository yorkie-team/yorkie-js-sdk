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

import Long from 'long';
import { describe, it, expect } from 'vitest';
import { validateYorkieRuleset } from '@yorkie-js/sdk/src/schema/ruleset_validator';
import yorkie from '@yorkie-js/sdk/src/yorkie';
import { Rule } from '@yorkie-js/schema/src/rulesets';
import { toDocKey } from '@yorkie-js/sdk/test/integration/integration_helper';

describe('ruleset-validator', () => {
  it('should validate primitive type correctly', ({ task }) => {
    const ruleset: Array<Rule> = [
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
    ];

    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const doc = new yorkie.Document<any>(docKey);
    doc.update((root) => {
      root.field1 = null;
      root.field2 = true;
      root.field3 = 123;
      root.field4 = 123.456;
      root.field5 = Long.MAX_VALUE;
      root.field6 = 'test';
      root.field7 = new Date();
      root.field8 = new Uint8Array([1, 2, 3]);
    });
    let result = validateYorkieRuleset(doc.getRootObject(), ruleset);
    expect(result.valid).to.eq(true);

    doc.update((root) => {
      root.field1 = false;
      root.field2 = 123;
      root.field3 = 123.456;
      root.field4 = Long.MAX_VALUE;
      root.field5 = 'test';
      root.field6 = new Date();
      root.field7 = new Uint8Array([1, 2, 3]);
      root.field8 = null;
    });
    result = validateYorkieRuleset(doc.getRootObject(), ruleset);
    expect(result.valid).to.eq(false);
    expect(result.errors).to.deep.eq([
      {
        path: '$.field1',
        message: 'expected null at path $.field1',
      },
      {
        path: '$.field2',
        message: 'expected boolean at path $.field2',
      },
      {
        path: '$.field3',
        message: 'expected integer at path $.field3',
      },
      {
        path: '$.field4',
        message: 'expected double at path $.field4',
      },
      {
        path: '$.field5',
        message: 'expected long at path $.field5',
      },
      {
        path: '$.field6',
        message: 'expected string at path $.field6',
      },
      {
        path: '$.field7',
        message: 'expected date at path $.field7',
      },
      {
        path: '$.field8',
        message: 'expected bytes at path $.field8',
      },
    ]);
  });

  it('should validate object type correctly', ({ task }) => {
    const ruleset: Array<Rule> = [
      { path: '$.user', type: 'object', properties: ['name'] },
    ];

    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const doc = new yorkie.Document<{ user: any }>(docKey);
    doc.update((root) => {
      root.user = { name: 'test' };
    });
    let result = validateYorkieRuleset(doc.getRootObject(), ruleset);
    expect(result.valid).to.eq(true);

    doc.update((root) => {
      root.user = 'not an object';
    });
    result = validateYorkieRuleset(doc.getRootObject(), ruleset);
    expect(result.valid).to.eq(false);
    expect(result.errors).to.deep.eq([
      {
        path: '$.user',
        message: 'expected object at path $.user',
      },
    ]);
  });

  it('should validate array type correctly', ({ task }) => {
    const ruleset: Array<Rule> = [{ path: '$.items', type: 'array' }];

    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const doc = new yorkie.Document<{ items: any }>(docKey);
    doc.update((root) => {
      root.items = [1, 2, 3];
    });
    let result = validateYorkieRuleset(doc.getRootObject(), ruleset);
    expect(result.valid).to.eq(true);

    doc.update((root) => {
      root.items = 'not an array';
    });
    result = validateYorkieRuleset(doc.getRootObject(), ruleset);
    expect(result.valid).to.eq(false);
    expect(result.errors).to.deep.eq([
      {
        path: '$.items',
        message: 'expected array at path $.items',
      },
    ]);
  });

  it('should validate nested paths correctly', ({ task }) => {
    const ruleset: Array<Rule> = [
      { path: '$', type: 'object', properties: ['user'] },
      { path: '$.user', type: 'object', properties: ['name', 'age'] },
      { path: '$.user.name', type: 'string' },
      { path: '$.user.age', type: 'integer' },
    ];

    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const doc = new yorkie.Document<{ user: any }>(docKey);
    doc.update((root) => {
      root.user = { name: 'test', age: 25 };
    });
    let result = validateYorkieRuleset(doc.getRootObject(), ruleset);
    expect(result.valid).to.eq(true);

    doc.update((root) => {
      root.user.name = 123;
    });
    result = validateYorkieRuleset(doc.getRootObject(), ruleset);
    expect(result.valid).to.eq(false);
    expect(result.errors).to.deep.eq([
      {
        path: '$.user.name',
        message: 'expected string at path $.user.name',
      },
    ]);
  });

  it.todo(
    'should handle missing or unexpected values correctly',
    ({ task }) => {
      // TODO(chacha912): Need to handle rules for optional property paths.
      const ruleset: Array<Rule> = [
        {
          path: '$.user',
          type: 'object',
          properties: ['name', 'age', 'address'],
          optional: ['address'],
        },
        { path: '$.user.name', type: 'string' },
        { path: '$.user.age', type: 'integer' },
        { path: '$.user.address', type: 'string' },
      ];

      const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
      const doc = new yorkie.Document<{ user: any }>(docKey);

      // 1. All properties are present
      doc.update((root) => {
        root.user = { name: 'test', age: 25, address: '123 Main St' };
      });
      let result = validateYorkieRuleset(doc.getRootObject(), ruleset);
      expect(result.valid).to.eq(true);

      // 2. Optional property is missing
      doc.update((root) => {
        root.user = { name: 'test', age: 26 };
      });
      result = validateYorkieRuleset(doc.getRootObject(), ruleset);
      expect(result.valid).to.eq(true);

      // 3. Required property is missing
      doc.update((root) => {
        root.user = { name: 'test' };
      });
      result = validateYorkieRuleset(doc.getRootObject(), ruleset);
      expect(result.valid).to.eq(false);
      expect(result.errors).to.deep.eq([
        {
          path: '$.user.age',
          message: "Missing required property 'age' at path $.user",
        },
      ]);

      // 4. Unexpected property is present
      doc.update((root) => {
        root.user = { name: 'test', age: 27, unknown: 'hello' };
      });
      result = validateYorkieRuleset(doc.getRootObject(), ruleset);
      expect(result.valid).to.eq(false);
      expect(result.errors).to.deep.eq([
        {
          path: '$.user.unknown',
          message: "Unexpected property 'unknown' at path $.user",
        },
      ]);
    },
  );

  it('should handle yorkie types correctly', ({ task }) => {
    const ruleset: Array<Rule> = [
      { path: '$', type: 'object', properties: ['text', 'tree', 'counter'] },
      { path: '$.text', type: 'yorkie.Text' },
      { path: '$.tree', type: 'yorkie.Tree' },
      { path: '$.counter', type: 'yorkie.Counter' },
    ];

    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const doc = new yorkie.Document<{ text: any; tree: any; counter: any }>(
      docKey,
    );
    doc.update((root) => {
      root.text = new yorkie.Text();
      root.tree = new yorkie.Tree({ type: 'doc', children: [] });
      root.counter = new yorkie.Counter(yorkie.IntType, 0);
    });
    let result = validateYorkieRuleset(doc.getRootObject(), ruleset);
    expect(result.valid).to.eq(true);

    doc.update((root) => {
      root.text = 'text';
      root.tree = 'doc';
      root.counter = 1;
    });
    result = validateYorkieRuleset(doc.getRootObject(), ruleset);
    expect(result.valid).to.eq(false);
    expect(result.errors).to.deep.eq([
      {
        path: '$.text',
        message: 'expected yorkie.Text at path $.text',
      },
      {
        path: '$.tree',
        message: 'expected yorkie.Tree at path $.tree',
      },
      {
        path: '$.counter',
        message: 'expected yorkie.Counter at path $.counter',
      },
    ]);
  });
});
