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
  DocSyncStatus,
  DocEventType,
} from '@yorkie-js/sdk/src/yorkie';
import {
  assertThrowsAsync,
  EventCollector,
} from '@yorkie-js/sdk/test/helper/helper';
import {
  toDocKey,
  testRPCAddr,
  testAPIID,
  testAPIPW,
  webhookAddr,
} from '@yorkie-js/sdk/test/integration/integration_helper';
import { ConnectError } from '@connectrpc/connect';
import axios from 'axios';
import express from 'express';

const webhookServer = express();
const webhookServerPort = 3004;
let webhookServerInstance: any;
let webhookServerAddress: string;
let apiKey: string;
let adminToken: string;
const AllAuthWebhookMethods = [
  'ActivateClient',
  'DeactivateClient',
  'AttachDocument',
  'DetachDocument',
  'RemoveDocument',
  'PushPull',
  'WatchDocuments',
  'Broadcast',
];

const InvalidTokenErrorMessage = 'invalid token';
const ExpiredTokenErrorMessage = 'expired token';
const NotAllowedToken = 'not-allowed-token';

webhookServer.post('/auth-webhook', express.json(), (req, res) => {
  const authToken = req.body.token;

  // valid token
  if (authToken.startsWith('token')) {
    const expireTime = authToken.split('-')[1];
    if (Number(expireTime) < Date.now()) {
      res.status(401).send({
        allowed: false,
        reason: ExpiredTokenErrorMessage,
      });
      return;
    }
    res.status(200).send({
      allowed: true,
    });
    return;
  }

  if (authToken === NotAllowedToken) {
    res.status(403).send({
      allowed: false,
    });
    return;
  }

  // invalid token
  res.status(401).send({
    allowed: false,
    reason: InvalidTokenErrorMessage,
  });
});

describe('Auth Webhook', () => {
  beforeAll(async () => {
    // Start webhook server
    webhookServerInstance = webhookServer.listen(webhookServerPort, () => {
      const addr = webhookServerInstance.address();
      webhookServerAddress = webhookAddr || addr.address;
    });

    // Login to yorkie
    const loginResponse = await axios.post(
      `${testRPCAddr}/yorkie.v1.AdminService/LogIn`,
      { username: testAPIID, password: testAPIPW },
    );
    adminToken = loginResponse.data.token;

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
          auth_webhook_url: `http://${webhookServerAddress}:${webhookServerPort}/auth-webhook`,
          auth_webhook_methods: { methods: AllAuthWebhookMethods },
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
    const c1 = new yorkie.Client({
      rpcAddr: testRPCAddr,
      apiKey,
      authTokenInjector: async () => {
        return `token-${Date.now() + 1000 * 60 * 60}`; // expire in 1 hour
      },
    });
    const c2 = new yorkie.Client({
      rpcAddr: testRPCAddr,
      apiKey,
      authTokenInjector: async () => {
        return `token-${Date.now() + 1000 * 60 * 60}`; // expire in 1 hour
      },
    });

    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    await c1.activate();
    await c2.activate();
    const doc1 = new yorkie.Document<{ k1: string }>(docKey);
    const doc2 = new yorkie.Document<{ k1: string }>(docKey);

    await c1.attach(doc1);
    await c2.attach(doc2);

    const eventCollector = new EventCollector();
    const topic = 'test';
    const payload = 'data';
    const unsubscribe = doc2.subscribe('broadcast', (event) => {
      if (event.value.topic === topic) {
        eventCollector.add(event.value.payload as string);
      }
    });
    doc1.broadcast(topic, payload);
    await eventCollector.waitAndVerifyNthEvent(1, payload);

    doc1.update((root) => {
      root.k1 = 'v1';
    });
    await c1.sync(doc1);
    await c2.sync(doc2);
    expect(doc2.toSortedJSON()).toBe('{"k1":"v1"}');

    await c1.detach(doc1);
    await c2.remove(doc2);

    unsubscribe();
    await c1.deactivate();
    await c2.deactivate();
  });

  it('should return unauthenticated error for client with empty token (401)', async () => {
    // client without token
    const cliWithoutToken = new yorkie.Client({
      rpcAddr: testRPCAddr,
      apiKey,
    });
    await assertThrowsAsync(
      async () => {
        await cliWithoutToken.activate();
      },
      ConnectError,
      /^\[unauthenticated\]/i,
    );
  });

  it('should return unauthenticated error for client with invalid token (401)', async () => {
    // client with invalid token
    const invalidTokenInjector = vi.fn(async () => {
      return 'invalid-token';
    });
    const cliWithInvalidToken = new yorkie.Client({
      rpcAddr: testRPCAddr,
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
    const cliNotAllowed = new yorkie.Client({
      rpcAddr: testRPCAddr,
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

  it('should refresh token when unauthenticated error occurs (in manual sync)', async ({
    task,
  }) => {
    const TokenExpirationMs = 500;
    const authTokenInjector = vi.fn(async (reason) => {
      if (
        reason === ExpiredTokenErrorMessage ||
        authTokenInjector.mock.calls.length === 3
      ) {
        return `token-${Date.now() + TokenExpirationMs}`;
      }
      return `token-${Date.now() - TokenExpirationMs}`; // token expired
    });
    // client with token
    const client = new yorkie.Client({
      rpcAddr: testRPCAddr,
      apiKey,
      authTokenInjector,
    });

    await assertThrowsAsync(
      async () => {
        await client.activate();
      },
      ConnectError,
      /^\[unauthenticated\]/i,
    );
    expect(authTokenInjector).toBeCalledTimes(2);
    expect(authTokenInjector).nthCalledWith(1);
    expect(authTokenInjector).nthCalledWith(2, ExpiredTokenErrorMessage);
    // retry activate
    await client.activate();
    expect(authTokenInjector).nthCalledWith(3);
    expect(authTokenInjector).nthCalledWith(3);

    const doc = new yorkie.Document<{ k1: string }>(
      toDocKey(`${task.name}-${new Date().getTime()}`),
    );

    await new Promise((res) => setTimeout(res, TokenExpirationMs));
    await assertThrowsAsync(
      async () => {
        await client.attach(doc, { syncMode: SyncMode.Manual });
      },
      ConnectError,
      /^\[unauthenticated\]/i,
    );
    expect(authTokenInjector).toBeCalledTimes(4);
    expect(authTokenInjector).nthCalledWith(4, ExpiredTokenErrorMessage);
    // retry attach
    await client.attach(doc, { syncMode: SyncMode.Manual });

    doc.update((root) => {
      root.k1 = 'v1';
    });

    await new Promise((res) => setTimeout(res, TokenExpirationMs));
    await assertThrowsAsync(
      async () => {
        await client.sync(doc);
      },
      ConnectError,
      /^\[unauthenticated\]/i,
    );
    expect(authTokenInjector).toBeCalledTimes(5);
    expect(authTokenInjector).nthCalledWith(5, ExpiredTokenErrorMessage);
    // retry sync in manual mode
    await client.sync(doc);

    await new Promise((res) => setTimeout(res, TokenExpirationMs));
    await assertThrowsAsync(
      async () => {
        await client.detach(doc);
      },
      ConnectError,
      /^\[unauthenticated\]/i,
    );
    expect(authTokenInjector).toBeCalledTimes(6);
    expect(authTokenInjector).nthCalledWith(6, ExpiredTokenErrorMessage);
    // retry detach
    await client.detach(doc);

    await new Promise((res) => setTimeout(res, TokenExpirationMs));
    await assertThrowsAsync(
      async () => {
        await client.deactivate();
      },
      ConnectError,
      /^\[unauthenticated\]/i,
    );
    expect(authTokenInjector).toBeCalledTimes(7);
    expect(authTokenInjector).nthCalledWith(7, ExpiredTokenErrorMessage);
    // retry deactivate
    await client.deactivate();
  });

  it('should refresh token when unauthenticated error occurs (RemoveDocument)', async ({
    task,
  }) => {
    // Create New project
    const projectResponse = await axios.post(
      `${testRPCAddr}/yorkie.v1.AdminService/CreateProject`,
      { name: `auth-webhook-${new Date().getTime()}` },
      {
        headers: { Authorization: adminToken },
      },
    );
    const projectId = projectResponse.data.project.id;
    apiKey = projectResponse.data.project.publicKey;

    // Update project with webhook url and methods
    await axios.post(
      `${testRPCAddr}/yorkie.v1.AdminService/UpdateProject`,
      {
        id: projectId,
        fields: {
          auth_webhook_url: `http://${webhookServerAddress}:${webhookServerPort}/auth-webhook`,
          auth_webhook_methods: { methods: ['RemoveDocument'] },
        },
      },
      {
        headers: { Authorization: adminToken },
      },
    );

    const TokenExpirationMs = 500;
    const authTokenInjector = vi.fn(async (reason) => {
      if (reason === ExpiredTokenErrorMessage) {
        return `token-${Date.now() + TokenExpirationMs}`;
      }
      return `token-${Date.now() - TokenExpirationMs}`; // token expired
    });
    // client with token
    const client = new yorkie.Client({
      rpcAddr: testRPCAddr,
      apiKey,
      authTokenInjector,
    });

    await client.activate();
    const doc = new yorkie.Document<{ k1: string }>(
      toDocKey(`${task.name}-${new Date().getTime()}`),
    );
    await client.attach(doc, { syncMode: SyncMode.Manual });

    await new Promise((res) => setTimeout(res, TokenExpirationMs));
    await assertThrowsAsync(
      async () => {
        await client.remove(doc);
      },
      ConnectError,
      /^\[unauthenticated\]/i,
    );
    expect(authTokenInjector).toBeCalledTimes(2);
    expect(authTokenInjector).nthCalledWith(1);
    expect(authTokenInjector).nthCalledWith(2, ExpiredTokenErrorMessage);
    // retry remove document
    await client.remove(doc);

    await client.deactivate();
  });

  it('should refresh token and retry realtime sync', async ({ task }) => {
    // Create New project
    const projectResponse = await axios.post(
      `${testRPCAddr}/yorkie.v1.AdminService/CreateProject`,
      { name: `auth-webhook-${new Date().getTime()}` },
      {
        headers: { Authorization: adminToken },
      },
    );
    const projectId = projectResponse.data.project.id;
    apiKey = projectResponse.data.project.publicKey;

    // Update project with webhook url and methods
    await axios.post(
      `${testRPCAddr}/yorkie.v1.AdminService/UpdateProject`,
      {
        id: projectId,
        fields: {
          auth_webhook_url: `http://${webhookServerAddress}:${webhookServerPort}/auth-webhook`,
          auth_webhook_methods: { methods: ['PushPull'] },
        },
      },
      {
        headers: { Authorization: adminToken },
      },
    );

    const TokenExpirationMs = 500;
    const authTokenInjector = vi.fn(async (reason) => {
      if (reason === ExpiredTokenErrorMessage) {
        return `token-${Date.now() + TokenExpirationMs}`;
      }
      return `token-${Date.now()}`;
    });
    // client with token
    const client = new yorkie.Client({
      rpcAddr: testRPCAddr,
      apiKey,
      authTokenInjector,
      retrySyncLoopDelay: 100,
    });

    await client.activate();
    const doc = new yorkie.Document<{ k1: string }>(
      toDocKey(`${task.name}-${new Date().getTime()}`),
    );
    await client.attach(doc);

    // retry realtime sync
    await new Promise((res) => setTimeout(res, TokenExpirationMs));
    const syncEventCollector = new EventCollector();
    doc.subscribe('sync', (event) => {
      syncEventCollector.add(event.value);
    });
    const authErrorEventCollector = new EventCollector<{
      reason: string;
      method: string;
    }>();
    doc.subscribe('auth-error', (event) => {
      authErrorEventCollector.add(event.value);
    });

    doc.update((root) => {
      root.k1 = 'v1';
    });

    expect(authTokenInjector).toBeCalledTimes(2);
    expect(authTokenInjector).nthCalledWith(1);
    expect(authTokenInjector).nthCalledWith(2, ExpiredTokenErrorMessage);

    await client.detach(doc);
    await client.deactivate();
  });

  it('should refresh token and retry watch document', async ({ task }) => {
    // Create New project
    const projectResponse = await axios.post(
      `${testRPCAddr}/yorkie.v1.AdminService/CreateProject`,
      { name: `auth-webhook-${new Date().getTime()}` },
      {
        headers: { Authorization: adminToken },
      },
    );
    const projectId = projectResponse.data.project.id;
    apiKey = projectResponse.data.project.publicKey;

    // Update project with webhook url and methods
    await axios.post(
      `${testRPCAddr}/yorkie.v1.AdminService/UpdateProject`,
      {
        id: projectId,
        fields: {
          auth_webhook_url: `http://${webhookServerAddress}:${webhookServerPort}/auth-webhook`,
          auth_webhook_methods: { methods: ['WatchDocuments'] },
        },
      },
      {
        headers: { Authorization: adminToken },
      },
    );

    const TokenExpirationMs = 500;
    const authTokenInjector = vi.fn(async (reason) => {
      if (reason === ExpiredTokenErrorMessage) {
        return `token-${Date.now() + TokenExpirationMs}`;
      }
      return `token-${Date.now()}`;
    });
    // client with token
    const client = new yorkie.Client({
      rpcAddr: testRPCAddr,
      apiKey,
      authTokenInjector,
      reconnectStreamDelay: 100,
    });

    await client.activate();
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const doc = new yorkie.Document<{ k1: string }>(docKey);

    const authErrorEventCollector = new EventCollector<{
      reason: string;
      method: string;
    }>();
    doc.subscribe('auth-error', (event) => {
      authErrorEventCollector.add(event.value);
    });

    // Another client for verifying if the watchDocument is working properly
    const client2 = new yorkie.Client({
      rpcAddr: testRPCAddr,
      apiKey,
      authTokenInjector: async () => {
        return `token-${Date.now() + 1000 * 60 * 60}`; // expire in 1 hour
      },
    });
    await client2.activate();
    const doc2 = new yorkie.Document<{ k1: string }>(docKey);
    await client2.attach(doc2);

    const presenceEventCollector = new EventCollector();
    doc2.subscribe('presence', (event) => {
      presenceEventCollector.add(event.type);
    });

    // retry watch document
    await new Promise((res) => setTimeout(res, TokenExpirationMs));
    await client.attach(doc);
    await authErrorEventCollector.waitFor({
      reason: ExpiredTokenErrorMessage,
      method: 'WatchDocuments',
    });
    expect(authTokenInjector).toBeCalledTimes(2);
    expect(authTokenInjector).nthCalledWith(1);
    expect(authTokenInjector).nthCalledWith(2, ExpiredTokenErrorMessage);
    await presenceEventCollector.waitFor(DocEventType.Watched);

    const syncEventCollector = new EventCollector();
    doc.subscribe('sync', (event) => {
      syncEventCollector.add(event.value);
    });
    doc2.update((root) => {
      root.k1 = 'v1';
    });
    await syncEventCollector.waitFor(DocSyncStatus.Synced);
    expect(doc.getRoot().k1).toBe('v1');

    await client.detach(doc);
    await client.deactivate();
  });

  it('should refresh token and retry broadcast', async ({ task }) => {
    // Create New project
    const projectResponse = await axios.post(
      `${testRPCAddr}/yorkie.v1.AdminService/CreateProject`,
      { name: `auth-webhook-${new Date().getTime()}` },
      {
        headers: { Authorization: adminToken },
      },
    );
    const projectId = projectResponse.data.project.id;
    apiKey = projectResponse.data.project.publicKey;

    // Update project with webhook url and methods
    await axios.post(
      `${testRPCAddr}/yorkie.v1.AdminService/UpdateProject`,
      {
        id: projectId,
        fields: {
          auth_webhook_url: `http://${webhookServerAddress}:${webhookServerPort}/auth-webhook`,
          auth_webhook_methods: { methods: ['Broadcast'] },
        },
      },
      {
        headers: { Authorization: adminToken },
      },
    );

    const TokenExpirationMs = 1500; // Set higher than DefaultBroadcastOptions.initialRetryInterval (1000ms)
    const authTokenInjector = vi.fn(async (reason) => {
      if (reason === ExpiredTokenErrorMessage) {
        return `token-${Date.now() + TokenExpirationMs}`;
      }
      return `token-${Date.now()}`;
    });
    // client with token
    const client = new yorkie.Client({
      rpcAddr: testRPCAddr,
      apiKey,
      authTokenInjector,
      reconnectStreamDelay: 100,
    });

    await client.activate();
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const doc = new yorkie.Document<{ k1: string }>(docKey);
    await client.attach(doc);
    const authErrorEventCollector = new EventCollector<{
      reason: string;
      method: string;
    }>();
    doc.subscribe('auth-error', (event) => {
      authErrorEventCollector.add(event.value);
    });

    // Another client for verifying if the broadcast is working properly
    const client2 = new yorkie.Client({
      rpcAddr: testRPCAddr,
      apiKey,
      authTokenInjector: async () => {
        return `token-${Date.now() + 1000 * 60 * 60}`; // expire in 1 hour
      },
    });
    await client2.activate();
    const doc2 = new yorkie.Document<{ k1: string }>(docKey);
    await client2.attach(doc2);
    const eventCollector = new EventCollector();
    const topic = 'test';
    const payload = 'data';
    const unsubscribe = doc2.subscribe('broadcast', (event) => {
      if (event.value.topic === topic) {
        eventCollector.add(event.value.payload as string);
      }
    });

    // retry broadcast
    await new Promise((res) => setTimeout(res, TokenExpirationMs));
    doc.broadcast(topic, payload);
    await eventCollector.waitAndVerifyNthEvent(1, payload);
    await authErrorEventCollector.waitFor({
      reason: ExpiredTokenErrorMessage,
      method: 'Broadcast',
    });
    expect(authTokenInjector).toBeCalledTimes(2);
    expect(authTokenInjector).nthCalledWith(1);
    expect(authTokenInjector).nthCalledWith(2, ExpiredTokenErrorMessage);

    unsubscribe();
    await client.deactivate();
    await client2.deactivate();
  });
});
