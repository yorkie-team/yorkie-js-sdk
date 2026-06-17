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

// @vitest-environment jsdom

import { describe, it, expect, vi, afterEach } from 'vitest';
import yorkie, { ClientOptions } from '@yorkie-js/sdk/src/yorkie';

function makeClient(opts: Partial<ClientOptions> = {}) {
  const client = new yorkie.Client({ rpcAddr: 'http://localhost', ...opts });
  (client as any).rpcClient = {
    activateClient: vi.fn().mockResolvedValue({ clientId: 'test-id' }),
    deactivateClient: vi.fn().mockResolvedValue({}),
  };
  // Prevent the sync loop from issuing real RPCs in this unit test.
  (client as any).runSyncLoop = vi.fn();
  return client;
}

function countBeforeUnloadListeners(spy: {
  mock: { calls: Array<Array<unknown>> };
}): number {
  return spy.mock.calls.filter(([event]) => event === 'beforeunload').length;
}

describe('Client beforeunload registration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers a beforeunload listener by default', async () => {
    const spy = vi.spyOn(window, 'addEventListener');
    const client = makeClient();
    await client.activate();
    expect(countBeforeUnloadListeners(spy)).toBe(1);
  });

  it('skips the beforeunload listener when deactivateOnUnload is false', async () => {
    const spy = vi.spyOn(window, 'addEventListener');
    const client = makeClient({ deactivateOnUnload: false });
    await client.activate();
    expect(countBeforeUnloadListeners(spy)).toBe(0);
  });

  it('leaves the client active across a beforeunload event when deactivateOnUnload is false', async () => {
    const client = makeClient({ deactivateOnUnload: false });
    await client.activate();
    expect(client.isActive()).toBe(true);

    window.dispatchEvent(new Event('beforeunload'));

    expect(client.isActive()).toBe(true);
  });
});
