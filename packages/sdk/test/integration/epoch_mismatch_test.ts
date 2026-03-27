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

import { describe, it, beforeAll, expect } from 'vitest';

import yorkie, { SyncMode, DocEventType } from '@yorkie-js/sdk/src/yorkie';
import { EventCollector } from '@yorkie-js/sdk/test/helper/helper';
import {
  toDocKey,
  testRPCAddr,
  testAPIID,
  testAPIPW,
} from '@yorkie-js/sdk/test/integration/integration_helper';
import axios from 'axios';

let adminToken: string;

beforeAll(async () => {
  const loginResponse = await axios.post(
    `${testRPCAddr}/yorkie.v1.AdminService/LogIn`,
    { username: testAPIID, password: testAPIPW },
  );
  adminToken = loginResponse.data.token;
});

// NOTE: This test requires a Yorkie server with epoch support (yorkie-team/yorkie#1714).
// It will fail against older server images that lack CompactDocumentByAdmin epoch handling.
describe('Epoch Mismatch', () => {
  it('should emit epoch-mismatch event after force compaction', async () => {
    const client = new yorkie.Client({ rpcAddr: testRPCAddr });
    await client.activate();

    const docKey = toDocKey(`epoch-mismatch-${Date.now()}`);
    const doc = new yorkie.Document<{ text: string }>(docKey);
    await client.attach(doc, { syncMode: SyncMode.Manual });
    doc.update((root) => {
      root.text = 'hello';
    });
    await client.sync(doc);

    // Force compact via admin API
    await axios.post(
      `${testRPCAddr}/yorkie.v1.AdminService/CompactDocumentByAdmin`,
      { document_key: docKey, force: true },
      { headers: { Authorization: `Bearer ${adminToken}` } },
    );

    // Subscribe to epoch-mismatch event before syncing
    const collector = new EventCollector();
    doc.subscribe('epoch-mismatch', (event) => {
      expect(event.type).toBe(DocEventType.EpochMismatch);
      expect(event.value.method).toBe('PushPull');
      collector.add(event.type);
    });

    // Sync should fail with epoch mismatch
    try {
      await client.sync(doc);
    } catch {
      // Expected: sync fails
    }

    await collector.waitAndVerifyNthEvent(1, DocEventType.EpochMismatch);

    // Recovery: detach and reattach
    await client.detach(doc);

    const doc2 = new yorkie.Document<{ text: string }>(docKey);
    await client.attach(doc2, { syncMode: SyncMode.Manual });
    expect(doc2.toSortedJSON()).toBe('{"text":"hello"}');

    // Further edits work normally
    doc2.update((root) => {
      root.text = 'hello world';
    });
    await client.sync(doc2);
    expect(doc2.toSortedJSON()).toBe('{"text":"hello world"}');

    await client.detach(doc2);
    await client.deactivate();
  });
});
