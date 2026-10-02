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
import { RGATreeSplitPos } from '@yorkie-js/sdk/src/document/crdt/rga_tree_split';
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
 * `assertNormalizePosMatchesChainWalk` checks `normalizePos` against its
 * definition at every offset of every node: anchored on the head, offset by
 * the live length of every node before the position's node plus the offset
 * inside it. Tombstones are included, since remote edits and reverse
 * operations anchor on them.
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
    }
    prefix += node.getLength();
  }
  return checks;
}

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
});
