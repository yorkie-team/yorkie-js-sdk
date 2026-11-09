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

import { describe, it, expect, vi } from 'vitest';
import { Attachment, WatchStream } from '@yorkie-js/sdk/src/client/attachment';
import { Document } from '@yorkie-js/sdk/src/document/document';

describe('Watch attachment ownership', () => {
  it('keeps a successor when cancelled initialization settles late', async () => {
    const attachment = new Attachment(() => 1, new Document('watch-owner'));
    const stream = { async *[Symbol.asyncIterator]() {} };
    let finish!: (value: [WatchStream, AbortController]) => void;
    let oldDisconnect!: () => void;
    let oldController!: AbortController;
    const opening = attachment.runWatchLoop((disconnect, ac) => {
      oldDisconnect = disconnect;
      oldController = ac;
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    const duplicate = vi.fn();
    await attachment.runWatchLoop(duplicate);
    expect(duplicate).not.toHaveBeenCalled();
    attachment.cancelWatchStream();
    expect(oldController.signal.aborted).toBe(true);
    attachment.resetCancelled();
    let successor!: AbortController;
    await attachment.runWatchLoop(async (_disconnect, ac) => {
      successor = ac;
      return [stream, ac];
    });
    oldDisconnect();
    finish([stream, oldController]);
    await opening;
    expect(successor.signal.aborted).toBe(false);
    attachment.cancelWatchStream();
    expect(successor.signal.aborted).toBe(true);
    await attachment.runWatchLoop(duplicate);
    expect(duplicate).not.toHaveBeenCalled();
  });
});
