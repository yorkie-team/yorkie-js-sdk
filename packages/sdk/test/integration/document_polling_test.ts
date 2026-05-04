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

import { describe, it, assert } from 'vitest';
import yorkie, { SyncMode } from '@yorkie-js/sdk/src/yorkie';
import {
  toDocKey,
  testRPCAddr,
} from '@yorkie-js/sdk/test/integration/integration_helper';

describe('Document Polling', function () {
  it('Polling document receives remote changes within poll interval', async function ({
    task,
  }) {
    const docKey = `${toDocKey(task.name)}-${new Date().getTime()}`;

    const c1 = new yorkie.Client({ rpcAddr: testRPCAddr });
    const c2 = new yorkie.Client({ rpcAddr: testRPCAddr });
    await c1.activate();
    await c2.activate();

    const d1 = new yorkie.Document<{ k?: string }>(docKey);
    const d2 = new yorkie.Document<{ k?: string }>(docKey);

    // c1 attaches in Polling mode with 200ms interval.
    await c1.attach(d1, {
      syncMode: SyncMode.Polling,
      documentPollInterval: 200,
    });
    await c2.attach(d2);

    // c2 makes a change.
    d2.update((root) => {
      root.k = 'v';
    });
    await c2.sync();

    // Wait for at least 2 polling ticks (~400ms).
    await new Promise((r) => setTimeout(r, 600));

    assert.equal(d1.getRoot().k, 'v');

    await c1.detach(d1);
    await c2.detach(d2);
    await c1.deactivate();
    await c2.deactivate();
  });
});
