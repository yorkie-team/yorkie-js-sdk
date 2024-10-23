/*
 * Copyright 2024 The Yorkie Authors. All rights reserved.
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

import { describe, it, vi, beforeAll, afterAll, expect } from 'vitest';

import yorkie, {
  SyncMode,
  DocumentSyncStatus,
} from '@yorkie-js-sdk/src/yorkie';
import {
  assertThrowsAsync,
  EventCollector,
} from '@yorkie-js-sdk/test/helper/helper';
import {
  toDocKey,
  testRPCAddr,
  testAPIID,
  testAPIPW,
} from '@yorkie-js-sdk/test/integration/integration_helper';
import { ConnectError } from '@connectrpc/connect';
import axios from 'axios';
import express from 'express';

const webhookServer = express();
const webhookServerPort = 3004;
let webhookServerInstance: any;
let apiKey: string;

const InvalidTokenErrorMessage = 'invalid token';
const ExpiredTokenErrorMessage = 'expired token';
const NotAllowedToken = 'not-allowed-token';

webhookServer.post('/auth-webhook', express.json(), (req, res) => {
  const authToken = req.body.token;

  // valid token
  if (authToken.startsWith('token')) {
    const expireTime = authToken.split('-')[1];
    if (Number(expireTime) < Date.now()) {
      res.status(200).send({
        code: 401,
        message: ExpiredTokenErrorMessage,
      });
      return;
    }
    res.status(200).send({
      code: 200,
    });
    return;
  }

  if (authToken === NotAllowedToken) {
    res.status(200).send({
      code: 403,
    });
    return;
  }

  // invalid token
  res.status(200).send({
    code: 401,
    message: InvalidTokenErrorMessage,
  });
});

describe('Auth Webhook', () => {
  beforeAll(async () => {
    // Start webhook server
    webhookServerInstance = webhookServer.listen(webhookServerPort);

    // Login to yorkie
    const loginResponse = await axios.post(
      `${testRPCAddr}/yorkie.v1.AdminService/LogIn`,
      { username: testAPIID, password: testAPIPW },
    );
    const adminToken = loginResponse.data.token;

    // Create project
    const projectResponse = await axios.post(
      `${testRPCAddr}/yorkie.v1.AdminService/CreateProject`,
      { name: `auth-webhook-${new Date().getTime()}` },
      {
        headers: { Authorization: adminToken },
      },
    );
    const projectId = projectResponse.data.project.id;
    apiKey = projectResponse.data.project.publicKey;

    // Update project with webhook url
    await axios.post(
      `${testRPCAddr}/yorkie.v1.AdminService/UpdateProject`,
      {
        id: projectId,
        fields: {
          auth_webhook_url: `http://127.0.0.1:${webhookServerPort}/auth-webhook`,
        },
      },
      {
        headers: { Authorization: adminToken },
      },
    );
  });

  afterAll(() => {
    if (webhookServerInstance) {
      webhookServerInstance.close();
    }
  });

  it('should successfully authorize with valid token(200)', async ({
    task,
  }) => {
    // client with token
    const client = new yorkie.Client(testRPCAddr, {
      apiKey,
      authTokenInjector: async () => {
        return `token-${Date.now() + 1000 * 60 * 60}`; // expire in 1 hour
      },
    });

    await client.activate();
    const doc = new yorkie.Document<{ k1: string }>(
      toDocKey(`${task.name}-${new Date().getTime()}`),
    );
    await client.attach(doc);
    doc.update((root) => {
      root.k1 = 'v1';
    });
    await client.sync(doc);
    await client.detach(doc);
    await client.deactivate();
  });

  it('should return unauthenticated error for client with invalid token (401)', async () => {
    // client without token
    const cliWithoutToken = new yorkie.Client(testRPCAddr, {
      apiKey,
    });
    await assertThrowsAsync(
      async () => {
        await cliWithoutToken.activate();
      },
      ConnectError,
      /^\[unauthenticated\]/i,
    );

    // client with invalid token
    const invalidTokenInjector = vi.fn(async () => {
      return 'invalid-token';
    });
    const cliWithInvalidToken = new yorkie.Client(testRPCAddr, {
      apiKey,
      authTokenInjector: invalidTokenInjector,
    });
    await assertThrowsAsync(
      async () => {
        await cliWithInvalidToken.activate();
      },
      ConnectError,
      /^\[unauthenticated\]/i,
    );
  });

  it('should return permission denied error for client with not allowed token (403)', async () => {
    // client with not allowed token
    const notAllowedTokenInjector = vi.fn(async () => {
      return NotAllowedToken;
    });
    const cliNotAllowed = new yorkie.Client(testRPCAddr, {
      apiKey,
      authTokenInjector: notAllowedTokenInjector,
    });

    await assertThrowsAsync(
      async () => {
        await cliNotAllowed.activate();
      },
      ConnectError,
      /^\[permission_denied\]/i,
    );
    expect(notAllowedTokenInjector).toBeCalledTimes(1);
    expect(notAllowedTokenInjector).nthCalledWith(1);
  });

  it('should refresh token and retry when unauthenticated error occurs', async ({
    task,
  }) => {
    const TokenExpirationMs = 2000;
    const authTokenInjector = vi.fn(async (authErrorMessage) => {
      if (authErrorMessage === ExpiredTokenErrorMessage) {
        return `token-${Date.now() + TokenExpirationMs}`;
      }
      return `token-${Date.now() - 1000}`; // token expired
    });
    // client with token
    const client = new yorkie.Client(testRPCAddr, {
      apiKey,
      authTokenInjector,
    });

    // retry activate
    await client.activate();
    expect(authTokenInjector).toBeCalledTimes(2);
    expect(authTokenInjector).nthCalledWith(1);
    expect(authTokenInjector).nthCalledWith(2, ExpiredTokenErrorMessage);

    const doc = new yorkie.Document<{ k1: string }>(
      toDocKey(`${task.name}-${new Date().getTime()}`),
    );

    // retry attach
    await new Promise((res) => setTimeout(res, TokenExpirationMs));
    await client.attach(doc, { syncMode: SyncMode.Manual });
    expect(authTokenInjector).toBeCalledTimes(3);
    expect(authTokenInjector).nthCalledWith(3, ExpiredTokenErrorMessage);

    // retry sync in manual mode
    await new Promise((res) => setTimeout(res, TokenExpirationMs));
    doc.update((root) => {
      root.k1 = 'v1';
    });
    await client.sync(doc);
    expect(authTokenInjector).toBeCalledTimes(4);
    expect(authTokenInjector).nthCalledWith(4, ExpiredTokenErrorMessage);

    // retry sync in realtime mode
    await new Promise((res) => setTimeout(res, TokenExpirationMs));
    await client.changeSyncMode(doc, SyncMode.Realtime);
    const syncEventCollector = new EventCollector();
    doc.subscribe('sync', (event) => {
      syncEventCollector.add(event.value);
    });
    doc.update((root) => {
      root.k1 = 'v2';
    });
    await syncEventCollector.waitFor(DocumentSyncStatus.Synced);
    expect(authTokenInjector).toBeCalledTimes(5);
    expect(authTokenInjector).nthCalledWith(5, ExpiredTokenErrorMessage);

    // retry detach
    await new Promise((res) => setTimeout(res, TokenExpirationMs));
    await client.detach(doc);
    expect(authTokenInjector).toBeCalledTimes(6);
    expect(authTokenInjector).nthCalledWith(6, ExpiredTokenErrorMessage);

    // retry deactivate
    await new Promise((res) => setTimeout(res, TokenExpirationMs));
    await client.deactivate();
    expect(authTokenInjector).toBeCalledTimes(7);
    expect(authTokenInjector).nthCalledWith(7, ExpiredTokenErrorMessage);
  });
});
