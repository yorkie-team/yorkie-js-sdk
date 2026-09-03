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

import { describe, it, assert } from 'vitest';
import yorkie from '@yorkie-js/sdk/src/yorkie';
import { Code, YorkieError } from '@yorkie-js/sdk/src/util/error';

/**
 * `attachExpectingAlreadyAttached` mirrors how a caller awaits an attach
 * inside try/catch (as the react hook does) and asserts the duplicate is
 * rejected with the document-scoped `ErrAlreadyAttached` code.
 */
async function attachExpectingAlreadyAttached(
  fn: () => Promise<unknown>,
): Promise<void> {
  try {
    await fn();
    assert.fail('expected duplicate attach to throw ErrAlreadyAttached');
  } catch (err) {
    assert.instanceOf(err, YorkieError);
    assert.equal((err as YorkieError).code, Code.ErrAlreadyAttached);
  }
}
import {
  toDocKey,
  testRPCAddr,
} from '@yorkie-js/sdk/test/integration/integration_helper';

// A duplicate attach of the same key on one client must be rejected locally
// with a document-scoped error, and must NOT deactivate the client. Reaching
// the server produces a misleading `ErrClientNotFound`, which the SDK would
// otherwise escalate to full client deactivation. This reproduces the fast
// navigation race where a component re-attaches a key whose previous attach
// is still in flight (or already resolved as an orphan).
describe.sequential('Duplicate attach guard', function () {
  it('rejects re-attaching an already attached key without killing the client', async function ({
    task,
  }) {
    const client = new yorkie.Client({ rpcAddr: testRPCAddr });
    await client.activate();
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);

    const doc1 = new yorkie.Document<{ n?: number }>(docKey);
    await client.attach(doc1);

    const doc2 = new yorkie.Document<{ n?: number }>(docKey);
    await attachExpectingAlreadyAttached(() => client.attach(doc2));

    assert.isTrue(client.isActive(), 'client must stay active');
    assert.isTrue(client.has(docKey), 'original attachment is intact');

    await client.detach(doc1);
    await client.deactivate();
  });

  it('rejects a concurrent attach of the same key while the first is in flight', async function ({
    task,
  }) {
    const client = new yorkie.Client({ rpcAddr: testRPCAddr });
    await client.activate();
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);

    // Fire the first attach without awaiting; the attachment is not yet in
    // attachmentMap, so the guard must also track the in-flight attach.
    const doc1 = new yorkie.Document<{ n?: number }>(docKey);
    const attach1 = client.attach(doc1);

    const doc2 = new yorkie.Document<{ n?: number }>(docKey);
    await attachExpectingAlreadyAttached(() => client.attach(doc2));

    // The first attach still completes successfully.
    await attach1;
    assert.isTrue(client.isActive(), 'client must stay active');
    assert.isTrue(client.has(docKey), 'first attach succeeded');

    await client.detach(doc1);
    await client.deactivate();
  });
});
