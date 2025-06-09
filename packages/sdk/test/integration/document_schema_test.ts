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

import { describe, it, assert, beforeAll } from 'vitest';
import {
  testAPIID,
  testAPIPW,
  testRPCAddr,
  toDocKey,
} from '@yorkie-js/sdk/test/integration/integration_helper';
import axios from 'axios';
import yorkie, { SyncMode } from '@yorkie-js/sdk/src/yorkie';
import { YorkieError } from '@yorkie-js/sdk/src/util/error';

let adminToken: string;
const time = new Date().getTime();

describe('Document Schema', () => {
  beforeAll(async () => {
    const loginResponse = await axios.post(
      `${testRPCAddr}/yorkie.v1.AdminService/LogIn`,
      { username: testAPIID, password: testAPIPW },
    );
    adminToken = loginResponse.data.token;
    await axios.post(
      `${testRPCAddr}/yorkie.v1.AdminService/CreateSchema`,
      {
        projectName: 'default',
        schemaName: `schema-${time}`,
        schemaVersion: 1,
        schemaBody: 'type Document = {title: string;};',
        rules: [
          {
            path: '$.title',
            type: 'string',
          },
        ],
      },
      {
        headers: { Authorization: adminToken },
      },
    );
  });

  it('should attach document with schema', async ({ task }) => {
    const client = new yorkie.Client({
      rpcAddr: testRPCAddr,
    });
    await client.activate();
    const doc = new yorkie.Document<{ title: string }>(
      toDocKey(`${task.name}-${new Date().getTime()}`),
    );
    try {
      await client.attach(doc, {
        syncMode: SyncMode.Manual,
        schema: 'noexist@1',
      });
      assert.fail('Expected an error to be thrown');
    } catch (error) {
      assert.equal(
        (error as Error).message,
        '[not_found] noexist 1: schema not found',
      );
    }

    await client.attach(doc, {
      syncMode: SyncMode.Manual,
      schema: `schema-${time}@1`,
    });
    await client.deactivate();
  });

  it('should reject local update that violates schema', async ({ task }) => {
    const client = new yorkie.Client({
      rpcAddr: testRPCAddr,
    });
    await client.activate();

    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const doc = new yorkie.Document<{ title: any }>(docKey);
    await client.attach(doc, {
      syncMode: SyncMode.Manual,
      schema: `schema-${time}@1`,
    });

    assert.throws(
      () => {
        doc.update((root) => {
          root.title = 123;
        });
      },
      YorkieError,
      `schema validation failed: Expected string at path $.title`,
    );
    assert.equal('{}', doc.toSortedJSON());

    doc.update((root) => {
      root.title = 'hello';
    });
    assert.equal('{"title":"hello"}', doc.toSortedJSON());

    await client.deactivate();
  });
});
