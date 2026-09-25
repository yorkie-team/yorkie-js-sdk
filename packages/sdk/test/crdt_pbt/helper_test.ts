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

import { assert, describe, expect, it } from 'vitest';
import { DocStatus, Indexable } from '@yorkie-js/sdk/src/document/document';
import {
  ClientsAndDocuments,
  withClientsAndDocumentsForPBT,
} from '@yorkie-js/sdk/test/crdt_pbt/helper';

describe('PBT helper', function () {
  it('cleans up clients without replacing the property error', async function ({
    task,
  }) {
    const propertyError = new Error('property failed');
    let capturedPairs: ClientsAndDocuments<Indexable> = [];

    await expect(
      withClientsAndDocumentsForPBT<Indexable>(
        2,
        (pairs) => {
          capturedPairs = pairs;
          return Promise.reject(propertyError);
        },
        task.name,
      ),
    ).rejects.toBe(propertyError);

    assert.lengthOf(capturedPairs, 2);
    for (const pair of capturedPairs) {
      assert.isFalse(pair.client.isActive());
      assert.equal(pair.document.getStatus(), DocStatus.Detached);
    }
  });
});
