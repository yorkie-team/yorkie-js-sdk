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
  Channel,
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

/**
 * `waitForAttached` blocks until the channel's first RefreshChannel heartbeat
 * has flipped status to Attached.
 */
async function waitForAttached(
  channel: Channel,
  { timeout = 8000 } = {},
): Promise<void> {
  const deadline = Date.now() + timeout;
  while (!channel.isAttached() || !channel.getSessionID()) {
    if (Date.now() > deadline) {
      throw new Error(
        `waitForAttached: ${channel.getKey()} did not attach (status=${channel.getStatus()})`,
      );
    }
    await new Promise((r) => setTimeout(r, 50));
  }
}

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

  'Watch',
  'Broadcast',
];

const InvalidTokenErrorMessage = 'invalid token';
const ExpiredTokenErrorMessage = 'expired token';
const NotAllowedToken = 'not-allowed-token';

// `webhookCalls` records every webhook request, so a test can count what the
// server asked while a token refresh was failing.
const webhookCalls: Array<{ token: string; method: string }> = [];

// `ShortTokenLifetimeMs` is how long the first token lasts in the tests that
// let it expire on purpose.
const ShortTokenLifetimeMs = 500;

// `AuthWebhookCacheTTLMs` is a little over the server's default
// `auth-webhook-cache-ttl` (10s).
const AuthWebhookCacheTTLMs = 10500;

/**
 * `createWebhookProject` creates a project whose auth webhook guards the given
 * methods and returns its public key.
 */
async function createWebhookProject(methods: Array<string>): Promise<string> {
  const projectResponse = await axios.post(
    `${testRPCAddr}/yorkie.v1.AdminService/CreateProject`,
    { name: `auth-webhook-${new Date().getTime()}` },
    { headers: { Authorization: `Bearer ${adminToken}` } },
  );
  await axios.post(
    `${testRPCAddr}/yorkie.v1.AdminService/UpdateProject`,
    {
      id: projectResponse.data.project.id,
      fields: {
        auth_webhook_url: `http://${webhookServerAddress}:${webhookServerPort}/auth-webhook`,
        auth_webhook_methods: { methods },
        auth_webhook_max_retries: 0,
        auth_webhook_request_timeout: '1s',
      },
    },
    { headers: { Authorization: `Bearer ${adminToken}` } },
  );
  return projectResponse.data.project.publicKey;
}

webhookServer.post('/auth-webhook', express.json(), (req, res) => {
  const authToken = req.body.token;
  webhookCalls.push({ token: authToken, method: req.body.method });

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
      webhookServerAddress = webhookAddr;
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
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );
    const projectId = projectResponse.data.project.id;
    apiKey = projectResponse.data.project.publicKey;

    // Update project with webhook url.
    // max_retries=0 and request_timeout=1s keep failing webhook calls
    // fast when the container cannot reach the host webhook server,
    // so the suite does not hang on the server's ~60s default retry
    // budget.
    await axios.post(
      `${testRPCAddr}/yorkie.v1.AdminService/UpdateProject`,
      {
        id: projectId,
        fields: {
          auth_webhook_url: `http://${webhookServerAddress}:${webhookServerPort}/auth-webhook`,
          auth_webhook_methods: { methods: AllAuthWebhookMethods },
          auth_webhook_max_retries: 0,
          auth_webhook_request_timeout: '1s',
        },
      },
      { headers: { Authorization: `Bearer ${adminToken}` } },
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

    const channelKey = `presence-${docKey}`;
    const ch1 = new yorkie.Channel(channelKey);
    const ch2 = new yorkie.Channel(channelKey);
    await c1.attach(ch1);
    await c2.attach(ch2);
    await waitForAttached(ch1);
    await waitForAttached(ch2);

    const eventCollector = new EventCollector();
    const topic = 'test';
    const payload = 'data';
    const unsubscribe = ch2.subscribe((event) => {
      if (event.type === 'broadcast' && event.topic === topic) {
        eventCollector.add(event.payload as string);
      }
    });
    ch1.broadcast(topic, payload);
    await eventCollector.waitAndVerifyNthEvent(1, payload);

    doc1.update((root) => {
      root.k1 = 'v1';
    });
    await c1.sync(doc1);
    await c2.sync(doc2);
    expect(doc2.toSortedJSON()).toBe('{"k1":"v1"}');

    await c1.detach(ch1);
    await c2.detach(ch2);
    await c1.detach(doc1);
    await c2.remove(doc2);

    unsubscribe();
    await c1.deactivate();
    await c2.deactivate();
    // 60s: every RPC pays an extra round trip to the auth webhook on top of
    // istanbul coverage overhead; the test exercises ~12 RPCs end-to-end.
  }, 60000);

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
      { headers: { Authorization: `Bearer ${adminToken}` } },
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
          auth_webhook_max_retries: 0,
          auth_webhook_request_timeout: '1s',
        },
      },
      { headers: { Authorization: `Bearer ${adminToken}` } },
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
      { headers: { Authorization: `Bearer ${adminToken}` } },
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
          auth_webhook_max_retries: 0,
          auth_webhook_request_timeout: '1s',
        },
      },
      { headers: { Authorization: `Bearer ${adminToken}` } },
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
      { headers: { Authorization: `Bearer ${adminToken}` } },
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
          auth_webhook_methods: { methods: ['Watch'] },
          auth_webhook_max_retries: 0,
          auth_webhook_request_timeout: '1s',
        },
      },
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );

    const TokenExpirationMs = 500;
    const authTokenInjector = vi.fn(async (reason) => {
      if (reason === ExpiredTokenErrorMessage) {
        return `token-${Date.now() + TokenExpirationMs}`;
      }
      return `token-${Date.now()}`;
    });
    // client with token
    const c1 = new yorkie.Client({
      rpcAddr: testRPCAddr,
      apiKey,
      authTokenInjector,
      reconnectStreamDelay: 100,
    });

    await c1.activate();
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
    await c1.attach(doc);
    await authErrorEventCollector.waitFor({
      reason: ExpiredTokenErrorMessage,
      method: 'Watch',
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

    await c1.detach(doc);
    await c1.deactivate();
  });

  it('should keep retrying realtime sync when a token refresh fails', async ({
    task,
  }) => {
    // Create New project
    const projectResponse = await axios.post(
      `${testRPCAddr}/yorkie.v1.AdminService/CreateProject`,
      { name: `auth-webhook-${new Date().getTime()}` },
      { headers: { Authorization: `Bearer ${adminToken}` } },
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
          auth_webhook_max_retries: 0,
          auth_webhook_request_timeout: '1s',
        },
      },
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );

    // The first refresh fails as if the token API were down for a moment;
    // the next one succeeds.
    const TokenExpirationMs = 500;
    let refreshFailures = 1;
    const authTokenInjector = vi.fn(async (reason) => {
      if (reason === ExpiredTokenErrorMessage) {
        if (refreshFailures > 0) {
          refreshFailures--;
          throw new Error('token api unavailable');
        }
        return `token-${Date.now() + 1000 * 60 * 60}`;
      }
      return `token-${Date.now() + TokenExpirationMs}`;
    });
    const client = new yorkie.Client({
      rpcAddr: testRPCAddr,
      apiKey,
      authTokenInjector,
      retrySyncLoopDelay: 100,
    });

    await client.activate();
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const doc = new yorkie.Document<{ k1: string }>(docKey);
    await client.attach(doc);

    await new Promise((res) => setTimeout(res, TokenExpirationMs));
    const syncEventCollector = new EventCollector();
    doc.subscribe('sync', (event) => {
      syncEventCollector.add(event.value);
    });

    doc.update((root) => {
      root.k1 = 'v1';
    });

    // The failed refresh must not stop the loop: it retries, gets 401 again,
    // refreshes successfully and pushes the change.
    await syncEventCollector.waitFor(DocSyncStatus.Synced);
    expect(authTokenInjector).toBeCalledTimes(3);
    expect(authTokenInjector).nthCalledWith(1);
    expect(authTokenInjector).nthCalledWith(2, ExpiredTokenErrorMessage);
    expect(authTokenInjector).nthCalledWith(3, ExpiredTokenErrorMessage);

    const client2 = new yorkie.Client({
      rpcAddr: testRPCAddr,
      apiKey,
      authTokenInjector: async () => `token-${Date.now() + 1000 * 60 * 60}`,
    });
    await client2.activate();
    const doc2 = new yorkie.Document<{ k1: string }>(docKey);
    await client2.attach(doc2, { syncMode: SyncMode.Manual });
    expect(doc2.getRoot().k1).toBe('v1');

    await client2.deactivate();
    await client.detach(doc);
    await client.deactivate();
  });

  it('should keep reconnecting watch document when a token refresh fails', async ({
    task,
  }) => {
    // Create New project
    const projectResponse = await axios.post(
      `${testRPCAddr}/yorkie.v1.AdminService/CreateProject`,
      { name: `auth-webhook-${new Date().getTime()}` },
      { headers: { Authorization: `Bearer ${adminToken}` } },
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
          auth_webhook_methods: { methods: ['Watch'] },
          auth_webhook_max_retries: 0,
          auth_webhook_request_timeout: '1s',
        },
      },
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );

    // The first refresh fails as if the token API were down for a moment;
    // the next one succeeds.
    const TokenExpirationMs = 500;
    let refreshFailures = 1;
    const authTokenInjector = vi.fn(async (reason) => {
      if (reason === ExpiredTokenErrorMessage) {
        if (refreshFailures > 0) {
          refreshFailures--;
          throw new Error('token api unavailable');
        }
        return `token-${Date.now() + 1000 * 60 * 60}`;
      }
      return `token-${Date.now() + TokenExpirationMs}`;
    });
    const c1 = new yorkie.Client({
      rpcAddr: testRPCAddr,
      apiKey,
      authTokenInjector,
      reconnectStreamDelay: 100,
    });

    await c1.activate();
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const doc = new yorkie.Document<{ k1: string }>(docKey);

    // Another client for verifying if the watchDocument is working properly
    const client2 = new yorkie.Client({
      rpcAddr: testRPCAddr,
      apiKey,
      authTokenInjector: async () => `token-${Date.now() + 1000 * 60 * 60}`,
    });
    await client2.activate();
    const doc2 = new yorkie.Document<{ k1: string }>(docKey);
    await client2.attach(doc2);

    const presenceEventCollector = new EventCollector();
    doc2.subscribe('presence', (event) => {
      presenceEventCollector.add(event.type);
    });

    // The failed refresh must not stop the watch loop: it reconnects, gets
    // 401 again, refreshes successfully and watches the document.
    await new Promise((res) => setTimeout(res, TokenExpirationMs));
    await c1.attach(doc);
    await presenceEventCollector.waitFor(DocEventType.Watched);
    expect(authTokenInjector).toBeCalledTimes(3);
    expect(authTokenInjector).nthCalledWith(1);
    expect(authTokenInjector).nthCalledWith(2, ExpiredTokenErrorMessage);
    expect(authTokenInjector).nthCalledWith(3, ExpiredTokenErrorMessage);

    const syncEventCollector = new EventCollector();
    doc.subscribe('sync', (event) => {
      syncEventCollector.add(event.value);
    });
    doc2.update((root) => {
      root.k1 = 'v1';
    });
    await syncEventCollector.waitFor(DocSyncStatus.Synced);
    expect(doc.getRoot().k1).toBe('v1');

    await client2.deactivate();
    await c1.detach(doc);
    await c1.deactivate();
  });

  it('should back off the token refresh and resend the refused token once per attempt', async ({
    task,
  }) => {
    apiKey = await createWebhookProject(['PushPull']);

    // The first two refreshes fail; the third succeeds after about 1s + 2s
    // of backoff.
    let refreshFailures = 2;
    const refreshedAt: Array<number> = [];
    const authTokenInjector = vi.fn(async (reason) => {
      if (reason === ExpiredTokenErrorMessage) {
        refreshedAt.push(Date.now());
        if (refreshFailures > 0) {
          refreshFailures--;
          throw new Error('token api unavailable');
        }
        return `token-${Date.now() + 1000 * 60 * 60}`;
      }
      return `token-${Date.now() + ShortTokenLifetimeMs}`;
    });
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
    const expiredToken = (await authTokenInjector.mock.results[0]
      .value) as string;

    await new Promise((res) => setTimeout(res, ShortTokenLifetimeMs));
    const callsBeforeExpiry = webhookCalls.length;
    const syncEventCollector = new EventCollector();
    doc.subscribe('sync', (event) => {
      syncEventCollector.add(event.value);
    });
    doc.update((root) => {
      root.k1 = 'v1';
    });

    await syncEventCollector.waitFor(DocSyncStatus.Synced);
    expect(authTokenInjector).toBeCalledTimes(4);

    // The loop retries every 100ms, but the refreshes were 1s and then 2s
    // apart (±20%), and each one was set off by a single push with the
    // refused token.
    expect(refreshedAt[1] - refreshedAt[0]).toBeGreaterThanOrEqual(800);
    expect(refreshedAt[2] - refreshedAt[1]).toBeGreaterThanOrEqual(1600);
    const refused = webhookCalls
      .slice(callsBeforeExpiry)
      .filter(
        (call) => call.token === expiredToken && call.method === 'PushPull',
      );
    expect(refused).toHaveLength(3);

    await client.detach(doc);
    await client.deactivate();
  }, 10000);

  it('should pull a remote change whose pull failed on a 401', async ({
    task,
  }) => {
    apiKey = await createWebhookProject(['PushPull']);

    let refreshFailures = 1;
    const authTokenInjector = vi.fn(async (reason) => {
      if (reason === ExpiredTokenErrorMessage) {
        if (refreshFailures > 0) {
          refreshFailures--;
          throw new Error('token api unavailable');
        }
        return `token-${Date.now() + 1000 * 60 * 60}`;
      }
      return `token-${Date.now() + ShortTokenLifetimeMs}`;
    });
    const c1 = new yorkie.Client({
      rpcAddr: testRPCAddr,
      apiKey,
      authTokenInjector,
      retrySyncLoopDelay: 100,
    });
    const c2 = new yorkie.Client({
      rpcAddr: testRPCAddr,
      apiKey,
      authTokenInjector: async () => `token-${Date.now() + 1000 * 60 * 60}`,
    });
    await c1.activate();
    await c2.activate();

    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const d1 = new yorkie.Document<{ k1: string }>(docKey);
    const d2 = new yorkie.Document<{ k1: string }>(docKey);
    await c1.attach(d1);
    await c2.attach(d2);

    // c1 has no local changes: the only reason it pulls is c2's change, and
    // that pull is the one that gets the 401. The server caches an allowed
    // webhook answer for the same request for 10s (`auth-webhook-cache-ttl`),
    // so wait that out too, or the expired token would still pass.
    await new Promise((res) =>
      setTimeout(res, ShortTokenLifetimeMs + AuthWebhookCacheTTLMs),
    );
    d2.update((root) => {
      root.k1 = 'v1';
    });

    await vi.waitFor(() => expect(d1.getRoot().k1).toBe('v1'), {
      timeout: 10000,
    });
    expect(authTokenInjector).toBeCalledTimes(3);

    await c2.deactivate();
    await c1.detach(d1);
    await c1.deactivate();
  }, 25000);

  it('should refresh token and retry broadcast', async ({ task }) => {
    // Create New project
    const projectResponse = await axios.post(
      `${testRPCAddr}/yorkie.v1.AdminService/CreateProject`,
      { name: `auth-webhook-${new Date().getTime()}` },
      { headers: { Authorization: `Bearer ${adminToken}` } },
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
          auth_webhook_max_retries: 0,
          auth_webhook_request_timeout: '1s',
        },
      },
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );

    const TokenExpirationMs = 1500; // Set higher than DefaultBroadcastOptions.initialRetryInterval (1000ms)
    const authTokenInjector = vi.fn(async (reason) => {
      if (reason === ExpiredTokenErrorMessage) {
        return `token-${Date.now() + TokenExpirationMs}`;
      }
      return `token-${Date.now()}`;
    });
    // client with token
    const c1 = new yorkie.Client({
      rpcAddr: testRPCAddr,
      apiKey,
      authTokenInjector,
      reconnectStreamDelay: 100,
    });
    await c1.activate();
    const channelKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const ch1 = new yorkie.Channel(channelKey);
    await c1.attach(ch1);
    const collector1 = new EventCollector<{ reason: string; method: string }>();
    ch1.subscribe((event) => {
      if (event.type === 'auth-error') {
        collector1.add({ reason: event.reason, method: event.method });
      }
    });

    // Another client for verifying if the broadcast is working properly
    const c2 = new yorkie.Client({
      rpcAddr: testRPCAddr,
      apiKey,
      authTokenInjector: async () => {
        return `token-${Date.now() + 1000 * 60 * 60}`; // expire in 1 hour
      },
    });
    await c2.activate();
    const ch2 = new yorkie.Channel(channelKey);
    await c2.attach(ch2);
    await waitForAttached(ch1);
    await waitForAttached(ch2);

    const collector2 = new EventCollector();
    const topic = 'test';
    const payload = 'data';
    const unsub2 = ch2.subscribe((event) => {
      if (event.type === 'broadcast' && event.topic === topic) {
        collector2.add(event.payload as string);
      }
    });

    // retry broadcast
    await new Promise((res) => setTimeout(res, TokenExpirationMs));
    ch1.broadcast(topic, payload);
    await collector2.waitAndVerifyNthEvent(1, payload);
    await collector1.waitFor({
      reason: ExpiredTokenErrorMessage,
      method: 'Broadcast',
    });
    expect(authTokenInjector).toBeCalledTimes(2);
    expect(authTokenInjector).nthCalledWith(1);
    expect(authTokenInjector).nthCalledWith(2, ExpiredTokenErrorMessage);

    unsub2();
    await c1.detach(ch1);
    await c2.detach(ch2);
    await c1.deactivate();
    await c2.deactivate();
  }, 15000);
});
