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
  RGATreeSplitNode,
  RGATreeSplitNodeID,
  RGATreeSplitPos,
} from '@yorkie-js/sdk/src/document/crdt/rga_tree_split';
import { ChangePack } from '@yorkie-js/sdk/src/document/change/change_pack';
import { Checkpoint } from '@yorkie-js/sdk/src/document/change/checkpoint';
import { InitialVersionVector } from '@yorkie-js/sdk/src/document/time/version_vector';
import { maxVectorOf } from '@yorkie-js/sdk/test/helper/helper';
import { isUTF16Boundary } from '@yorkie-js/sdk/src/document/json/strings';

/**
 * `textBoundaries` returns the character boundaries of text, from 0 to its
 * length, in UTF-16 code units. The index between the two units of a
 * surrogate pair is not among them: Text rejects it.
 */
function textBoundaries(text: Text): Array<number> {
  const value = text.toString();
  const bounds: Array<number> = [];
  for (let i = 0; i <= value.length; i++) {
    if (isUTF16Boundary(value, i)) {
      bounds.push(i);
    }
  }
  return bounds;
}

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
 * the live length of every node before the position's node plus the offset
 * inside it. Tombstones are included, since remote edits and reverse
 * operations anchor on them. Each offset inside a node is also queried by an
 * ID that only a floor lookup resolves, as a replica that has not split the
 * node yet would send it.
 */
function assertNormalizePosMatchesChainWalk(
  text: CRDTText,
  seed: number,
  step: number,
): number {
  const split = text.getRGATreeSplit();
  const head = split.getHead().getID();
  let checks = 0;
  let prefix = 0;

  // A position anchored on the head itself: the only node the chain walk
  // never steps over, and the id every other position normalizes to.
  const atHead = text.normalizePos(RGATreeSplitPos.of(head, 0));
  if (!atHead.getID().equals(head) || atHead.getRelativeOffset() !== 0) {
    assert.fail(
      `seed ${seed} step ${step}: head ${head.toTestString()} normalized to ` +
        `${atHead.toTestString()}, want offset 0 in ${text.toTestString()}`,
    );
  }
  checks++;

  for (let node = split.getHead().getNext(); node; node = node.getNext()) {
    for (let offset = 0; offset <= node.getContentLength(); offset++) {
      const pos = RGATreeSplitPos.of(node.getID(), offset);
      const normalized = text.normalizePos(pos);
      // Compared before asserting: the message prints the whole chain, and
      // building it on every passing check makes the test quadratic.
      if (
        !normalized.getID().equals(head) ||
        normalized.getRelativeOffset() !== prefix + offset
      ) {
        assert.fail(
          `seed ${seed} step ${step}: ${pos.toTestString()} normalized to ` +
            `${normalized.toTestString()}, want offset ${prefix + offset} ` +
            `in ${text.toTestString()}`,
        );
      }
      checks++;

      if (offset === 0 || offset === node.getContentLength()) continue;
      const id = node.getID();
      const floor = RGATreeSplitPos.of(
        RGATreeSplitNodeID.of(id.getCreatedAt(), id.getOffset() + offset),
        0,
      );
      const floorNormalized = text.normalizePos(floor);
      if (
        !floorNormalized.getID().equals(head) ||
        floorNormalized.getRelativeOffset() !== prefix
      ) {
        assert.fail(
          `seed ${seed} step ${step}: floor ${floor.toTestString()} ` +
            `normalized to ${floorNormalized.toTestString()}, want offset ` +
            `${prefix} in ${text.toTestString()}`,
        );
      }
      checks++;
    }
    prefix += node.getLength();
  }
  return checks;
}

/**
 * `countChainSteps` counts the `prev` hops taken while `body` runs. Summing
 * the chain costs one hop per node before the position, so this measures the
 * cost `normalizePos` is meant to have shed - deterministically, without
 * timing a loop on a shared CI runner.
 */
function countChainSteps(body: () => void): number {
  let hops = 0;
  const proto = RGATreeSplitNode.prototype;
  const original = proto.getPrev;
  proto.getPrev = function () {
    hops++;
    return original.call(this);
  };
  try {
    body();
  } finally {
    proto.getPrev = original;
  }
  return hops;
}

/**
 * `typeText` returns a document whose text holds `size` single-character
 * nodes, typed one edit at a time the way an editor would.
 */
function typeText(size: number): Document<{ t: Text }> {
  const doc = new Document<{ t: Text }>(`normalize-pos-cost-${size}`);
  doc.update((root) => {
    root.t = new Text();
    for (let i = 0; i < size; i++) {
      root.t.edit(i, i, 'a');
    }
  });
  return doc;
}

/**
 * `chainWalk` is the definition `normalizePos` replaced, kept literally: find
 * the floor node of the position's id (only among pieces of the same
 * insertion), then sum the live length of every node on its `prev` chain.
 * It answers `undefined` where the old code threw: no piece of the insertion
 * survives.
 */
function chainWalk(text: CRDTText, pos: RGATreeSplitPos): number | undefined {
  const entry = text.getRGATreeSplit().getTreeByID().floorEntry(pos.getID());
  if (
    !entry ||
    (!entry.key.equals(pos.getID()) && !entry.key.hasSameCreatedAt(pos.getID()))
  ) {
    return;
  }
  let total = pos.getRelativeOffset();
  for (let prev = entry.value.getPrev(); prev; prev = prev.getPrev()) {
    total += prev.getLength();
  }
  return total;
}

// The inserted content is drawn whole characters at a time: a local edit may
// not carry a lone half of a surrogate pair, so slicing 'ab😀가' by code unit
// would feed the generator content `Text.edit` refuses.
const alphabet = [...'ab😀가'];

describe('Text.normalizePos', () => {
  it('should match the chain walk across edit, style, undo, redo and GC', () => {
    const counts = { checks: 0, undo: 0, redo: 0, purged: 0 };

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
            const bounds = textBoundaries(root.t);
            const at = bounds[rnd(bounds.length)];
            root.t.edit(at, at, alphabet.slice(0, 1 + rnd(4)).join(''));
          });
        } else if (op < 6) {
          doc.update((root) => {
            const bounds = textBoundaries(root.t);
            if (bounds.length === 1) return;
            const from = rnd(bounds.length - 1);
            const to = Math.min(bounds.length - 1, from + 1 + rnd(3));
            root.t.edit(bounds[from], bounds[to], '');
          });
        } else if (op < 7) {
          doc.update((root) => {
            const bounds = textBoundaries(root.t);
            if (bounds.length === 1) return;
            const from = rnd(bounds.length - 1);
            const to = Math.min(bounds.length - 1, from + 1 + rnd(3));
            root.t.setStyle(bounds[from], bounds[to], {
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
        counts.checks += assertNormalizePosMatchesChainWalk(text, seed, step);
      }
    }

    // Guard the harness itself: a sequence that never undoes, redoes or
    // purges would pass without exercising the paths that matter.
    assert.isAbove(counts.undo, 100);
    assert.isAbove(counts.redo, 10);
    assert.isAbove(counts.purged, 100);
    assert.isAbove(counts.checks, 100000);
  });

  it('should match the chain walk on replicas applying remote edits', () => {
    const counts = { checks: 0, purged: 0 };

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

      for (let step = 0; step < 100; step++) {
        const doc = docs[rnd(2)];
        const op = rnd(10);
        if (op < 5) {
          doc.update((root) => {
            const bounds = textBoundaries(root.t);
            const at = bounds[rnd(bounds.length)];
            root.t.edit(at, at, alphabet.slice(0, 1 + rnd(4)).join(''));
          });
        } else if (op < 8) {
          doc.update((root) => {
            const bounds = textBoundaries(root.t);
            if (bounds.length === 1) return;
            const from = rnd(bounds.length - 1);
            const to = Math.min(bounds.length - 1, from + 1 + rnd(3));
            root.t.edit(bounds[from], bounds[to], '');
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
          counts.checks += assertNormalizePosMatchesChainWalk(text, seed, step);
        }
      }

      crossSync(docs[0], docs[1]);
      assert.equal(docs[0].toSortedJSON(), docs[1].toSortedJSON());
    }

    assert.isAbove(counts.purged, 50);
    assert.isAbove(counts.checks, 50000);
  });

  it('should cost the same to normalize at any document length', () => {
    const lookups = 100;
    const hops: Record<number, number> = {};

    for (const size of [1000, 8000]) {
      const doc = typeText(size);
      const text = doc.getRootObject().get('t') as unknown as CRDTText;
      const split = text.getRGATreeSplit();
      // Spread across the document, so the lookups cannot all land on
      // whatever node the previous one left at the root of the splay tree.
      const positions: Array<RGATreeSplitPos> = [];
      for (let i = 0; i < lookups; i++) {
        positions.push(split.indexToPos(Math.floor((i * size) / lookups)));
      }

      hops[size] = countChainSteps(() => {
        for (const pos of positions) {
          text.normalizePos(pos);
        }
      });
    }

    // The chain walk spent one hop per node before the position: ~50k hops
    // for these 100 lookups at 1000 nodes and ~400k at 8000, growing with the
    // document. Reading the index spends none, so hold it to at most one hop
    // per lookup at either size and require the cost not to grow with length.
    assert.isAtMost(hops[1000], lookups);
    assert.isAtMost(hops[8000], lookups);
    assert.isAtMost(hops[8000], Math.max(hops[1000], lookups));
  });

  it('should resolve positions whose pieces GC purged as the chain walk did', () => {
    // Positions taken before GC still arrive after it: a remote Edit and the
    // undo stack both carry them. Purging takes their pieces out of both
    // trees, so the floor lookup lands on an earlier surviving piece of the
    // same insertion, or on none. Each case must resolve exactly as the walk
    // did - the same offset, or the same refusal.
    const counts = { stale: 0, refused: 0, floored: 0, boundary: 0 };

    for (let seed = 1; seed <= 20; seed++) {
      const rnd = mulberry32(seed);
      const doc = new Document<{ t: Text }>(`normalize-pos-purged-${seed}`);
      doc.update((root) => {
        root.t = new Text();
        root.t.edit(0, 0, 'abcdefghij');
        root.t.edit(5, 5, '0123456789');
      });

      for (let step = 0; step < 40; step++) {
        const text = doc.getRootObject().get('t') as unknown as CRDTText;
        const split = text.getRGATreeSplit();
        const stale: Array<RGATreeSplitPos> = [];
        for (let n = split.getHead().getNext(); n; n = n.getNext()) {
          // Past the content too: a floor piece shorter than the purged one
          // it stands in for sees `rel` run beyond its own end.
          for (let o = 0; o <= n.getContentLength() + 1; o++) {
            stale.push(RGATreeSplitPos.of(n.getID(), o));
          }
        }

        doc.update((root) => {
          if (rnd(3) === 0 || root.t.length < 4) {
            const at = rnd(root.t.length + 1);
            root.t.edit(at, at, 'xyz'.slice(0, 1 + rnd(3)));
            return;
          }
          const from = rnd(root.t.length);
          root.t.edit(from, Math.min(root.t.length, from + 1 + rnd(4)), '');
        });
        doc.garbageCollect(maxVectorOf([doc.getChangeID().getActorID()]));

        const head = split.getHead().getID();
        for (const pos of stale) {
          counts.stale++;
          const want = chainWalk(text, pos);
          if (want === undefined) {
            assert.throws(
              () => text.normalizePos(pos),
              /should be found/,
              `seed ${seed} step ${step}: ${pos.toTestString()}`,
            );
            counts.refused++;
            continue;
          }
          const node = split.getTreeByID().floorEntry(pos.getID())!.value;
          if (!node.getID().equals(pos.getID())) counts.floored++;
          if (pos.getRelativeOffset() >= node.getContentLength()) {
            counts.boundary++;
          }
          const got = text.normalizePos(pos);
          if (!got.getID().equals(head) || got.getRelativeOffset() !== want) {
            assert.fail(
              `seed ${seed} step ${step}: ${pos.toTestString()} normalized ` +
                `to ${got.toTestString()}, want offset ${want} in ` +
                `${text.toTestString()}`,
            );
          }
        }
      }
    }

    // Guard the harness: every branch above has to have been reached.
    assert.isAbove(counts.refused, 100);
    assert.isAbove(counts.floored, 100);
    assert.isAbove(counts.boundary, 100);
  });

  it('should keep typing linear in the length of the text', () => {
    const sizes = [500, 2000];
    const hops = sizes.map((size) => countChainSteps(() => typeText(size)));

    // Every edit normalizes its `fromPos`, so a lookup that sums the chain
    // made typing quadratic: ~125k hops for 500 characters and ~2M for 2000,
    // a 16x step for 4x the text. Bound the cost per edit by a constant
    // instead, which is what keeps the total linear.
    for (const [i, size] of sizes.entries()) {
      assert.isAtMost(hops[i], size);
    }
  });
});
