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
// Convergence of concurrent text edits with garbage collection. GC keeps a
// collected tombstone as a skeleton, so insertion origins that name it, and
// the windows `RGATreeSplit.integrate` scans, are the same on a replica that
// collected it and on one that did not. Replicas also reload from snapshots,
// which carry skeletons as `skeleton_len`. More seeds:
//
//   TEXT_SKELETON_GC_SEEDS=20000 pnpm sdk exec vitest run \
//     test/unit/document/text_skeleton_gc_test.ts

import { describe, it, expect } from 'vitest';
import { Document } from '@yorkie-js/sdk/src/document/document';
import { Text } from '@yorkie-js/sdk/src/yorkie';
import { converter } from '@yorkie-js/sdk/src/api/converter';
import { ChangePack } from '@yorkie-js/sdk/src/document/change/change_pack';
import { Checkpoint } from '@yorkie-js/sdk/src/document/change/checkpoint';
import { InitialVersionVector } from '@yorkie-js/sdk/src/document/time/version_vector';
import { CRDTText } from '@yorkie-js/sdk/src/document/crdt/text';
import { minVersionVector } from '@yorkie-js/sdk/test/helper/adv_sync';

type D = Document<{ t: Text }>;

const seeds = Number(process.env.TEXT_SKELETON_GC_SEEDS ?? 500);

/**
 * `syncAll` exchanges every replica's local changes through protobuf.
 */
function syncAll(docs: Array<D>): void {
  const packs = docs.map((d) =>
    converter.fromChangePack(converter.toChangePack(d.createChangePack())),
  );
  packs.forEach((p, i) =>
    docs.forEach((d, j) => {
      if (i === j) return;
      d.applyChangePack(
        ChangePack.create(
          p.getDocumentKey(),
          Checkpoint.of(0n, 0),
          false,
          p.getChanges(),
          InitialVersionVector,
        ),
      );
    }),
  );
  packs.forEach((p, i) => {
    const cs = p.getChanges();
    const last = cs.length ? cs[cs.length - 1].getID().getClientSeq() : 0;
    docs[i].applyChangePack(
      ChangePack.create(
        p.getDocumentKey(),
        Checkpoint.of(0n, last),
        false,
        [],
        InitialVersionVector,
      ),
    );
  });
}

/**
 * `reload` replaces `doc` by a replica loaded from its snapshot.
 */
function reload(doc: D): D {
  const bytes = converter.snapshotToBytes(doc.getRootObject(), new Map());
  const fresh = new Document<{ t: Text }>('skel');
  fresh.setActor(doc.getChangeID().getActorID());
  fresh.applyChangePack(
    ChangePack.create(
      'skel',
      Checkpoint.of(1n, 0),
      false,
      [],
      doc.getVersionVector(),
      bytes,
    ),
  );
  return fresh;
}

/**
 * `mulberry32` is a seeded PRNG so runs are reproducible.
 */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const textOf = (d: D) => d.getRoot().t.toString();

/**
 * `runSeed` runs one random scenario and returns '' on convergence.
 */
function runSeed(seed: number): string {
  const rnd = mulberry32(seed);
  const pick = (n: number) => Math.floor(rnd() * n);
  const n = 2 + pick(2);
  let docs: Array<D> = [];
  for (let i = 0; i < n; i++) {
    const d = new Document<{ t: Text }>('skel');
    d.setActor((i + 1).toString(16).padStart(24, '0'));
    docs.push(d);
  }
  docs[0].update((r) => {
    r.t = new Text();
    r.t.edit(0, 0, 'XY');
  });
  syncAll(docs);

  for (let round = 0; round < 4; round++) {
    for (const d of docs) {
      const k = 1 + pick(4);
      for (let s = 0; s < k; s++) {
        const len = d.getRoot().t.length;
        if (len > 0 && rnd() < 0.4) {
          const from = pick(len);
          const to = Math.min(len, from + 1 + pick(3));
          d.update((r) => r.t.edit(from, to, ''));
        } else {
          const at = pick(len + 1);
          d.update((r) => r.t.edit(at, at, 'abcdefgh'[pick(8)]));
        }
      }
    }
    if (rnd() < 0.7) {
      syncAll(docs);
      // GC on some replicas only: the others keep their tombstones.
      const vv = minVersionVector(docs.map((d) => d.getVersionVector()));
      docs.forEach((d) => {
        if (rnd() < 0.5) d.garbageCollect(vv);
      });
      if (rnd() < 0.3) {
        const i = pick(docs.length);
        docs = docs.map((d, j) => (i === j ? reload(d) : d));
      }
    }
  }
  syncAll(docs);
  syncAll(docs);

  const want = textOf(docs[0]);
  for (const d of docs) {
    if (textOf(d) !== want) {
      return `seed ${seed}: ${JSON.stringify(want)} vs ${JSON.stringify(textOf(d))}`;
    }
  }
  return '';
}

describe('Text skeleton GC', () => {
  it('converges with GC and snapshot reloads', () => {
    const failures: Array<string> = [];
    for (let seed = 1; seed <= seeds; seed++) {
      try {
        const why = runSeed(seed);
        if (why) failures.push(why);
      } catch (err) {
        failures.push(`seed ${seed}: ${(err as Error).message}`);
      }
    }
    expect(failures.slice(0, 5)).toEqual([]);
  });

  it('keeps a collected tombstone for origins that name it', () => {
    // The minimal GC case: d0 collects X, then both type at the start. With
    // X unlinked on d0 only, the two scanned different windows: abc / cab.
    const docs: Array<D> = [];
    for (let i = 0; i < 2; i++) {
      const d = new Document<{ t: Text }>('skel');
      d.setActor((i + 1).toString(16).padStart(24, '0'));
      docs.push(d);
    }
    const [d0, d1] = docs;
    d0.update((r) => {
      r.t = new Text();
      r.t.edit(0, 0, 'XY');
    });
    syncAll(docs);
    d0.update((r) => r.t.edit(0, 1, ''));
    syncAll(docs);
    d1.update((r) => r.t.edit(0, 1, ''));
    d0.garbageCollect(minVersionVector(docs.map((d) => d.getVersionVector())));
    syncAll(docs);

    d0.update((r) => r.t.edit(0, 0, 'a'));
    d0.update((r) => r.t.edit(1, 1, 'b'));
    d1.update((r) => r.t.edit(0, 0, 'c'));
    syncAll(docs);

    expect(textOf(d0)).toBe(textOf(d1));
    const skeletons = [
      ...(d0.getRootObject().get('t') as unknown as CRDTText).getRGATreeSplit(),
    ].filter((n) => n.isSkeleton());
    expect(skeletons.length).toBe(1);
  });
});
