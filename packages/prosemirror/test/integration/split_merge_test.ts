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

import { describe, it, assert, afterEach, beforeEach } from 'vitest';
import yorkie, { Tree, SyncMode } from '@yorkie-js/sdk/src/yorkie';
import { Client } from '@yorkie-js/sdk/src/client/client';
import { Document } from '@yorkie-js/sdk/src/document/document';
import { syncToYorkie } from '../../src/diff';
import { defaultMarkMapping } from '../../src/defaults';
import { doc, p } from '../unit/helpers';

const testRPCAddr = process.env.TEST_RPC_ADDR || 'http://127.0.0.1:8080';

/**
 * Helper to create a tree proxy for syncToYorkie from a Yorkie Tree.
 * Must be called with the tree obtained from the `root` parameter of
 * `doc.update()` callback, not from `doc.getRoot()`.
 */
function treeBridge(tree: Tree) {
  return {
    toJSON: () => tree.toJSON(),
    edit: (
      fromIdx: number,
      toIdx: number,
      content?: Parameters<typeof tree.edit>[2],
      splitLevel?: number,
    ) => {
      tree.edit(fromIdx, toIdx, content, splitLevel ?? 0);
    },
    editBulk: (
      fromIdx: number,
      toIdx: number,
      contents: Parameters<typeof tree.editBulk>[2],
    ) => {
      tree.editBulk(fromIdx, toIdx, contents);
    },
  };
}

/**
 * Block fixtures below use `paragraph`, the name `pmToYorkie` writes for a
 * basic-schema paragraph. `syncToYorkie` compares the transaction's blocks
 * against the tree's own to tell a stale view from an in-step one, so a tree
 * seeded with a different name for the same block reads as diverged and drops
 * to full block replacement instead of a native split or merge.
 */
describe('ProseMirror native split/merge integration', () => {
  let c1: Client;
  let c2: Client;
  let d1: Document<{ t: Tree }>;
  let d2: Document<{ t: Tree }>;

  beforeEach(async () => {
    c1 = new yorkie.Client({ rpcAddr: testRPCAddr });
    c2 = new yorkie.Client({ rpcAddr: testRPCAddr });
    await c1.activate();
    await c2.activate();

    const docKey = `pm-split-merge-${Date.now()}`;
    d1 = new yorkie.Document<{ t: Tree }>(docKey);
    d2 = new yorkie.Document<{ t: Tree }>(docKey);
    await c1.attach(d1, { syncMode: SyncMode.Manual });
    await c2.attach(d2, { syncMode: SyncMode.Manual });
  });

  afterEach(async () => {
    await c1.detach(d1);
    await c2.detach(d2);
    await c1.deactivate();
    await c2.deactivate();
  });

  it('native split produces correct CRDT state', async () => {
    // Setup: <r><paragraph>abcd</paragraph></r>
    d1.update((root) => {
      root.t = new Tree({
        type: 'r',
        children: [
          { type: 'paragraph', children: [{ type: 'text', value: 'abcd' }] },
        ],
      });
    });
    await c1.sync();
    await c2.sync();

    // Simulate ProseMirror split: one paragraph 'abcd' → 'ab' + 'cd'
    const oldDoc = doc(p('abcd'));
    const newDoc = doc(p('ab'), p('cd'));
    d1.update((root) => {
      syncToYorkie(treeBridge(root.t), oldDoc, newDoc, defaultMarkMapping);
    });

    assert.equal(
      d1.getRoot().t.toXML(),
      '<r><paragraph>ab</paragraph><paragraph>cd</paragraph></r>',
    );
  });

  it('native merge produces correct CRDT state', async () => {
    // Setup: <r><paragraph>ab</paragraph><paragraph>cd</paragraph></r>
    d1.update((root) => {
      root.t = new Tree({
        type: 'r',
        children: [
          { type: 'paragraph', children: [{ type: 'text', value: 'ab' }] },
          { type: 'paragraph', children: [{ type: 'text', value: 'cd' }] },
        ],
      });
    });
    await c1.sync();
    await c2.sync();

    // Simulate ProseMirror merge: paragraphs 'ab' + 'cd' → one 'abcd'
    const oldDoc = doc(p('ab'), p('cd'));
    const newDoc = doc(p('abcd'));
    d1.update((root) => {
      syncToYorkie(treeBridge(root.t), oldDoc, newDoc, defaultMarkMapping);
    });

    assert.equal(d1.getRoot().t.toXML(), '<r><paragraph>abcd</paragraph></r>');
  });

  it('concurrent split + text input converges (CRDT baseline)', async () => {
    // First verify that the same operation via direct CRDT calls converges.
    d1.update((root) => {
      root.t = new Tree({
        type: 'r',
        children: [
          { type: 'paragraph', children: [{ type: 'text', value: 'abcd' }] },
        ],
      });
    });
    await c1.sync();
    await c2.sync();

    // c1: split at position 3 (between b and c) via direct CRDT
    d1.update((root) => {
      root.t.edit(3, 3, undefined, 1);
    });

    // c2: type 'X' at position 3 (between b and c)
    d2.update((root) => {
      root.t.edit(3, 3, { type: 'text', value: 'X' });
    });

    await c1.sync();
    await c2.sync();
    await c1.sync();

    assert.equal(d1.getRoot().t.toXML(), d2.getRoot().t.toXML());
  });

  it('concurrent split + text input converges (via syncToYorkie)', async () => {
    d1.update((root) => {
      root.t = new Tree({
        type: 'r',
        children: [
          { type: 'paragraph', children: [{ type: 'text', value: 'abcd' }] },
        ],
      });
    });
    await c1.sync();
    await c2.sync();

    // c1: split via syncToYorkie
    d1.update((root) => {
      syncToYorkie(
        treeBridge(root.t),
        doc(p('abcd')),
        doc(p('ab'), p('cd')),
        defaultMarkMapping,
      );
    });

    // c2: type 'X' at position 3 (between b and c)
    d2.update((root) => {
      root.t.edit(3, 3, { type: 'text', value: 'X' });
    });

    await c1.sync();
    await c2.sync();
    await c1.sync();

    assert.equal(d1.getRoot().t.toXML(), d2.getRoot().t.toXML());
  });

  it('concurrent merge + text input converges', async () => {
    // Setup: <r><paragraph>ab</paragraph><paragraph>cd</paragraph></r>
    d1.update((root) => {
      root.t = new Tree({
        type: 'r',
        children: [
          { type: 'paragraph', children: [{ type: 'text', value: 'ab' }] },
          { type: 'paragraph', children: [{ type: 'text', value: 'cd' }] },
        ],
      });
    });
    await c1.sync();
    await c2.sync();

    // c1: merge paragraphs 'ab' + 'cd' → 'abcd' via syncToYorkie
    d1.update((root) => {
      const oldDoc = doc(p('ab'), p('cd'));
      const newDoc = doc(p('abcd'));
      syncToYorkie(treeBridge(root.t), oldDoc, newDoc, defaultMarkMapping);
    });

    // c2: type 'X' at end of the first paragraph (position 3)
    d2.update((root) => {
      root.t.edit(3, 3, { type: 'text', value: 'X' });
    });

    await c1.sync();
    await c2.sync();
    await c1.sync();

    assert.equal(d1.getRoot().t.toXML(), d2.getRoot().t.toXML());
  });

  it('concurrent split + split converges', async () => {
    // Setup: <r><paragraph>abcdef</paragraph></r>
    d1.update((root) => {
      root.t = new Tree({
        type: 'r',
        children: [
          { type: 'paragraph', children: [{ type: 'text', value: 'abcdef' }] },
        ],
      });
    });
    await c1.sync();
    await c2.sync();

    // c1: split at ab|cdef → paragraphs 'ab' + 'cdef'
    d1.update((root) => {
      const oldDoc = doc(p('abcdef'));
      const newDoc = doc(p('ab'), p('cdef'));
      syncToYorkie(treeBridge(root.t), oldDoc, newDoc, defaultMarkMapping);
    });

    // c2: split at abcd|ef → paragraphs 'abcd' + 'ef'
    d2.update((root) => {
      root.t.edit(5, 5, undefined, 1);
    });

    await c1.sync();
    await c2.sync();
    await c1.sync();

    assert.equal(d1.getRoot().t.toXML(), d2.getRoot().t.toXML());
  });

  // Fixed by PR #1206: https://github.com/yorkie-team/yorkie/issues/1726
  it('concurrent split + merge converges (CRDT baseline)', async () => {
    d1.update((root) => {
      root.t = new Tree({
        type: 'r',
        children: [
          { type: 'paragraph', children: [{ type: 'text', value: 'ab' }] },
          { type: 'paragraph', children: [{ type: 'text', value: 'cd' }] },
        ],
      });
    });
    await c1.sync();
    await c2.sync();

    // c1: split first paragraph
    d1.update((root) => {
      root.t.edit(2, 2, undefined, 1);
    });

    // c2: merge via direct CRDT boundary delete (3,5)
    d2.update((root) => {
      root.t.edit(3, 5);
    });

    await c1.sync();
    await c2.sync();
    await c1.sync();

    assert.equal(d1.getRoot().t.toXML(), d2.getRoot().t.toXML());
  });

  it('concurrent split + merge converges (via syncToYorkie)', async () => {
    // Setup: <r><paragraph>ab</paragraph><paragraph>cd</paragraph></r>
    d1.update((root) => {
      root.t = new Tree({
        type: 'r',
        children: [
          { type: 'paragraph', children: [{ type: 'text', value: 'ab' }] },
          { type: 'paragraph', children: [{ type: 'text', value: 'cd' }] },
        ],
      });
    });
    await c1.sync();
    await c2.sync();

    // c1: split first paragraph → paragraphs 'a' + 'b' + 'cd'
    d1.update((root) => {
      root.t.edit(2, 2, undefined, 1);
    });

    // c2: merge two paragraphs → one 'abcd' via syncToYorkie
    d2.update((root) => {
      const oldDoc = doc(p('ab'), p('cd'));
      const newDoc = doc(p('abcd'));
      syncToYorkie(treeBridge(root.t), oldDoc, newDoc, defaultMarkMapping);
    });

    await c1.sync();
    await c2.sync();
    await c1.sync();

    assert.equal(d1.getRoot().t.toXML(), d2.getRoot().t.toXML());
  });
});
