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

// CRDT-level tests of the Text removal ledger, ported from Go's
// rga_tree_split_test.go, text_restore_test.go and edit_reconcile_test.go
// (yorkie-team/yorkie#2310).

import { describe, it, expect } from 'vitest';
import { Document } from '@yorkie-js/sdk/src/document/document';
import { Text } from '@yorkie-js/sdk/src/yorkie';
import { CRDTRoot } from '@yorkie-js/sdk/src/document/crdt/root';
import { CRDTText, CRDTTextValue } from '@yorkie-js/sdk/src/document/crdt/text';
import {
  RGATreeSplit,
  RGATreeSplitNode,
  RGATreeSplitNodeID,
  RGATreeSplitPos,
} from '@yorkie-js/sdk/src/document/crdt/rga_tree_split';
import {
  InitialTimeTicket,
  TimeTicket,
} from '@yorkie-js/sdk/src/document/time/ticket';
import { VersionVector } from '@yorkie-js/sdk/src/document/time/version_vector';
import { EditOperation } from '@yorkie-js/sdk/src/document/operation/edit_operation';
import { OpSource } from '@yorkie-js/sdk/src/document/operation/operation';

const actorA = '000000000000000000000001';
const actorB = '000000000000000000000002';
const a = (lamport: number) => TimeTicket.of(BigInt(lamport), 0, actorA);
const b = (lamport: number) => TimeTicket.of(BigInt(lamport), 0, actorB);

const vector = (entries: Array<[string, number]>) =>
  new VersionVector(new Map(entries.map(([k, v]) => [k, BigInt(v)])));

const keys = (tickets: Array<TimeTicket>) => tickets.map((t) => t.toIDString());

/**
 * `node` returns a text node created by actor A at lamport 1, removed at
 * `removedAt`.
 */
function node(removedAt?: TimeTicket): RGATreeSplitNode<CRDTTextValue> {
  const n = RGATreeSplitNode.create(
    RGATreeSplitNodeID.of(a(1), 0),
    CRDTTextValue.create('x'),
  );
  n.setRemovedAt(removedAt);
  return n;
}

/**
 * `seededText` builds "0123456789" as a single insertion created at
 * `seed`.
 */
function seededText(seed: TimeTicket): CRDTText {
  const text = CRDTText.create(RGATreeSplit.create(), InitialTimeTicket);
  text.edit(text.createRange(0, 0), '0123456789', seed);
  expect(text.toString()).toBe('0123456789');
  return text;
}

/**
 * `deleteRange` tombstones [from, to) of the current visible text.
 */
function deleteRange(
  text: CRDTText,
  from: number,
  to: number,
  at: TimeTicket,
  versionVector?: VersionVector,
) {
  return text.edit(
    text.createRange(from, to),
    '',
    at,
    undefined,
    versionVector,
  );
}

describe('RGATreeSplitNode removal events', () => {
  it('pairs each actor events by place', () => {
    // A's removal holds the node; B removed it and undid that.
    const n = node(a(5));
    n.setRemovalEvents([b(6), b(4)]);
    const [, dels, cancels] = n.getLedger();
    expect(dels.length).toBe(2);
    expect(cancels.length).toBe(1);
    expect(cancels[0].deletion.equals(b(4))).toBe(true);
    expect(cancels[0].cancelledAt.equals(b(6))).toBe(true);
    expect(n.getRemovedAt()!.equals(a(5))).toBe(true);
    expect(keys(n.getRemovalEvents())).toEqual(keys([b(4), b(6)]));
  });

  it.each([
    ['removed_at repeated', a(5), [a(5)]],
    ['event repeated', undefined, [a(5), a(5)]],
    ['removal without removedAt', undefined, [a(5)]],
    ['removed_at cancelled', a(5), [a(3)]],
  ])('rejects malformed events: %s', (_, removedAt, events) => {
    const n = node(removedAt);
    expect(() => n.setRemovalEvents(events)).toThrow();
    // The node is left as it was.
    expect(n.getRemovedAt()?.toIDString()).toBe(removedAt?.toIDString());
    expect(n.getRemovalEvents()).toEqual([]);
  });

  it('writes nothing when removedAt says it all', () => {
    const n = node();
    n.recordRemoval(a(5));
    expect(n.getRemovalEvents()).toEqual([]);
    expect(n.getLedger()[0]).toBe(false);
  });
});

describe('Text removal ledger', () => {
  it('returns removed spans in document order', () => {
    // Restore anchors each recreated fragment after the one before it, so
    // the reverse of an edit has to list them left to right.
    const text = seededText(a(1));
    [8, 6, 4, 2].forEach((pos, i) => {
      text.edit(text.createRange(pos, pos), 'x', a(2 + i));
    });
    expect(text.toString()).toBe('01x23x45x67x89');

    const [, , , , , spans] = deleteRange(text, 0, 14, a(10));
    expect(spans.map((s) => s.value.getContent()).join('')).toBe(
      '01x23x45x67x89',
    );
  });

  it('keeps one uncancelled removal per actor', () => {
    // A removal by an actor that already holds an uncancelled one is not
    // recorded: only a change that leaves its own earlier removal out of its
    // vector can send it.
    const text = seededText(a(1));
    deleteRange(text, 2, 4, a(2));

    // The same actor removes [1,3) of "01456789" again, with a vector that
    // knows the insertion but not its own removal of "23".
    deleteRange(text, 1, 3, a(5), vector([[actorA, 1]]));

    for (const n of text.getRGATreeSplit()) {
      if (n.getID().getOffset() === 2) {
        expect(n.getRemovedAt()!.equals(a(2))).toBe(true);
        expect(n.getRemovalEvents()).toEqual([]);
      }
    }
  });

  it('cancels only the undoing actor removal', () => {
    // A and B remove "2" concurrently, B with the later ticket. A's undo has
    // to cancel A's removal, not the latest one, and leave B's holding it.
    const text = seededText(a(1));
    const range = text.createRange(2, 3);
    deleteRange(text, 2, 3, a(2));
    text.edit(range, '', b(3), undefined, vector([[actorA, 1]]));
    expect(text.toString()).toBe('013456789');

    text.restore(
      [
        {
          createdAt: a(1),
          start: 2,
          end: 3,
          value: CRDTTextValue.create('2'),
        },
      ],
      a(4),
    );
    expect(text.toString()).toBe('013456789');
    for (const n of text.getRGATreeSplit()) {
      if (n.getID().getOffset() === 2) {
        expect(n.uncancelledRemovalBy(actorA)).toBeUndefined();
        expect(n.uncancelledRemovalBy(actorB)!.equals(b(3))).toBe(true);
      }
    }
  });

  it('reports nothing tombstoned by a redo of a removed piece', () => {
    // A redo that re-removes a span another actor already tombstoned -- by a
    // deletion the redo never saw -- splits that tombstone and hands back the
    // born-dead remainders as GC pairs, but nothing went live to dead. It
    // still records the redo on the piece, which the reverse names.
    const seed = a(1);
    const text = seededText(seed);
    deleteRange(text, 2, 8, b(2));
    expect(text.toString()).toBe('0189');

    const [pairs, changes, , recorded] = text.retombstone(
      [
        {
          createdAt: seed,
          start: 4,
          end: 6,
          value: CRDTTextValue.create('45'),
        },
      ],
      a(3),
      vector([[actorA, 3]]),
    );
    expect(changes).toEqual([]);
    expect(pairs.length).toBeGreaterThan(0);
    expect(recorded.length).toBe(1);
  });
});

describe('EditOperation empty undo', () => {
  it('runs as a no-op wherever it points', () => {
    // Stacked entries are not reconciled against remote undos and redos, so
    // a degraded identity reverse once ran past the end of a text other
    // replicas had emptied and failed (seed 152 of Go's TestTextUndoFuzz).
    const doc = new Document<{ t: Text }>('empty-undo');
    doc.update((root) => {
      root.t = new Text();
      root.t.edit(0, 0, '0123456789');
    });
    const root = (doc as unknown as { root: CRDTRoot }).root;
    const text = doc.getRootObject().get('t') as unknown as CRDTText;
    const head = text.getRGATreeSplit().getHead().getID();
    const stale = RGATreeSplitPos.of(head, 50);
    const undo = EditOperation.create(
      text.getCreatedAt(),
      stale,
      stale,
      '',
      new Map(),
      TimeTicket.of(100n, 0, actorA),
      true,
    );

    const result = undo.execute(root, OpSource.UndoRedo);
    expect(result.opInfos).toEqual([]);
    expect(text.toString()).toBe('0123456789');
    for (const pos of [undo.getFromPos(), undo.getToPos()]) {
      expect(pos.getID().equals(head)).toBe(true);
      expect(pos.getRelativeOffset()).toBe(0);
    }
    const reverse = result.reverseOp as EditOperation;
    expect(reverse).toBeInstanceOf(EditOperation);
    expect(reverse.getFromPos().getRelativeOffset()).toBe(0);
  });
});
