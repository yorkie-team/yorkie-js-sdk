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
import { Text } from '@yorkie-js/sdk/src/yorkie';
import { converter } from '@yorkie-js/sdk/src/api/converter';
import { ChangePack } from '@yorkie-js/sdk/src/document/change/change_pack';
import { Checkpoint } from '@yorkie-js/sdk/src/document/change/checkpoint';
import { CRDTRoot } from '@yorkie-js/sdk/src/document/crdt/root';
import { CRDTText } from '@yorkie-js/sdk/src/document/crdt/text';
import { InitialVersionVector } from '@yorkie-js/sdk/src/document/time/version_vector';
import {
  EditOperation,
  RestoreRemovedByCapability,
} from '@yorkie-js/sdk/src/document/operation/edit_operation';

type Root = { t: Text };

// What a server that keeps `removed_by` advertises on every pack.
const capable = [RestoreRemovedByCapability];

/**
 * `send` delivers the pending changes of `from` to `to` through protobuf, so
 * the restore spans' `removed_by` is part of what is tested.
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
function ack(doc: Document<Root>, capabilities = capable): void {
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
      capabilities,
    ),
  );
}

function exchange(a: Document<Root>, b: Document<Root>): void {
  send(a, b);
  send(b, a);
  ack(a);
  ack(b);
}

function replicas(content: string): [Document<Root>, Document<Root>] {
  const a = new Document<Root>('ledger');
  const b = new Document<Root>('ledger');
  a.setActor('000000000000000000000001');
  b.setActor('000000000000000000000002');
  a.update((root) => {
    root.t = new Text();
    root.t.edit(0, 0, content);
  });
  exchange(a, b);
  return [a, b];
}

const text = (doc: Document<Root>) => doc.getRoot().t.toString();

/**
 * `reloadFromSnapshot` replaces the root of `doc` with what its snapshot
 * decodes to, keeping the history (as a replica that loaded a snapshot and
 * then undid a change of its own would).
 */
function reloadFromSnapshot(doc: Document<Root>): void {
  const internal = doc as unknown as {
    root: CRDTRoot;
    clone?: unknown;
  };
  const bytes = converter.snapshotToBytes(internal.root.getObject(), new Map());
  const { root } = converter.bytesToSnapshot(bytes);
  internal.root = new CRDTRoot(root);
  internal.clone = undefined;
}

describe('Text undo with a removal ledger', () => {
  it.each(['undoer first', 'deleter first'])(
    'keeps a concurrent deletion the undo never saw (%s)',
    (order) => {
      const [a, b] = replicas('abcdefgh');
      // b deletes `d` and undoes it; a concurrently deletes `defgh`.
      b.update((root) => root.t.edit(3, 4, ''));
      b.history.undo();
      a.update((root) => root.t.edit(3, 8, ''));

      if (order === 'undoer first') {
        send(b, a);
        send(a, b);
      } else {
        send(a, b);
        send(b, a);
      }

      // `d` was removed by a's deletion too: b's undo cancels only its own.
      expect(text(a)).toBe('abc');
      expect(text(b)).toBe('abc');
    },
  );

  it('does not remove text a concurrent undo revives (yorkie#2237)', () => {
    const [d1, d2] = replicas('efgh');
    d2.update((root) => root.t.edit(1, 2, ''));
    exchange(d1, d2);
    expect(text(d1)).toBe('egh');

    // d1 deletes `g` while d2 undoes its deletion of `f`.
    d1.update((root) => root.t.edit(1, 2, ''));
    d2.history.undo();
    exchange(d1, d2);

    // d1 saw `f` removed, so its deletion leaves the revived `f` alone.
    expect(text(d1)).toBe('efh');
    expect(text(d2)).toBe('efh');
  });

  it('cancels the redo, not the original deletion, on the next undo', () => {
    const [a, b] = replicas('abcdefgh');
    // b: delete `d`, undo, redo, undo. Each undo has to cancel the removal
    // just before it: the second one cancels the redo, which brings `d` back.
    b.update((root) => root.t.edit(3, 4, ''));
    b.history.undo();
    b.history.redo();
    b.history.undo();
    expect(text(b)).toBe('abcdefgh');
    // a concurrently removes `defgh`, which keeps `d` removed everywhere.
    a.update((root) => root.t.edit(3, 8, ''));
    exchange(a, b);

    expect(text(a)).toBe('abc');
    expect(text(b)).toBe('abc');
  });

  it('leaves alone a removed piece the deleter saw removed', () => {
    const [a, b] = replicas('abcdefgh');
    b.update((root) => root.t.edit(3, 4, ''));
    exchange(a, b);
    // a removes `cef` around the removed `d`; b concurrently undoes.
    a.update((root) => root.t.edit(2, 5, ''));
    b.history.undo();
    exchange(a, b);

    expect(text(a)).toBe('abdgh');
    expect(text(b)).toBe('abdgh');
  });

  it('keeps the ledger through a snapshot', () => {
    const [a, b] = replicas('abcdefgh');
    b.update((root) => root.t.edit(3, 4, ''));
    a.update((root) => root.t.edit(3, 8, ''));
    send(a, b);

    // b now holds `d` removed by both; a snapshot must not forget a's part.
    reloadFromSnapshot(b);
    b.history.undo();
    send(b, a);

    expect(text(a)).toBe('abc');
    expect(text(b)).toBe('abc');
  });

  it('does not recreate a purged piece another deletion still holds', () => {
    const [a, b] = replicas('abcdefgh');
    b.update((root) => root.t.edit(3, 4, ''));
    a.update((root) => root.t.edit(3, 8, ''));
    exchange(a, b);

    // Both deletions are known everywhere: b collects `d` before undoing.
    const collected = b.garbageCollect(b.getVersionVector());
    expect(collected).toBeGreaterThan(0);
    const purged = (
      (b.getRootObject().get('t') as CRDTText).getRGATreeSplit() as unknown as {
        getPurgedLedger(): Map<string, unknown>;
      }
    ).getPurgedLedger();
    expect(purged.size).toBeGreaterThan(0);

    b.history.undo();
    exchange(a, b);

    expect(text(a)).toBe('abc');
    expect(text(b)).toBe('abc');
  });

  it('revives a deletion nobody else made, also after a snapshot', () => {
    const [a, b] = replicas('abcdefgh');
    b.update((root) => root.t.edit(3, 4, ''));
    exchange(a, b);
    reloadFromSnapshot(b);
    b.history.undo();
    exchange(a, b);

    expect(text(a)).toBe('abcdefgh');
    expect(text(b)).toBe('abcdefgh');
  });

  it('sends no removedBy until the server advertises the capability', () => {
    const doc = new Document<Root>('ledger');
    doc.update((root) => {
      root.t = new Text();
      root.t.edit(0, 0, 'abcd');
    });
    const undoSpans = () => {
      doc.update((root) => root.t.edit(1, 2, ''));
      doc.history.undo();
      const changes = doc.createChangePack().getChanges();
      const op = changes[changes.length - 1].getOperations()[0];
      expect(op).toBeInstanceOf(EditOperation);
      return (op as EditOperation).getRestoreSpans() ?? [];
    };

    // A server that does not keep `removed_by` would drop it on relay.
    ack(doc, []);
    const before = undoSpans();
    expect(before.length).toBeGreaterThan(0);
    expect(before.every((span) => !span.removedBy)).toBe(true);
    expect(text(doc)).toBe('abcd');

    ack(doc);
    const after = undoSpans();
    expect(after.length).toBeGreaterThan(0);
    expect(after.every((span) => !!span.removedBy)).toBe(true);
    expect(text(doc)).toBe('abcd');
  });
});
