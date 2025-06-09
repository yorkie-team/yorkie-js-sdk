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
import { toDocKey } from '@yorkie-js/sdk/test/integration/integration_helper';

describe('ruleset-validator', () => {
  it('should validate string type correctly', ({ task }) => {
    const ruleset: Array<Rule> = [{ path: '$.name', type: 'string' }];

    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const doc = new yorkie.Document<{ name: any }>(docKey);
    doc.update((root) => {
      root.name = 'test';
    });
    expect(validateYorkieRuleset(doc.getRootObject(), ruleset).valid).to.eq(
      true,
    );

    doc.update((root) => {
      root.name = 123;
    });
    expect(validateYorkieRuleset(doc.getRootObject(), ruleset).valid).to.eq(
      false,
    );
    expect(
      validateYorkieRuleset(doc.getRootObject(), ruleset).errors,
    ).to.deep.eq([
      {
        path: '$.name',
        message: 'Expected string at path $.name',
      },
    ]);

    doc.update((root) => {
      delete root.name;
    });
    expect(validateYorkieRuleset(doc.getRootObject(), ruleset).valid).to.eq(
      false,
    );
    expect(
      validateYorkieRuleset(doc.getRootObject(), ruleset).errors,
    ).to.deep.eq([
      {
        path: '$.name',
        message: 'Expected string at path $.name',
      },
    ]);
  });

  it('should validate object type correctly', ({ task }) => {
    const ruleset: Array<Rule> = [
      { path: '$.user', type: 'object', properties: {} },
    ];

    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const doc = new yorkie.Document<{ user: any }>(docKey);
    doc.update((root) => {
      root.user = { name: 'test' };
    });
    expect(validateYorkieRuleset(doc.getRootObject(), ruleset).valid).to.eq(
      true,
    );

    doc.update((root) => {
      root.user = 'not an object';
    });
    expect(validateYorkieRuleset(doc.getRootObject(), ruleset).valid).to.eq(
      false,
    );
    expect(
      validateYorkieRuleset(doc.getRootObject(), ruleset).errors,
    ).to.deep.eq([
      {
        path: '$.user',
        message: 'Expected object at path $.user',
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
    expect(validateYorkieRuleset(doc.getRootObject(), ruleset).valid).to.eq(
      true,
    );

    doc.update((root) => {
      root.items = 'not an array';
    });
    expect(validateYorkieRuleset(doc.getRootObject(), ruleset).valid).to.eq(
      false,
    );
    expect(
      validateYorkieRuleset(doc.getRootObject(), ruleset).errors,
    ).to.deep.eq([
      {
        path: '$.items',
        message: 'Expected array at path $.items',
      },
    ]);
  });

  it('should validate nested paths correctly', ({ task }) => {
    const ruleset: Array<Rule> = [
      { path: '$.user', type: 'object', properties: {} },
      { path: '$.user.name', type: 'string' },
      { path: '$.user.age', type: 'string' },
    ];

    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const doc = new yorkie.Document<{ user: any }>(docKey);
    doc.update((root) => {
      root.user = { name: 'test', age: '25' };
    });
    expect(validateYorkieRuleset(doc.getRootObject(), ruleset).valid).to.eq(
      true,
    );

    doc.update((root) => {
      root.user.name = 123;
    });
    expect(validateYorkieRuleset(doc.getRootObject(), ruleset).valid).to.eq(
      false,
    );
    expect(
      validateYorkieRuleset(doc.getRootObject(), ruleset).errors,
    ).to.deep.eq([
      {
        path: '$.user.name',
        message: 'Expected string at path $.user.name',
      },
    ]);
  });

  it.todo(
    'should handle missing or unexpected values correctly',
    ({ task }) => {
      const ruleset: Array<Rule> = [
        { path: '$.user', type: 'object', properties: {} },
        { path: '$.user.name', type: 'string' },
        { path: '$.user.age', type: 'string' },
      ];

      const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
      const doc = new yorkie.Document<{ user: any }>(docKey);
      doc.update((root) => {
        root.user = { name: 'test' };
      });
      expect(validateYorkieRuleset(doc.getRootObject(), ruleset).valid).to.eq(
        false,
      );
      expect(
        validateYorkieRuleset(doc.getRootObject(), ruleset).errors,
      ).to.deep.eq([
        {
          path: '$.user.age',
          message: 'Expected string at path $.user.age',
        },
      ]);

      // TODO(chacha912): Implement unexpected values handling.
      doc.update((root) => {
        root.user = { name: 'test', age: '25', address: '123 Main St' };
      });
      expect(validateYorkieRuleset(doc.getRootObject(), ruleset).valid).to.eq(
        false,
      );
    },
  );

  it('should handle yorkie types correctly', ({ task }) => {
    const ruleset: Array<Rule> = [
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
    expect(validateYorkieRuleset(doc.getRootObject(), ruleset).valid).to.eq(
      true,
    );

    doc.update((root) => {
      root.text = 'text';
      root.tree = 'doc';
      root.counter = 1;
    });
    expect(validateYorkieRuleset(doc.getRootObject(), ruleset).valid).to.eq(
      false,
    );
    expect(
      validateYorkieRuleset(doc.getRootObject(), ruleset).errors,
    ).to.deep.eq([
      {
        path: '$.text',
        message: 'Expected yorkie.Text at path $.text',
      },
      {
        path: '$.tree',
        message: 'Expected yorkie.Tree at path $.tree',
      },
      {
        path: '$.counter',
        message: 'Expected yorkie.Counter at path $.counter',
      },
    ]);
  });
});
