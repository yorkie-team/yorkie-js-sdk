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
    // Setup: <r><p>abcd</p></r>
    d1.update((root) => {
      root.t = new Tree({
        type: 'r',
        children: [{ type: 'p', children: [{ type: 'text', value: 'abcd' }] }],
      });
    });
    await c1.sync();
    await c2.sync();

    // Simulate ProseMirror split: <p>abcd</p> → <p>ab</p><p>cd</p>
    const oldDoc = doc(p('abcd'));
    const newDoc = doc(p('ab'), p('cd'));
    d1.update((root) => {
      syncToYorkie(treeBridge(root.t), oldDoc, newDoc, defaultMarkMapping);
    });

    assert.equal(d1.getRoot().t.toXML(), '<r><p>ab</p><p>cd</p></r>');
  });

  it('native merge produces correct CRDT state', async () => {
    // Setup: <r><p>ab</p><p>cd</p></r>
    d1.update((root) => {
      root.t = new Tree({
        type: 'r',
        children: [
          { type: 'p', children: [{ type: 'text', value: 'ab' }] },
          { type: 'p', children: [{ type: 'text', value: 'cd' }] },
        ],
      });
    });
    await c1.sync();
    await c2.sync();

    // Simulate ProseMirror merge: <p>ab</p><p>cd</p> → <p>abcd</p>
    const oldDoc = doc(p('ab'), p('cd'));
    const newDoc = doc(p('abcd'));
    d1.update((root) => {
      syncToYorkie(treeBridge(root.t), oldDoc, newDoc, defaultMarkMapping);
    });

    assert.equal(d1.getRoot().t.toXML(), '<r><p>abcd</p></r>');
  });

  it('concurrent split + text input converges (CRDT baseline)', async () => {
    // First verify that the same operation via direct CRDT calls converges.
    d1.update((root) => {
      root.t = new Tree({
        type: 'r',
        children: [{ type: 'p', children: [{ type: 'text', value: 'abcd' }] }],
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
        children: [{ type: 'p', children: [{ type: 'text', value: 'abcd' }] }],
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
    // Setup: <r><p>ab</p><p>cd</p></r>
    d1.update((root) => {
      root.t = new Tree({
        type: 'r',
        children: [
          { type: 'p', children: [{ type: 'text', value: 'ab' }] },
          { type: 'p', children: [{ type: 'text', value: 'cd' }] },
        ],
      });
    });
    await c1.sync();
    await c2.sync();

    // c1: merge <p>ab</p><p>cd</p> → <p>abcd</p> via syncToYorkie
    d1.update((root) => {
      const oldDoc = doc(p('ab'), p('cd'));
      const newDoc = doc(p('abcd'));
      syncToYorkie(treeBridge(root.t), oldDoc, newDoc, defaultMarkMapping);
    });

    // c2: type 'X' at end of first paragraph (position 3) → <p>abX</p><p>cd</p>
    d2.update((root) => {
      root.t.edit(3, 3, { type: 'text', value: 'X' });
    });

    await c1.sync();
    await c2.sync();
    await c1.sync();

    assert.equal(d1.getRoot().t.toXML(), d2.getRoot().t.toXML());
  });

  it('concurrent split + split converges', async () => {
    // Setup: <r><p>abcdef</p></r>
    d1.update((root) => {
      root.t = new Tree({
        type: 'r',
        children: [
          { type: 'p', children: [{ type: 'text', value: 'abcdef' }] },
        ],
      });
    });
    await c1.sync();
    await c2.sync();

    // c1: split at ab|cdef → <p>ab</p><p>cdef</p>
    d1.update((root) => {
      const oldDoc = doc(p('abcdef'));
      const newDoc = doc(p('ab'), p('cdef'));
      syncToYorkie(treeBridge(root.t), oldDoc, newDoc, defaultMarkMapping);
    });

    // c2: split at abcd|ef → <p>abcd</p><p>ef</p>
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
          { type: 'p', children: [{ type: 'text', value: 'ab' }] },
          { type: 'p', children: [{ type: 'text', value: 'cd' }] },
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
    // Setup: <r><p>ab</p><p>cd</p></r>
    d1.update((root) => {
      root.t = new Tree({
        type: 'r',
        children: [
          { type: 'p', children: [{ type: 'text', value: 'ab' }] },
          { type: 'p', children: [{ type: 'text', value: 'cd' }] },
        ],
      });
    });
    await c1.sync();
    await c2.sync();

    // c1: split first paragraph → <p>a</p><p>b</p><p>cd</p>
    d1.update((root) => {
      root.t.edit(2, 2, undefined, 1);
    });

    // c2: merge two paragraphs → <p>abcd</p> via syncToYorkie
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
