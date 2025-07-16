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
import axios, { AxiosError } from 'axios';
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

    await axios.post(
      `${testRPCAddr}/yorkie.v1.AdminService/CreateSchema`,
      {
        projectName: 'default',
        schemaName: `schema2-${time}`,
        schemaVersion: 1,
        schemaBody: 'type Document = {title: integer;};',
        rules: [
          {
            path: '$.title',
            type: 'integer',
          },
        ],
      },
      {
        headers: { Authorization: adminToken },
      },
    );
  });

  it('can attach document with schema', async ({ task }) => {
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
      assert.include((error as Error).message, 'schema not found');
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

  it('can update schema with new rules via UpdateDocument API', async ({
    task,
  }) => {
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

    doc.update((root) => {
      root.title = 'hello';
    });
    assert.equal('{"title":"hello"}', doc.toSortedJSON());
    await client.sync(doc);
    await client.detach(doc);

    await axios.post(
      `${testRPCAddr}/yorkie.v1.AdminService/UpdateDocument`,
      {
        projectName: 'default',
        documentKey: docKey,
        root: `{"title": Int(123)}`,
        schemaKey: `schema2-${time}@1`,
      },
      {
        headers: { Authorization: adminToken },
      },
    );

    const doc2 = new yorkie.Document<{ title: any }>(docKey);
    await client.attach(doc2, {
      syncMode: SyncMode.Manual,
    });
    assert.equal('{"title":123}', doc2.toSortedJSON());

    await client.deactivate();
  });

  it('should reject schema update when document is attached', async ({
    task,
  }) => {
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

    try {
      await axios.post(
        `${testRPCAddr}/yorkie.v1.AdminService/UpdateDocument`,
        {
          projectName: 'default',
          documentKey: docKey,
          root: `{"title": Int(123)}`,
          schemaKey: `schema2-${time}@1`,
        },
        {
          headers: { Authorization: adminToken },
        },
      );
    } catch (error) {
      assert.equal(
        (error as AxiosError<{ message: string }>).response?.data?.message,
        'document is attached',
      );
    }

    await client.deactivate();
  });

  it('should reject schema update when existing root violates new schema', async ({
    task,
  }) => {
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

    doc.update((root) => {
      root.title = 'hello';
    });
    assert.equal('{"title":"hello"}', doc.toSortedJSON());
    await client.sync(doc);
    await client.detach(doc);

    try {
      await axios.post(
        `${testRPCAddr}/yorkie.v1.AdminService/UpdateDocument`,
        {
          projectName: 'default',
          documentKey: docKey,
          root: `{"title": Long(123)}`,
          schemaKey: `schema2-${time}@1`,
        },
        {
          headers: { Authorization: adminToken },
        },
      );
      assert.fail('Expected an error to be thrown');
    } catch (error) {
      assert.equal(
        (error as AxiosError<{ message: string }>).response?.data?.message,
        'schema validation failed: Expected integer at path $.title',
      );
    }

    await client.deactivate();
  });

  it('can detach schema via UpdateDocument API', async ({ task }) => {
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
    doc.update((root) => {
      root.title = 'hello';
    });
    assert.equal('{"title":"hello"}', doc.toSortedJSON());
    await client.sync(doc);

    try {
      await axios.post(
        `${testRPCAddr}/yorkie.v1.AdminService/UpdateDocument`,
        {
          projectName: 'default',
          documentKey: docKey,
          root: '',
          schemaKey: '',
        },
        {
          headers: { Authorization: adminToken },
        },
      );
    } catch (error) {
      assert.equal(
        (error as AxiosError<{ message: string }>).response?.data?.message,
        'document is attached',
      );
    }

    await client.detach(doc);
    await axios.post(
      `${testRPCAddr}/yorkie.v1.AdminService/UpdateDocument`,
      {
        projectName: 'default',
        documentKey: docKey,
        root: '',
        schemaKey: '',
      },
      {
        headers: { Authorization: adminToken },
      },
    );

    const doc2 = new yorkie.Document<{ title: any }>(docKey);
    await client.attach(doc2, {
      syncMode: SyncMode.Manual,
    });
    assert.equal('{"title":"hello"}', doc2.toSortedJSON());
    doc2.update((root) => {
      root.title = 123;
    });
    assert.equal('{"title":123}', doc2.toSortedJSON());

    await client.deactivate();
  });

  it('can attach schema via UpdateDocument API', async ({ task }) => {
    const client = new yorkie.Client({
      rpcAddr: testRPCAddr,
    });
    await client.activate();

    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const doc = new yorkie.Document<{ title: any }>(docKey);

    await client.attach(doc, {
      syncMode: SyncMode.Manual,
    });
    doc.update((root) => {
      root.title = 'hello';
    });
    assert.equal('{"title":"hello"}', doc.toSortedJSON());
    await client.sync(doc);

    try {
      await axios.post(
        `${testRPCAddr}/yorkie.v1.AdminService/UpdateDocument`,
        {
          projectName: 'default',
          documentKey: docKey,
          root: '',
          schemaKey: `schema2-${time}@1`,
        },
        {
          headers: { Authorization: adminToken },
        },
      );
    } catch (error) {
      assert.equal(
        (error as AxiosError<{ message: string }>).response?.data?.message,
        'document is attached',
      );
    }

    await client.detach(doc);
    try {
      await axios.post(
        `${testRPCAddr}/yorkie.v1.AdminService/UpdateDocument`,
        {
          projectName: 'default',
          documentKey: docKey,
          root: '',
          schemaKey: `schema2-${time}@1`,
        },
        {
          headers: { Authorization: adminToken },
        },
      );
    } catch (error) {
      assert.equal(
        (error as AxiosError<{ message: string }>).response?.data?.message,
        'schema validation failed: Expected integer at path $.title',
      );
    }

    await axios.post(
      `${testRPCAddr}/yorkie.v1.AdminService/UpdateDocument`,
      {
        projectName: 'default',
        documentKey: docKey,
        root: '',
        schemaKey: `schema-${time}@1`,
      },
      {
        headers: { Authorization: adminToken },
      },
    );

    const doc2 = new yorkie.Document<{ title: any }>(docKey);
    await client.attach(doc2, {
      syncMode: SyncMode.Manual,
    });
    assert.equal('{"title":"hello"}', doc2.toSortedJSON());

    assert.throws(
      () => {
        doc2.update((root) => {
          root.title = 123;
        });
      },
      YorkieError,
      `schema validation failed: Expected string at path $.title`,
    );

    await client.deactivate();
  });

  it('can update schema only', async ({ task }) => {
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

    doc.update((root) => {
      root.title = 'hello';
    });
    assert.equal('{"title":"hello"}', doc.toSortedJSON());
    await client.sync(doc);
    await client.detach(doc);

    // TODO(chacha912): We can verify schema-only updates work correctly
    // after features like conditional types are implemented in schema-ruleset.
    try {
      await axios.post(
        `${testRPCAddr}/yorkie.v1.AdminService/UpdateDocument`,
        {
          projectName: 'default',
          documentKey: docKey,
          root: '',
          schemaKey: `schema2-${time}@1`,
        },
        {
          headers: { Authorization: adminToken },
        },
      );
    } catch (error) {
      assert.equal(
        (error as AxiosError<{ message: string }>).response?.data?.message,
        'schema validation failed: Expected integer at path $.title',
      );
    }

    await client.deactivate();
  });

  it('can update root only', async ({ task }) => {
    const client = new yorkie.Client({
      rpcAddr: testRPCAddr,
    });
    await client.activate();

    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const doc = new yorkie.Document<{ title: any }>(docKey);

    await client.attach(doc, {
      syncMode: SyncMode.Manual,
    });

    doc.update((root) => {
      root.title = 'hello';
    });
    assert.equal('{"title":"hello"}', doc.toSortedJSON());
    await client.sync(doc);

    await axios.post(
      `${testRPCAddr}/yorkie.v1.AdminService/UpdateDocument`,
      {
        projectName: 'default',
        documentKey: docKey,
        root: `{"title": Int(123)}`,
        schemaKey: '',
      },
      {
        headers: { Authorization: adminToken },
      },
    );
    await client.detach(doc);

    const doc2 = new yorkie.Document<{ title: any }>(docKey);
    await client.attach(doc2, {
      syncMode: SyncMode.Manual,
    });
    assert.equal('{"title":123}', doc2.toSortedJSON());

    await client.deactivate();
  });

  it('can update root only when document has attached schema', async ({
    task,
  }) => {
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

    doc.update((root) => {
      root.title = 'hello';
    });
    assert.equal('{"title":"hello"}', doc.toSortedJSON());
    await client.sync(doc);
    await client.detach(doc);

    try {
      await axios.post(
        `${testRPCAddr}/yorkie.v1.AdminService/UpdateDocument`,
        {
          projectName: 'default',
          documentKey: docKey,
          root: `{"title": Int(123)}`,
          schemaKey: '',
        },
        {
          headers: { Authorization: adminToken },
        },
      );
    } catch (error) {
      assert.equal(
        (error as AxiosError<{ message: string }>).response?.data?.message,
        'schema validation failed: Expected string at path $.title',
      );
    }

    await axios.post(
      `${testRPCAddr}/yorkie.v1.AdminService/UpdateDocument`,
      {
        projectName: 'default',
        documentKey: docKey,
        root: `{"title": "world"}`,
        schemaKey: '',
      },
      {
        headers: { Authorization: adminToken },
      },
    );

    const doc2 = new yorkie.Document<{ title: any }>(docKey);
    await client.attach(doc2, {
      syncMode: SyncMode.Manual,
    });
    assert.equal('{"title":"world"}', doc2.toSortedJSON());

    assert.throws(
      () => {
        doc2.update((root) => {
          root.title = 123;
        });
      },
      YorkieError,
      `schema validation failed: Expected string at path $.title`,
    );

    await client.deactivate();
  });
});
