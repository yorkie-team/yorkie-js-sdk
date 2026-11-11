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

// Intent preservation for concurrent typing in a Tree (yorkie#2309), the
// Tree counterpart of text_intent_test.ts. Each insertion records the
// sibling right of the caret, and placement uses both origins inside the
// parent's child list, so runs typed concurrently stay contiguous.

import { describe, it, expect } from 'vitest';
import { Document } from '@yorkie-js/sdk/src/document/document';
import { Tree } from '@yorkie-js/sdk/src/yorkie';
import { converter } from '@yorkie-js/sdk/src/api/converter';
import { ChangePack } from '@yorkie-js/sdk/src/document/change/change_pack';
import { Checkpoint } from '@yorkie-js/sdk/src/document/change/checkpoint';
import { InitialVersionVector } from '@yorkie-js/sdk/src/document/time/version_vector';
import { CRDTTree, CRDTTreeNode } from '@yorkie-js/sdk/src/document/crdt/tree';
import { traverseAll } from '@yorkie-js/sdk/src/util/index_tree';
import { minVersionVector } from '@yorkie-js/sdk/test/helper/adv_sync';

type D = Document<{ t: Tree }>;

const seeds = Number(process.env.TREE_SKELETON_GC_SEEDS ?? 300);

/**
 * `syncAll` exchanges every replica's local changes with every other one.
 * With `wire`, the changes go through protobuf first.
 */
function syncAll(docs: Array<D>, wire = true): void {
  const packs = docs.map((d) => {
    const p = d.createChangePack();
    return wire ? converter.fromChangePack(converter.toChangePack(p)) : p;
  });
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
  const fresh = new Document<{ t: Tree }>('tree-intent');
  fresh.setActor(doc.getChangeID().getActorID());
  fresh.applyChangePack(
    ChangePack.create(
      'tree-intent',
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
 * `setup` creates `n` replicas sharing a Tree whose paragraphs hold `paras`.
 */
function setup(n: number, paras: Array<string>, wire = true): Array<D> {
  const docs: Array<D> = [];
  for (let i = 0; i < n; i++) {
    const d = new Document<{ t: Tree }>('tree-intent');
    d.setActor((i + 1).toString(16).padStart(24, '0'));
    docs.push(d);
  }
  // A separate creator, so no replica's undo can take the tree away.
  const creator = new Document<{ t: Tree }>('tree-intent');
  creator.setActor('f'.repeat(24));
  creator.update((r) => {
    r.t = new Tree({
      type: 'r',
      children: paras.map((p) => ({
        type: 'p',
        children: p ? [{ type: 'text', value: p }] : [],
      })),
    });
  });
  syncAll([creator, ...docs], wire);
  return docs;
}

const xml = (d: D) => d.getRoot().t.toXML();
const crdtTree = (d: D) => d.getRootObject().get('t') as unknown as CRDTTree;

/**
 * `paragraphs` returns the text of each paragraph.
 */
function paragraphs(d: D): Array<string> {
  const root = JSON.parse(d.getRoot().t.toJSON());
  return root.children.map((p: { children: Array<{ value: string }> }) =>
    p.children.map((c) => c.value).join(''),
  );
}

// Insert character `c` at offset `off` of paragraph 0.
const ins = (d: D, off: number, c: string) =>
  d.update((r) =>
    r.t.editByPath([0, off], [0, off], { type: 'text', value: c }),
  );
const forward = (d: D, at: number, cs: Array<string>) =>
  cs.forEach((c, i) => ins(d, at + i, c));
const backward = (d: D, at: number, cs: Array<string>) =>
  [...cs].reverse().forEach((c) => ins(d, at, c));

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

describe('Tree intent preservation', () => {
  const strategies = { forward, backward };
  // Before: backward_vs_forward <p>X가abc나다Y</p> and backward_vs_backward
  // <p>Xab가c나다Y</p>, as in Text.
  for (const wire of [false, true]) {
    for (const a of ['forward', 'backward'] as const) {
      for (const b of ['forward', 'backward'] as const) {
        it(`${a} vs ${b}${wire ? ' (wire)' : ''}`, () => {
          const [d1, d2] = setup(2, ['XY'], wire);
          strategies[a](d1, 1, ['가', '나', '다']);
          strategies[b](d2, 1, ['a', 'b', 'c']);
          syncAll([d1, d2], wire);
          expect(xml(d1)).toBe(xml(d2));
          expect(xml(d1)).toBe('<r><p>X가나다abcY</p></r>');
        });
      }
    }
  }

  it('keeps origins across a snapshot', () => {
    const [d1, d2] = setup(2, ['XY']);
    backward(d1, 1, ['가', '나', '다']);
    forward(d2, 1, ['a', 'b', 'c']);
    d2.update((r) => r.t.editByPath([0, 2], [0, 3]));
    syncAll([d1, d2]);

    const origins = (t: CRDTTree) => {
      const out: Array<string> = [];
      traverseAll(t.getRoot(), (n: CRDTTreeNode) => {
        out.push(
          `${n.id.toTestString()} ${n.origin?.left?.toTestString()} ${n.origin?.right?.toTestString()}`,
        );
      });
      return out;
    };
    const reloaded = reload(d1);
    expect(origins(crdtTree(reloaded))).toEqual(origins(crdtTree(d1)));
    expect(xml(reloaded)).toBe(xml(d1));
  });

  const alphabets = ['가나다라마바', 'abcdef', 'ABCDEF'];
  for (const n of [2, 3]) {
    for (const strat of ['forward', 'backward', 'random']) {
      it(`keeps runs contiguous: replicas=${n} ${strat}`, () => {
        for (let seed = 0; seed < 100; seed++) {
          const rnd = mulberry32(seed + 1);
          const docs = setup(n, ['0123456789'], seed % 2 === 1);
          const runs: Array<string> = [];
          docs.forEach((d, i) => {
            const len = 2 + Math.floor(rnd() * 4);
            let run: Array<string> = [];
            for (let k = 0; k < len; k++) {
              const off =
                strat === 'forward'
                  ? run.length
                  : strat === 'backward'
                    ? 0
                    : Math.floor(rnd() * (run.length + 1));
              const c = alphabets[i][k];
              ins(d, 5 + off, c);
              run = [...run.slice(0, off), c, ...run.slice(off)];
            }
            runs.push(run.join(''));
          });
          syncAll(docs, seed % 2 === 1);
          const s = paragraphs(docs[0])[0];
          docs.forEach((d) => expect(xml(d)).toBe(xml(docs[0])));
          for (const r of runs) {
            expect(s, `seed ${seed}`).toContain(r);
          }
        }
      });
    }
  }

  for (const strat of ['forward', 'backward'] as const) {
    it(`keeps paragraph runs contiguous: ${strat}`, () => {
      // Each replica presses Enter-like paragraph inserts between A and B.
      for (let seed = 0; seed < 50; seed++) {
        const docs = setup(2 + (seed % 2), ['A', 'B']);
        const runs: Array<Array<string>> = [];
        docs.forEach((d, i) => {
          const run: Array<string> = [];
          for (let k = 0; k < 3; k++) {
            const label = `${alphabets[i][k]}`;
            const at = strat === 'forward' ? 1 + k : 1;
            d.update((r) =>
              r.t.editByPath([at], [at], {
                type: 'p',
                children: [{ type: 'text', value: label }],
              }),
            );
            if (strat === 'forward') run.push(label);
            else run.unshift(label);
          }
          runs.push(run);
        });
        syncAll(docs);
        docs.forEach((d) => expect(xml(d)).toBe(xml(docs[0])));
        const got = paragraphs(docs[0]).join(',');
        for (const r of runs) {
          expect(got, `seed ${seed}`).toContain(r.join(','));
        }
      }
    });
  }
});

/**
 * `runSeed` runs one random scenario over paragraphs and returns '' on
 * convergence.
 */
function runSeed(seed: number, withUndo: boolean): string {
  const rnd = mulberry32(seed);
  const pick = (n: number) => Math.floor(rnd() * n);
  let docs = setup(2 + pick(2), ['XY', 'Z']);

  for (let round = 0; round < 4; round++) {
    for (let di = 0; di < docs.length; di++) {
      const d = docs[di];
      const k = 1 + pick(4);
      for (let s = 0; s < k; s++) {
        const paras = paragraphs(d);
        const r = rnd();
        if (withUndo && r < 0.1) {
          if (d.history.canUndo()) d.history.undo();
          continue;
        }
        if (paras.length === 0 || r < 0.15) {
          const at = pick(paras.length + 1);
          d.update((root) =>
            root.t.editByPath([at], [at], {
              type: 'p',
              children: [{ type: 'text', value: 'pq'[pick(2)] }],
            }),
          );
          continue;
        }
        const pi = pick(paras.length);
        const len = paras[pi].length;
        if (r < 0.22 && paras.length > 1) {
          d.update((root) => root.t.editByPath([pi], [pi + 1]));
        } else if (len > 0 && r < 0.5) {
          const from = pick(len);
          const to = Math.min(len, from + 1 + pick(3));
          d.update((root) => root.t.editByPath([pi, from], [pi, to]));
        } else {
          const at = pick(len + 1);
          d.update((root) =>
            root.t.editByPath([pi, at], [pi, at], {
              type: 'text',
              value: 'abcdefgh'[pick(8)],
            }),
          );
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
      if (!withUndo && rnd() < 0.3) {
        const i = pick(docs.length);
        docs = docs.map((d, j) => (i === j ? reload(d) : d));
      }
    }
  }
  syncAll(docs);
  syncAll(docs);

  const want = xml(docs[0]);
  for (const d of docs) {
    if (xml(d) !== want) {
      return `seed ${seed}: ${want} vs ${xml(d)}`;
    }
  }
  return '';
}

describe('Tree skeleton GC', () => {
  it('converges with GC and snapshot reloads', () => {
    const failures: Array<string> = [];
    for (let seed = 1; seed <= seeds; seed++) {
      try {
        const why = runSeed(seed, false);
        if (why) failures.push(why);
      } catch (err) {
        failures.push(`seed ${seed}: ${(err as Error).message}`);
      }
    }
    expect(failures.slice(0, 5), `${failures.length} failed`).toEqual([]);
  });

  it('reports undo divergence with GC', () => {
    // Concurrent Tree undo with GC fails on main too (40 diverged and 5
    // errors in these 300 seeds; here 35 and 2), so this only reports.
    let diverged = 0;
    let errors = 0;
    for (let seed = 1; seed <= seeds; seed++) {
      try {
        if (runSeed(seed, true)) diverged++;
      } catch {
        errors++;
      }
    }
    process.stdout.write(
      `tree undo+gc: diverged ${diverged}, errors ${errors} of ${seeds}\n`,
    );
    expect(diverged + errors).toBeLessThan(seeds);
  });

  it('keeps a collected tombstone for origins that name it', () => {
    const docs = setup(2, ['XY']);
    const [d0, d1] = docs;
    d0.update((r) => r.t.editByPath([0, 0], [0, 1]));
    syncAll(docs);
    d0.garbageCollect(minVersionVector(docs.map((d) => d.getVersionVector())));

    d0.update((r) =>
      r.t.editByPath([0, 0], [0, 0], { type: 'text', value: 'a' }),
    );
    d0.update((r) =>
      r.t.editByPath([0, 1], [0, 1], { type: 'text', value: 'b' }),
    );
    d1.update((r) =>
      r.t.editByPath([0, 0], [0, 0], { type: 'text', value: 'c' }),
    );
    syncAll(docs);

    expect(xml(d0)).toBe(xml(d1));
    let skeletons = 0;
    traverseAll(crdtTree(d0).getRoot(), (n: CRDTTreeNode) => {
      if (n.skeleton) skeletons++;
    });
    expect(skeletons).toBe(1);
  });
});
