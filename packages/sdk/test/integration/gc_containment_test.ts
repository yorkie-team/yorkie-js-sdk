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
import yorkie, { SyncMode } from '@yorkie-js/sdk/src/yorkie';
import { Document } from '@yorkie-js/sdk/src/document/document';
import { YorkieError } from '@yorkie-js/sdk/src/util/error';
import {
  testRPCAddr,
  toDocKey,
} from '@yorkie-js/sdk/test/integration/integration_helper';

type TestDoc = {
  items: Array<{ id: string; box: { w: number; h: number }; body: any }>;
};

/**
 * `undoTolerantly` runs an undo that may have nothing left to apply. A reverse
 * operation names the element it was recorded against, and a peer may have
 * removed it in the meantime; that is reported as a `YorkieError` and leaves
 * the document untouched. What must not happen is the document being left
 * unable to sync, which is what the rest of this test checks.
 */
function undoTolerantly(run: () => void): void {
  try {
    run();
  } catch (e) {
    assert.instanceOf(e, YorkieError, `undo failed with ${e}`);
  }
}

describe('Garbage collection containment', function () {
  it('keeps syncing while two peers reorder, edit and undo one element', async function ({
    task,
  }) {
    const docKey = toDocKey(`${task.name}-${new Date().getTime()}`);
    const d1 = new yorkie.Document<TestDoc>(docKey);
    const d2 = new yorkie.Document<TestDoc>(docKey);

    const c1 = new yorkie.Client({ rpcAddr: testRPCAddr });
    const c2 = new yorkie.Client({ rpcAddr: testRPCAddr });
    await c1.activate();
    await c2.activate();
    await c1.attach(d1, { syncMode: SyncMode.Manual });
    await c2.attach(d2, { syncMode: SyncMode.Manual });

    try {
      // Every sync applies a change pack, which is where a document that
      // cannot resolve a member of its collection worklist dies: it throws
      // inside `applyChangePack` and goes on throwing on every later sync,
      // so the client never syncs that document again (#1340).
      const sync = async () => {
        for (let i = 0; i < 4; i++) {
          await c1.sync(d1);
          await c2.sync(d2);
        }
      };

      d1.update((r) => {
        r.items = [
          { id: 'x', box: { w: 10, h: 10 }, body: { text: '' } },
          { id: 'y', box: { w: 10, h: 10 }, body: { text: '' } },
        ];
      });
      await sync();

      const indexOf = (doc: Document<TestDoc>, id: string) =>
        doc.getRoot().items.findIndex((item) => item.id === id);

      // One element removed and re-inserted over and over, both peers
      // rewriting its nested objects and walking their undo stacks.
      for (let round = 0; round < 8; round++) {
        d1.update((r) => {
          const i = indexOf(d1, 'x');
          if (i < 0) return;
          const plain = JSON.parse(JSON.stringify(r.items[i]));
          r.items.splice(i, 1);
          r.items.splice(0, 0, plain);
        }, 'reorder');

        d2.update((r) => {
          const i = indexOf(d2, 'x');
          if (i < 0) return;
          r.items[i].body = { text: 'o'.repeat(round + 1) };
          r.items[i].box = { w: 10, h: 20 + round };
        }, 'edit');

        await sync();

        if (round % 3 === 0) {
          undoTolerantly(() => d1.history.undo());
        }
        if (round % 4 === 0) {
          d2.update((r) => {
            const i = indexOf(d2, 'y');
            if (i >= 0) r.items.splice(i, 1);
          }, 'remove y');
          undoTolerantly(() => d2.history.undo());
        }
        if (round % 5 === 0) {
          undoTolerantly(() => d1.history.redo());
          undoTolerantly(() => d2.history.redo());
        }

        // No sync in between, so both peers stack a reverse operation on top
        // of state the other has not seen.
        d1.update((r) => {
          const i = indexOf(d1, 'x');
          if (i >= 0) r.items[i].body = { text: `d1-${round}` };
        }, 'edit body');
        d2.update((r) => {
          const i = indexOf(d2, 'x');
          if (i >= 0) {
            const plain = JSON.parse(JSON.stringify(r.items[i]));
            r.items.splice(i, 1);
            r.items.splice(0, 0, plain);
          }
        }, 'reorder');
        undoTolerantly(() => d1.history.undo());
        undoTolerantly(() => d2.history.undo());

        await sync();
      }

      // A poisoned client stops applying change packs, so an ordinary edit
      // followed by a sync is what tells a healthy one from a dead one.
      d1.update((r) => {
        const i = indexOf(d1, 'x');
        if (i >= 0) r.items[i].box = { w: 1, h: 1 };
      }, 'final edit');
      await sync();

      assert.deepEqual(
        JSON.parse(d1.toJSON()),
        JSON.parse(d2.toJSON()),
        'the two documents disagree after the final edit',
      );
    } finally {
      await c1.deactivate();
      await c2.deactivate();
    }
  }, 30000);
});
