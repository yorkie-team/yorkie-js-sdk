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
import { Client } from '@yorkie-js/sdk/src/client/client';
import { MemoryDocStore } from '@yorkie-js/sdk/src/client/doc-store';

const rpcAddr = 'http://127.0.0.1:8080';

/**
 * `deactivateOnUnloadOf` reads the resolved private option for assertions.
 */
function deactivateOnUnloadOf(client: Client): boolean {
  return (client as unknown as { deactivateOnUnload: boolean })
    .deactivateOnUnload;
}

describe('Client options', () => {
  it('defaults deactivateOnUnload to true without a store', () => {
    const client = new Client({ rpcAddr });
    assert.isTrue(deactivateOnUnloadOf(client));
  });

  it('defaults deactivateOnUnload to false when a store is configured', () => {
    const client = new Client({ rpcAddr, store: new MemoryDocStore() });
    assert.isFalse(deactivateOnUnloadOf(client));
  });

  it('respects an explicit deactivateOnUnload over the store default', () => {
    const client = new Client({
      rpcAddr,
      store: new MemoryDocStore(),
      deactivateOnUnload: true,
    });
    assert.isTrue(deactivateOnUnloadOf(client));
  });
});
