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
import type { Node as PMNode } from 'prosemirror-model';
import yorkie, {
  Tree,
  SyncMode,
  type ElementNode,
} from '@yorkie-js/sdk/src/yorkie';
import { Client } from '@yorkie-js/sdk/src/client/client';
import { Document } from '@yorkie-js/sdk/src/document/document';
import { syncToYorkie } from '../../src/diff';
import { pmToYorkie } from '../../src/convert';
import { collectText } from '../../src/position';
import { defaultMarkMapping } from '../../src/defaults';
import type { YorkieTreeJSON } from '../../src/types';
import { doc, p, strong, em } from '../unit/helpers';

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

/** The text of each top-level block, ignoring marks. */
function texts(d: Document<{ t: Tree }>): Array<string> {
  const json = JSON.parse(d.getRoot().t.toJSON()) as YorkieTreeJSON;
  return (json.children || []).map(collectText);
}

describe('ProseMirror concurrent mark change integration', () => {
  let c1: Client;
  let c2: Client;
  let d1: Document<{ t: Tree }>;
  let d2: Document<{ t: Tree }>;

  beforeEach(async () => {
    c1 = new yorkie.Client({ rpcAddr: testRPCAddr });
    c2 = new yorkie.Client({ rpcAddr: testRPCAddr });
    await c1.activate();
    await c2.activate();

    const docKey = `pm-mark-concurrency-${Date.now()}`;
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

  /**
   * d1 goes `base` -> `marked` while d2 goes `base` -> `typed`, with neither
   * seeing the other until both have pushed.
   */
  async function concurrently(base: PMNode, marked: PMNode, typed: PMNode) {
    d1.update((root) => {
      root.t = new Tree(
        pmToYorkie(base, defaultMarkMapping) as unknown as ElementNode,
      );
    });
    await c1.sync();
    await c2.sync();

    d1.update((root) => {
      syncToYorkie(treeBridge(root.t), base, marked, defaultMarkMapping);
    });
    d2.update((root) => {
      syncToYorkie(treeBridge(root.t), base, typed, defaultMarkMapping);
    });

    await c1.sync();
    await c2.sync();
    await c1.sync();
  }

  it('keeps text typed outside the run another client re-marks', async () => {
    // The paragraph already has element children, so the mark change narrows
    // to the run it touched and the `def` text node is never deleted.
    await concurrently(
      doc(p(strong('abc'), 'def')),
      doc(p(em('abc'), 'def')),
      doc(p(strong('abc'), 'defQ')),
    );

    assert.equal(d1.getRoot().t.toXML(), d2.getRoot().t.toXML());
    assert.deepEqual(texts(d1), ['abcdefQ']);
  });

  it('keeps text typed in another block', async () => {
    await concurrently(
      doc(p('abcdef'), p('second')),
      doc(p(strong('abcdef')), p('second')),
      doc(p('abcdef'), p('Qsecond')),
    );

    assert.equal(d1.getRoot().t.toXML(), d2.getRoot().t.toXML());
    assert.deepEqual(texts(d1), ['abcdef', 'Qsecond']);
  });

  it('converges when a mark is added to a block another client types into', async () => {
    // Known limitation of storing marks as wrapper elements: marking a run of
    // an *unmarked* paragraph turns the paragraph's single text child into
    // element children, and `IndexTree` indexes a node by whether every child
    // is text, so the text node cannot survive alongside the new wrappers.
    // The whole child list is rewritten and the concurrent `Q` goes with it.
    // Only moving marks onto element attributes (#1438, direction 2) fixes
    // this; until then, assert what does hold — the replicas converge.
    await concurrently(
      doc(p('abcdef')),
      doc(p('a', strong('bc'), 'def')),
      doc(p('abcdefQ')),
    );

    assert.equal(d1.getRoot().t.toXML(), d2.getRoot().t.toXML());
    assert.deepEqual(texts(d1), ['abcdef']);
  });
});
