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

const time = new Date().getTime();

describe('Document Schema', () => {
  let projectApiKey: string;
  let projectSecretKey: string;

  beforeAll(async () => {
    const loginResponse = await axios.post(
      `${testRPCAddr}/yorkie.v1.AdminService/LogIn`,
      { username: testAPIID, password: testAPIPW },
    );
    const adminToken = loginResponse.data.token;

    // Create a new project for schema testing
    const createProjectResponse = await axios.post(
      `${testRPCAddr}/yorkie.v1.AdminService/CreateProject`,
      { name: `schema-test-${time}` },
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    projectApiKey = createProjectResponse.data.project.publicKey;
    projectSecretKey = createProjectResponse.data.project.secretKey;

    // Create schemas using API-Key authentication (for project context)
    await axios.post(
      `${testRPCAddr}/yorkie.v1.AdminService/CreateSchema`,
      {
        schemaName: `schema-${time}`,
        schemaVersion: 1,
        schemaBody: 'type Document = {title: string;};',
        rules: [{ path: '$.title', type: 'string' }],
      },
      { headers: { Authorization: `API-Key ${projectSecretKey}` } },
    );

    await axios.post(
      `${testRPCAddr}/yorkie.v1.AdminService/CreateSchema`,
      {
        schemaName: `schema2-${time}`,
        schemaVersion: 1,
        schemaBody: 'type Document = {title: integer;};',
        rules: [{ path: '$.title', type: 'integer' }],
      },
      { headers: { Authorization: `API-Key ${projectSecretKey}` } },
    );
  });

  it('can attach document with schema', async ({ task }) => {
    const client = new yorkie.Client({
      rpcAddr: testRPCAddr,
      apiKey: projectApiKey,
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
      assert.fail('expected an error to be thrown');
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
      apiKey: projectApiKey,
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
      `schema validation failed: expected string at path $.title`,
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
      apiKey: projectApiKey,
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
        documentKey: docKey,
        root: `{"title": Int(123)}`,
        schemaKey: `schema2-${time}@1`,
      },
      { headers: { Authorization: `API-Key ${projectSecretKey}` } },
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
      apiKey: projectApiKey,
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
          documentKey: docKey,
          root: `{"title": Int(123)}`,
          schemaKey: `schema2-${time}@1`,
        },
        { headers: { Authorization: `API-Key ${projectSecretKey}` } },
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
      apiKey: projectApiKey,
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
          documentKey: docKey,
          root: `{"title": Long(123)}`,
          schemaKey: `schema2-${time}@1`,
        },
        { headers: { Authorization: `API-Key ${projectSecretKey}` } },
      );
      assert.fail('expected an error to be thrown');
    } catch (error) {
      assert.equal(
        (error as AxiosError<{ message: string }>).response?.data?.message,
        'schema validation failed: expected integer at path $.title',
      );
    }

    await client.deactivate();
  });

  it('can detach schema via UpdateDocument API', async ({ task }) => {
    const client = new yorkie.Client({
      rpcAddr: testRPCAddr,
      apiKey: projectApiKey,
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
        { documentKey: docKey, root: '', schemaKey: '' },
        { headers: { Authorization: `API-Key ${projectSecretKey}` } },
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
        documentKey: docKey,
        root: '',
        schemaKey: '',
      },
      {
        headers: { Authorization: `API-Key ${projectSecretKey}` },
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
      apiKey: projectApiKey,
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
        { documentKey: docKey, root: '', schemaKey: `schema2-${time}@1` },
        { headers: { Authorization: `API-Key ${projectSecretKey}` } },
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
        { documentKey: docKey, root: '', schemaKey: `schema2-${time}@1` },
        { headers: { Authorization: `API-Key ${projectSecretKey}` } },
      );
    } catch (error) {
      assert.equal(
        (error as AxiosError<{ message: string }>).response?.data?.message,
        'schema validation failed: expected integer at path $.title',
      );
    }

    await axios.post(
      `${testRPCAddr}/yorkie.v1.AdminService/UpdateDocument`,
      { documentKey: docKey, root: '', schemaKey: `schema-${time}@1` },
      { headers: { Authorization: `API-Key ${projectSecretKey}` } },
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
      `schema validation failed: expected string at path $.title`,
    );

    await client.deactivate();
  });

  it('can update schema only', async ({ task }) => {
    const client = new yorkie.Client({
      rpcAddr: testRPCAddr,
      apiKey: projectApiKey,
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
        { documentKey: docKey, root: '', schemaKey: `schema2-${time}@1` },
        { headers: { Authorization: `API-Key ${projectSecretKey}` } },
      );
    } catch (error) {
      assert.equal(
        (error as AxiosError<{ message: string }>).response?.data?.message,
        'schema validation failed: expected integer at path $.title',
      );
    }

    await client.deactivate();
  });

  it('can update root only', async ({ task }) => {
    const client = new yorkie.Client({
      rpcAddr: testRPCAddr,
      apiKey: projectApiKey,
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
      { documentKey: docKey, root: `{"title": Int(123)}`, schemaKey: '' },
      { headers: { Authorization: `API-Key ${projectSecretKey}` } },
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
      apiKey: projectApiKey,
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
        { documentKey: docKey, root: `{"title": Int(123)}`, schemaKey: '' },
        { headers: { Authorization: `API-Key ${projectSecretKey}` } },
      );
    } catch (error) {
      assert.equal(
        (error as AxiosError<{ message: string }>).response?.data?.message,
        'schema validation failed: expected string at path $.title',
      );
    }

    await axios.post(
      `${testRPCAddr}/yorkie.v1.AdminService/UpdateDocument`,
      { documentKey: docKey, root: `{"title": "world"}`, schemaKey: '' },
      { headers: { Authorization: `API-Key ${projectSecretKey}` } },
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
      `schema validation failed: expected string at path $.title`,
    );

    await client.deactivate();
  });
});
