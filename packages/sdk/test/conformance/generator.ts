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

import type { GenKind, Script, Step } from './runner';

/**
 * `mulberry32` is the seeded PRNG the Go runner implements bit for bit, so
 * seed N is the same script in both SDKs.
 */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * `Families` are the generator's op mixes with their weights. The last kind
 * is the fallback when the cumulative weights fall short of the pick.
 */
export const Families: Record<string, Array<[GenKind, number]>> = {
  is: [
    ['ins', 0.5],
    ['split', 0.5],
  ],
  del: [
    ['ins', 0.35],
    ['split', 0.35],
    ['del', 0.3],
  ],
  merge: [
    ['ins', 0.35],
    ['split', 0.35],
    ['merge', 0.3],
  ],
  style: [
    ['ins', 0.35],
    ['split', 0.35],
    ['style', 0.3],
  ],
  all: [
    ['ins', 0.3],
    ['split', 0.3],
    ['del', 0.15],
    ['merge', 0.15],
    ['style', 0.1],
  ],
};

/**
 * `FixtureFamilies` maps a parity fixture family to its generator settings.
 */
export const FixtureFamilies: Record<
  string,
  { fam: string; n: number; steps: number }
> = {
  is: { fam: 'is', n: 2, steps: 24 },
  del: { fam: 'del', n: 2, steps: 24 },
  merge: { fam: 'merge', n: 2, steps: 24 },
  style: { fam: 'style', n: 2, steps: 24 },
  all: { fam: 'all', n: 2, steps: 24 },
  all3: { fam: 'all', n: 3, steps: 30 },
};

const ValuePool =
  'cdefghijklmnopqrstuvwxyz0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * `gen` builds the script for one seed. A replica pulls with probability 0.5
 * when it has a pending entry; otherwise it makes a `gen` event whose kind
 * is drawn from the family's weights.
 */
export function gen(
  seed: number,
  fam: string,
  n: number,
  steps: number,
): Script {
  const weights = Families[fam];
  if (!weights) {
    throw new Error(`unknown family: ${fam}`);
  }
  const rnd = mulberry32(seed);
  let c = 0;
  const out: Array<Step> = [];
  const authors: Array<number> = [];
  const cursor: Array<number> = new Array(n).fill(0);
  const pending = (r: number) => {
    let p = 0;
    for (let i = cursor[r]; i < authors.length; i++) {
      if (authors[i] !== r) p++;
    }
    return p;
  };
  for (let s = 0; s < steps; s++) {
    const r = Math.floor(rnd() * n);
    if (rnd() < 0.5 && pending(r) > 0) {
      out.push({ r, op: 'pull' });
      while (authors[cursor[r]] === r) cursor[r]++;
      cursor[r]++;
      continue;
    }
    const pick = rnd();
    let acc = 0;
    let k = weights[weights.length - 1][0];
    for (const [kind, w] of weights) {
      acc += w;
      if (pick < acc) {
        k = kind;
        break;
      }
    }
    const f = rnd();
    const g = rnd();
    const h = rnd();
    const v = ValuePool[c++ % ValuePool.length];
    out.push({ r, op: 'gen', k, f, g, h, v });
    authors.push(r);
  }
  return {
    v: 1,
    id: `${fam}-n${n}-s${steps}-${seed}`,
    replicas: n,
    init: 'abcd',
    steps: out,
  };
}
