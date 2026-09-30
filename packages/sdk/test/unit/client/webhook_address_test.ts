/*
 * Copyright 2026 The Yorkie Authors. All rights reserved.
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

import { assert, describe, it } from 'vitest';
import { once } from 'node:events';
import { AddressInfo } from 'node:net';
import express from 'express';
import { webhookAddress } from '@yorkie-js/sdk/test/integration/integration_helper';

describe('Auth webhook fixture addresses', () => {
  it('reaches a native wildcard listener through the loopback URL', async () => {
    const app = express();
    let calls = 0;
    app.post('/auth-webhook', express.json(), (req, res) => {
      calls++;
      assert.deepEqual(req.body, { token: 'local-test-token' });
      res.json({ allowed: true });
    });
    // Match the integration fixture: an omitted bind host can return `::`.
    const server = app.listen(0);
    try {
      await once(server, 'listening');
      const { port } = server.address() as AddressInfo;
      const url = new URL(
        `http://${webhookAddress(false)}:${port}/auth-webhook`,
      );
      assert.equal(url.hostname, '127.0.0.1');
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'local-test-token' }),
      });
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { allowed: true });
      assert.equal(calls, 1, 'the registered callback receives the request');
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    }
  });

  it('preserves the Docker bridge URL without claiming runtime connectivity', () => {
    const url = new URL(`http://${webhookAddress(true)}:3004/auth-webhook`);
    assert.equal(url.hostname, 'host.docker.internal');
    assert.equal(url.port, '3004');
    assert.equal(url.pathname, '/auth-webhook');
  });
});
