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
import yorkie, { Text } from '@yorkie-js/sdk/src/yorkie';
import { YorkieError } from '@yorkie-js/sdk/src/util/error';
import { totalDocSize } from '@yorkie-js/sdk/src/util/resource';

let adminToken: string;

describe('Document Size Limit', () => {
  beforeAll(async () => {
    const loginResponse = await axios.post(
      `${testRPCAddr}/yorkie.v1.AdminService/LogIn`,
      { username: testAPIID, password: testAPIPW },
    );
    adminToken = loginResponse.data.token;
  });

  it('should successfully assign size limit to document', async ({ task }) => {
    // Create New project
    const now = new Date().getTime();
    const createProjectResponse = await axios.post(
      `${testRPCAddr}/yorkie.v1.AdminService/CreateProject`,
      { name: `doc-size-${now}` },
      {
        headers: { Authorization: adminToken },
      },
    );
    const projectId = createProjectResponse.data.project.id;
    // apiKey = createProjectResponse.data.project.publicKey;

    const sizeLimit = 10 * 1024 * 1024;
    await axios.post(
      `${testRPCAddr}/yorkie.v1.AdminService/UpdateProject`,
      {
        id: projectId,
        fields: {
          max_size_per_document: sizeLimit,
        },
      },
      {
        headers: { Authorization: adminToken },
      },
    );

    const projectResponse = await axios.post(
      `${testRPCAddr}/yorkie.v1.AdminService/GetProject`,
      { name: `doc-size-${now}` },
      {
        headers: { Authorization: adminToken },
      },
    );
    const project = projectResponse.data.project;
    assert.equal(project.maxSizePerDocument, sizeLimit);

    const client = new yorkie.Client({
      rpcAddr: testRPCAddr,
      apiKey: project.publicKey,
    });
    await client.activate();

    const doc = new yorkie.Document<{ k1: string }>(
      toDocKey(`${task.name}-${new Date().getTime()}`),
    );
    await client.attach(doc);

    assert.equal(doc.getMaxSizePerDocument(), sizeLimit);

    await client.detach(doc);
    await client.deactivate();
  });

  it('should reject update that exceeds document size limit', async ({
    task,
  }) => {
    const now = Date.now();
    const projectName = `size-limit-${now}`;
    const sizeLimit = 100;

    const createResp = await axios.post(
      `${testRPCAddr}/yorkie.v1.AdminService/CreateProject`,
      { name: projectName },
      { headers: { Authorization: adminToken } },
    );
    const project = createResp.data.project;

    await axios.post(
      `${testRPCAddr}/yorkie.v1.AdminService/UpdateProject`,
      {
        id: project.id,
        fields: {
          max_size_per_document: sizeLimit,
        },
      },
      { headers: { Authorization: adminToken } },
    );

    const client = new yorkie.Client({
      rpcAddr: testRPCAddr,
      apiKey: project.publicKey,
    });
    await client.activate();

    const docKey = toDocKey(`${task.name}-${now}`);
    const doc = new yorkie.Document<{ text: Text }>(docKey);
    await client.attach(doc);

    doc.update((root) => (root.text = new Text()));

    assert.deepEqual(doc.getDocSize().live, { data: 0, meta: 72 });

    // try {
    //   doc.update((root) => {
    //     root.text.edit(0, 0, 'helloworld');
    //   });
    // } catch (err) {
    //   assert.instanceOf(err, YorkieError);
    //   assert.match((err as Error).message, /document size exceeded/);
    // }

    assert.throws(
      () => {
        doc.update((root) => {
          root.text.edit(0, 0, 'helloworld');
        });
      },
      YorkieError,
      `document size exceeded`,
    );

    assert.equal(totalDocSize(doc.getDocSize()), 72);

    await client.detach(doc);
    await client.deactivate();
  });
});
