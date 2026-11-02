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

import { describe, it, expect } from 'vitest';
import { Document, Indexable } from '@yorkie-js/sdk/src/document/document';
import { converter } from '@yorkie-js/sdk/src/api/converter';
import { ChangePack } from '@yorkie-js/sdk/src/document/change/change_pack';
import { Checkpoint } from '@yorkie-js/sdk/src/document/change/checkpoint';
import { CRDTRoot } from '@yorkie-js/sdk/src/document/crdt/root';
import { CRDTZeroTree } from '@yorkie-js/sdk/src/document/crdt/zero_tree';
import { InitialVersionVector } from '@yorkie-js/sdk/src/document/time/version_vector';
import { ZeroTree } from '@yorkie-js/sdk/src/document/json/zero_tree';
import type { ZeroNodeJSON } from '@yorkie-js/sdk/src/document/crdt/zero_tree_view';

type Root = { zt: ZeroTree };

const capable: Array<string> = [];

/**
 * `send` delivers the pending changes of `from` to `to` through protobuf.
 */
function send(from: Document<Root>, to: Document<Root>): void {
  const pack = converter.fromChangePack<Indexable>(
    converter.toChangePack(from.createChangePack()),
  );
  to.applyChangePack(
    ChangePack.create(
      pack.getDocumentKey(),
      Checkpoint.of(0n, 0),
      false,
      pack.getChanges() as never,
      InitialVersionVector,
      undefined,
      0n,
      capable,
    ),
  );
}

/**
 * `ack` drops the changes `doc` has already sent from its local queue.
 */
function ack(doc: Document<Root>): void {
  const changes = doc.createChangePack().getChanges();
  const lastSeq = changes.length
    ? changes[changes.length - 1].getID().getClientSeq()
    : 0;
  doc.applyChangePack(
    ChangePack.create(
      doc.getKey(),
      Checkpoint.of(0n, lastSeq),
      false,
      [],
      InitialVersionVector,
      undefined,
      0n,
      capable,
    ),
  );
}

function exchange(a: Document<Root>, b: Document<Root>): void {
  send(a, b);
  send(b, a);
  ack(a);
  ack(b);
}

const paragraph = (text: string): ZeroNodeJSON => ({
  type: 'paragraph',
  children: [{ type: 'inline-text', data: text }],
});

function replicas(
  ...children: Array<ZeroNodeJSON>
): [Document<Root>, Document<Root>] {
  const a = new Document<Root>('zero-tree');
  const b = new Document<Root>('zero-tree');
  a.setActor('000000000000000000000001');
  b.setActor('000000000000000000000002');
  a.update((root) => {
    root.zt = new ZeroTree({ type: 'content', children } as never);
  });
  exchange(a, b);
  return [a, b];
}

const model = (doc: Document<Root>) => doc.getRoot().zt.toZeroContent();

/**
 * `reload` reads the document back from its snapshot.
 */
function reload(doc: Document<Root>): CRDTRoot {
  const { root } = converter.bytesToSnapshot(
    converter.snapshotToBytes(doc.getRootObject(), new Map()),
  );
  return new CRDTRoot(root);
}

/**
 * `ghosts` counts the ghost nodes of the tree.
 */
function ghosts(doc: Document<Root>): number {
  const tree = doc.getRootObject().get('zt') as unknown as CRDTZeroTree;
  let n = 0;
  for (const node of tree.getRGA()) {
    if (node.isRemoved() && node.getValue().ghost) {
      n++;
    }
  }
  return n;
}

/**
 * `backspace` removes `n` characters before `at` in the first paragraph, one
 * change each.
 */
function backspace(doc: Document<Root>, at: number, n: number): void {
  for (let i = 0; i < n; i++) {
    doc.update((root) =>
      root.zt.applyZeroOperations([['delete', [0, 0, at - i - 1], 1]]),
    );
  }
}

describe('ZeroTree ghost GC', () => {
  it('does not collect a ghost again after a reload', () => {
    const [a, b] = replicas(paragraph('abcdefgh'));
    backspace(a, 8, 6);
    exchange(a, b);
    expect(a.garbageCollect(a.getVersionVector())).toBe(6);

    const reloaded = reload(a);
    expect(reloaded.getGarbageLen()).toBe(0);
    expect(reloaded.getDocSize()).toEqual(a.getDocSize());
    expect(reloaded.garbageCollect(a.getVersionVector())).toBe(0);
    expect(a.getDocSize().gc).toEqual({ data: 0, meta: 0 });
  });

  it('counts what a ghost keeps in live', () => {
    const [a, b] = replicas(paragraph('abcdefgh'));
    const live = { ...a.getDocSize().live };
    a.update((root) => root.zt.applyZeroOperations([['delete', [0, 0, 2], 4]]));
    exchange(a, b);
    a.garbageCollect(a.getVersionVector());

    // the characters go, the node and its ticket stay
    const size = a.getDocSize();
    expect(size.gc).toEqual({ data: 0, meta: 0 });
    expect(size.live.data).toBe(live.data - 8);
    expect(size.live.meta).toBeGreaterThan(live.meta);
    expect(reload(a).getDocSize()).toEqual(size);
  });

  it('joins the ghosts one actor left in one insertion', () => {
    const [a, b] = replicas(paragraph('abcdefgh'));
    backspace(a, 8, 6);
    exchange(a, b);
    a.garbageCollect(a.getVersionVector());
    expect(ghosts(a)).toBe(1);

    // each undo brings back its own character where b, which never
    // collected, has it
    for (let i = 0; i < 6; i++) {
      a.history.undo();
      exchange(a, b);
      expect(model(a)).toEqual(model(b));
    }
    expect(model(a)).toEqual({
      type: 'content',
      children: [paragraph('abcdefgh')],
    });
    expect(reload(a).getDocSize()).toEqual(a.getDocSize());
  });

  it('keeps apart the ghosts of two actors', () => {
    const [a, b] = replicas(paragraph('abcdefgh'));
    backspace(a, 4, 2);
    backspace(b, 6, 2);
    exchange(a, b);
    a.garbageCollect(a.getVersionVector());
    b.garbageCollect(b.getVersionVector());
    expect(ghosts(a)).toBe(2);
    expect(ghosts(b)).toBe(2);

    b.history.undo();
    b.history.undo();
    exchange(a, b);
    expect(model(a)).toEqual({
      type: 'content',
      children: [paragraph('abefgh')],
    });
    expect(model(b)).toEqual(model(a));
  });

  it('counts a style on a removed marker in gc', () => {
    const [a, b] = replicas(paragraph('ab'), paragraph('cd'));
    a.update((root) => root.zt.applyZeroOperations([['delete', [1], 1]]));
    b.update((root) =>
      root.zt.applyZeroOperations([
        ['update', [1], { style: { textAlign: 'center' } }],
      ]),
    );
    exchange(a, b);
    for (const d of [a, b]) {
      expect(reload(d).getDocSize()).toEqual(d.getDocSize());
      d.garbageCollect(d.getVersionVector());
      expect(d.getDocSize().gc).toEqual({ data: 0, meta: 0 });
      expect(reload(d).getDocSize()).toEqual(d.getDocSize());
    }
  });
});
