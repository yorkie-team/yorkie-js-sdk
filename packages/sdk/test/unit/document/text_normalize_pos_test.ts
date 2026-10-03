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
import { Document, Text } from '@yorkie-js/sdk/src/yorkie';
import { CRDTText } from '@yorkie-js/sdk/src/document/crdt/text';
import {
  RGATreeSplitNodeID,
  RGATreeSplitPos,
} from '@yorkie-js/sdk/src/document/crdt/rga_tree_split';
import { ChangePack } from '@yorkie-js/sdk/src/document/change/change_pack';
import { Checkpoint } from '@yorkie-js/sdk/src/document/change/checkpoint';
import { InitialVersionVector } from '@yorkie-js/sdk/src/document/time/version_vector';
import { maxVectorOf } from '@yorkie-js/sdk/test/helper/helper';

/**
 * `mulberry32` is a small seeded PRNG, so a failing seed reproduces.
 */
function mulberry32(seed: number): (n: number) => number {
  let s = seed;
  return (n: number) => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) % n;
  };
}

/**
 * `crossSync` delivers each replica's pending changes to the other and
 * acknowledges them, so the next call does not resend them.
 */
function crossSync<T>(d1: Document<T>, d2: Document<T>): void {
  const p1 = d1.createChangePack();
  const p2 = d2.createChangePack();
  const deliver = (
    pack: ReturnType<Document<T>['createChangePack']>,
    changes: ReturnType<typeof pack.getChanges>,
    serverSeq: bigint,
    clientSeq: number,
  ) =>
    ChangePack.create(
      pack.getDocumentKey(),
      Checkpoint.of(serverSeq, clientSeq),
      false,
      changes,
      InitialVersionVector,
    );
  const lastSeq = (pack: ReturnType<Document<T>['createChangePack']>) => {
    const changes = pack.getChanges();
    return changes.length
      ? changes[changes.length - 1].getID().getClientSeq()
      : 0;
  };

  d2.applyChangePack(deliver(p1, p1.getChanges(), 0n, 0));
  d1.applyChangePack(deliver(p2, p2.getChanges(), 0n, 0));
  d1.applyChangePack(deliver(p1, [], 0n, lastSeq(p1)));
  d2.applyChangePack(deliver(p2, [], 0n, lastSeq(p2)));
}

/**
 * `assertNormalizePosMatchesChainWalk` checks `normalizePos` against its
 * definition at every offset of every node: anchored on the head, offset by
 * the live length of every node before the position's node plus the live
 * characters of that node before the position. Tombstones are included, since
 * remote edits and reverse operations anchor on them; a tombstone holds no
 * live character, so every position inside one is the index where it sits.
 * A position at offset 0 of a split-off piece is the left anchor of the split
 * - the end of the piece it was split from, wherever a concurrent insertion
 * has since pushed the two apart - which is how `findNodeWithSplit` resolves
 * it when the edit is applied.
 *
 * Each position is queried in the three shapes production produces:
 *
 * - `(nodeID, offset)`, what this replica's own `indexToPos` builds;
 * - `((createdAt, nodeOffset + offset), 0)`, an ID only a floor lookup
 *   resolves, as a replica that has not split the node yet would send it;
 * - `(firstPieceID, rel)` with `rel` running past that piece and across the
 *   pieces this replica split off it, which is what a peer sends after a
 *   local split — the shape `refinePos` exists for. All three name the same
 *   character and must normalize to the same offset.
 */
function assertNormalizePosMatchesChainWalk(
  text: CRDTText,
  seed: number,
  step: number,
  counts: { checks: number; spanning: number },
): void {
  const split = text.getRGATreeSplit();
  const head = split.getHead().getID();
  // The lowest-offset surviving piece of each insertion: a peer that has not
  // applied our splits still addresses the whole run through it.
  const anchors = new Map<string, RGATreeSplitNodeID>();
  // The live index each node starts at, so the left anchor of a split can be
  // read off the piece it was split from even once the two are apart.
  const prefixes = new Map<string, number>();
  let prefix = 0;
  for (let node = split.getHead().getNext(); node; node = node.getNext()) {
    const id = node.getID();
    const key = id.getCreatedAt().toIDString();
    const seen = anchors.get(key);
    if (!seen || id.getOffset() < seen.getOffset()) {
      anchors.set(key, id);
    }
    const anchor = anchors.get(key)!;
    prefixes.set(id.toTestString(), prefix);

    const insPrev = node.hasInsPrev() ? node.getInsPrev() : undefined;
    const insPrevStart = insPrev
      ? prefixes.get(insPrev.getID().toTestString())
      : undefined;
    for (let offset = 0; offset <= node.getContentLength(); offset++) {
      let want = node.isRemoved() ? prefix : prefix + offset;
      if (offset === 0 && insPrev && insPrevStart !== undefined) {
        want = insPrev.isRemoved()
          ? insPrevStart
          : insPrevStart + insPrev.getContentLength();
      }
      // Compared before asserting: the message prints the whole chain, and
      // building it on every passing check makes the test quadratic.
      const check = (pos: RGATreeSplitPos, shape: string) => {
        const normalized = text.normalizePos(pos);
        if (
          !normalized.getID().equals(head) ||
          normalized.getRelativeOffset() !== want
        ) {
          assert.fail(
            `seed ${seed} step ${step}: ${shape} ${pos.toTestString()} ` +
              `normalized to ${normalized.toTestString()}, want offset ` +
              `${want} in ${text.toTestString()}`,
          );
        }
        counts.checks++;
      };

      check(RGATreeSplitPos.of(id, offset), 'local');

      if (anchor.getOffset() < id.getOffset()) {
        const rel = id.getOffset() - anchor.getOffset() + offset;
        check(RGATreeSplitPos.of(anchor, rel), 'spanning');
        // Only a `rel` past the anchor's own content exercises the walk
        // across the pieces split off it.
        if (rel > split.findNode(anchor).getContentLength()) {
          counts.spanning++;
        }
      }

      if (offset === 0 || offset === node.getContentLength()) continue;
      check(
        RGATreeSplitPos.of(
          RGATreeSplitNodeID.of(id.getCreatedAt(), id.getOffset() + offset),
          0,
        ),
        'floor',
      );
    }
    prefix += node.getLength();
  }
}

describe('Text.normalizePos', () => {
  it('should match the chain walk across edit, style, undo, redo and GC', () => {
    const counts = { checks: 0, spanning: 0, undo: 0, redo: 0, purged: 0 };

    for (let seed = 1; seed <= 30; seed++) {
      const rnd = mulberry32(seed);
      const doc = new Document<{ t: Text }>(`normalize-pos-${seed}`);
      doc.update((root) => {
        root.t = new Text();
      });
      // Undo must reach the edits, never the text itself.
      doc.clearHistory();

      for (let step = 0; step < 150; step++) {
        const op = rnd(10);
        if (op < 4) {
          doc.update((root) => {
            const at = rnd(root.t.length + 1);
            root.t.edit(at, at, 'ab😀가'.slice(0, 1 + rnd(4)));
          });
        } else if (op < 6) {
          doc.update((root) => {
            if (!root.t.length) return;
            const from = rnd(root.t.length);
            root.t.edit(from, Math.min(root.t.length, from + 1 + rnd(3)), '');
          });
        } else if (op < 7) {
          doc.update((root) => {
            if (!root.t.length) return;
            const from = rnd(root.t.length);
            root.t.setStyle(from, Math.min(root.t.length, from + 1 + rnd(3)), {
              b: '1',
            });
          });
        } else if (op < 8) {
          if (doc.history.canUndo()) {
            doc.history.undo();
            counts.undo++;
          }
        } else if (op < 9) {
          if (doc.history.canRedo()) {
            doc.history.redo();
            counts.redo++;
          }
        } else {
          counts.purged += doc.garbageCollect(
            maxVectorOf([doc.getChangeID().getActorID()]),
          );
        }

        const text = doc.getRootObject().get('t') as unknown as CRDTText;
        assertNormalizePosMatchesChainWalk(text, seed, step, counts);
      }
    }

    // Guard the harness itself: a sequence that never undoes, redoes or
    // purges would pass without exercising the paths that matter, and one
    // that never splits a node never queries a pos past its floor node.
    assert.isAbove(counts.undo, 100);
    assert.isAbove(counts.redo, 10);
    assert.isAbove(counts.purged, 100);
    assert.isAbove(counts.spanning, 1000);
    assert.isAbove(counts.checks, 100000);
  });

  it('should match the chain walk on replicas applying remote edits', () => {
    const counts = { checks: 0, spanning: 0, purged: 0 };

    for (let seed = 1; seed <= 20; seed++) {
      const rnd = mulberry32(seed);
      const actors = ['000000000000000000000001', '000000000000000000000002'];
      const docs = actors.map((actor) => {
        const doc = new Document<{ t: Text }>(`normalize-pos-remote-${seed}`);
        doc.setActor(actor);
        return doc;
      });
      docs[0].update((root) => {
        root.t = new Text();
      });
      crossSync(docs[0], docs[1]);

      // NOTE(claude): no undo here. `garbageCollect` below is driven by
      // `maxVectorOf`, which claims both replicas have seen everything, so it
      // purges nodes a peer's pending undo still anchors on and the apply
      // throws. Modelling that needs per-replica acked vectors, which
      // `crossSync`'s stub checkpointing does not carry.
      for (let step = 0; step < 100; step++) {
        const doc = docs[rnd(2)];
        const op = rnd(10);
        if (op < 5) {
          doc.update((root) => {
            const at = rnd(root.t.length + 1);
            root.t.edit(at, at, 'ab😀가'.slice(0, 1 + rnd(4)));
          });
        } else if (op < 8) {
          doc.update((root) => {
            if (!root.t.length) return;
            const from = rnd(root.t.length);
            root.t.edit(from, Math.min(root.t.length, from + 1 + rnd(3)), '');
          });
        } else if (op < 9) {
          crossSync(docs[0], docs[1]);
        } else {
          crossSync(docs[0], docs[1]);
          for (const d of docs) {
            counts.purged += d.garbageCollect(maxVectorOf(actors));
          }
        }

        for (const d of docs) {
          const text = d.getRootObject().get('t') as unknown as CRDTText;
          assertNormalizePosMatchesChainWalk(text, seed, step, counts);
        }
      }

      crossSync(docs[0], docs[1]);
      assert.equal(docs[0].toSortedJSON(), docs[1].toSortedJSON());
    }

    assert.isAbove(counts.purged, 50);
    assert.isAbove(counts.spanning, 1000);
    assert.isAbove(counts.checks, 50000);
  });
});
