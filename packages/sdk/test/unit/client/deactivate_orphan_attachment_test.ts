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

import { describe, it, expect, afterEach, vi } from 'vitest';
import { Client } from '@yorkie-js/sdk/src/client/client';
import { Channel } from '@yorkie-js/sdk/src/channel/channel';
import { Attachment } from '@yorkie-js/sdk/src/client/attachment';

const rpcAddr = 'http://127.0.0.1:8080';

/**
 * `attachmentOf` reads the attachment a key currently holds.
 */
function attachmentOf(client: Client, key: string): Attachment<any> {
  return (
    client as unknown as { attachmentMap: Map<string, Attachment<any>> }
  ).attachmentMap.get(key)!;
}

/**
 * `deactivateInternal` runs the teardown `deactivate` performs once its RPC
 * has returned, without standing up a server for the RPC itself.
 */
function deactivateInternal(client: Client): void {
  (
    client as unknown as { deactivateInternal: () => void }
  ).deactivateInternal();
}

describe('deactivate teardown', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('tears down an attachment a same-key attach evicted from the map', async () => {
    // The sync loop would reach for a server this unit test does not have;
    // the teardown under test is entirely local.
    vi.spyOn(
      Client.prototype as unknown as { runSyncLoop: () => void },
      'runSyncLoop',
    ).mockImplementation(() => {});

    const client = new Client({ rpcAddr });
    const first = new Channel('same-key');
    await client.attachChannel(first);

    // `attachChannel` takes the key unconditionally, so this drops `first`'s
    // attachment out of `attachmentMap` while it is still live.
    const evicted = attachmentOf(client, 'same-key');
    const cancelEvicted = vi.spyOn(evicted, 'cancelWatchStream');
    const second = new Channel('same-key');
    await client.attachChannel(second);
    const held = attachmentOf(client, 'same-key');
    expect(held).not.toBe(evicted);
    const cancelHeld = vi.spyOn(held, 'cancelWatchStream');

    deactivateInternal(client);

    // Both, not just the one the key still names: an evicted attachment that
    // teardown never reaches keeps its watch stream open and its session lock
    // held after the client is deactivated.
    expect(cancelEvicted).toHaveBeenCalled();
    expect(cancelHeld).toHaveBeenCalled();
  });
});
