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

// Intent preservation for concurrent typing at the same position
// (yorkie#2309). Replicas used to converge to an interleaved result when a
// word was typed with the caret held in place, e.g. `Xab가c나다Y`. Each
// insert now records its right origin too, and runs stay contiguous.

import { describe, it, expect } from 'vitest';
import { Document } from '@yorkie-js/sdk/src/document/document';
import { Text } from '@yorkie-js/sdk/src/yorkie';
import { converter } from '@yorkie-js/sdk/src/api/converter';
import { ChangePack } from '@yorkie-js/sdk/src/document/change/change_pack';
import { Checkpoint } from '@yorkie-js/sdk/src/document/change/checkpoint';
import { InitialVersionVector } from '@yorkie-js/sdk/src/document/time/version_vector';
import { CRDTText } from '@yorkie-js/sdk/src/document/crdt/text';

type D = Document<{ t: Text }>;

/**
 * `syncAll` exchanges every replica's local changes with every other one.
 * With `wire`, the changes go through protobuf first.
 */
function syncAll(docs: Array<D>, wire = false): void {
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
 * `setup` creates `n` replicas sharing a Text with `base`.
 */
function setup(n: number, base: string, wire = false): Array<D> {
  const docs: Array<D> = [];
  for (let i = 0; i < n; i++) {
    const d = new Document<{ t: Text }>('intent-doc');
    d.setActor((i + 1).toString(16).padStart(24, '0'));
    docs.push(d);
  }
  docs[0].update((r) => {
    r.t = new Text();
    r.t.edit(0, 0, base);
  });
  syncAll(docs, wire);
  return docs;
}

const ins = (d: D, at: number, s: string) =>
  d.update((r) => r.t.edit(at, at, s));
const text = (d: D) => d.getRoot().t.toString();
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

describe('Text intent preservation', () => {
  const strategies = { forward, backward };
  // Before: forward_vs_forward Xabc가나다Y, backward_vs_forward X가abc나다Y,
  // backward_vs_backward Xab가c나다Y. The same scenarios as the Go tests.
  for (const wire of [false, true]) {
    for (const a of ['forward', 'backward'] as const) {
      for (const b of ['forward', 'backward'] as const) {
        it(`${a} vs ${b}${wire ? ' (wire)' : ''}`, () => {
          const [d1, d2] = setup(2, 'XY', wire);
          strategies[a](d1, 1, ['가', '나', '다']);
          strategies[b](d2, 1, ['a', 'b', 'c']);
          syncAll([d1, d2], wire);
          expect(text(d1)).toBe(text(d2));
          expect(text(d1)).toBe('X가나다abcY');
        });
      }
    }
  }

  it('keeps origins across a snapshot', () => {
    const [d1, d2] = setup(2, 'XY');
    backward(d1, 1, ['가', '나', '다']);
    forward(d2, 1, ['a', 'b', 'c']);
    d2.update((r) => r.t.edit(2, 3, 'Q'));
    syncAll([d1, d2]);

    const root = d1.getRootObject();
    const t = root.get('t') as unknown as CRDTText;
    const bytes = converter.snapshotToBytes(root, new Map());
    const got = converter
      .bytesToSnapshot(bytes)
      .root.get('t') as unknown as CRDTText;
    const origins = (x: CRDTText) =>
      [...x.getRGATreeSplit()].map((n) => {
        const o = n.getOrigin();
        return `${n.getID().toTestString()} ${o?.left.toTestString()} ${o?.right?.toTestString()}`;
      });
    expect(origins(got)).toEqual(origins(t));
  });

  const alphabets = ['가나다라마바', 'abcdef', 'ABCDEF'];
  for (const n of [2, 3]) {
    for (const strat of ['forward', 'backward', 'random']) {
      it(`keeps runs contiguous: replicas=${n} ${strat}`, () => {
        for (let seed = 0; seed < 100; seed++) {
          const rnd = mulberry32(seed + 1);
          const docs = setup(n, '0123456789');
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
          const s = text(docs[0]);
          docs.forEach((d) => expect(text(d)).toBe(s));
          for (const r of runs) {
            expect(s, `seed ${seed}`).toContain(r);
          }
        }
      });
    }
  }
});
