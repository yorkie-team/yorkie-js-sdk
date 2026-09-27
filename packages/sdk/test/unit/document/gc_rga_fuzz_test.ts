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

import { writeFileSync } from 'fs';
import { describe, it, assert } from 'vitest';
import { Document } from '@yorkie-js/sdk/src/document/document';
import { JSONArray } from '@yorkie-js/sdk/src/document/json/array';
import { Change } from '@yorkie-js/sdk/src/document/change/change';
import { ChangePack } from '@yorkie-js/sdk/src/document/change/change_pack';
import { Checkpoint } from '@yorkie-js/sdk/src/document/change/checkpoint';
import {
  InitialVersionVector,
  VersionVector,
} from '@yorkie-js/sdk/src/document/time/version_vector';
import { LogLevel, setLogLevel } from '@yorkie-js/sdk/src/util/logger';

// Port of Go's gc_rga_fuzz_test.go (yorkie ba82ed91), the reproduction for
// "collection changes RGA insertion". Like Go's, it is opt-in rather than part
// of the default run, because the collection-on sweep still reports failures:
// the successor barrier is a partial fix. What remains is the anchor an
// in-flight operation still references, which a purge can destroy whatever
// the successor's stability (a tail tombstone has no successor at all).
//
//   RGA_FUZZ=1 pnpm sdk exec vitest run test/unit/document/gc_rga_fuzz_test.ts
//
// Measured on the commit that added the barrier, 1000 seeds, 3 clients, 12
// rounds (diverged / threw while applying), before -> after:
//
//   insert+delete        0/95  -> 0/50
//   insert+delete+move   5/103 -> 3/70
//   insert+delete+set    2/26  -> 0/18
//   insert+move          3/76  -> 0/45
//   insert+set           2/0   -> 0/0
//   all                112/32  -> 73/20
//
// The GC-off control is what makes collection the cause rather than a
// correlate: the same seeds converge when nothing is collected.
//
// The push/pull model is faithful to the server's pushpull: each client's row
// is stored from its push's version vector, a client's own changes are
// filtered out of its pull, minVV is the element-wise minimum over the stored
// rows, and collection runs only inside `applyChangePack` with the vector that
// pull delivered. The PRNG is not Go's, so seed-for-seed counts differ from
// Go's; the shape (GC-off clean, GC-on better than before, not zero) is what
// carries over.

type ArrDoc = { arr: JSONArray<string> };

/**
 * `mulberry32` is a small seeded PRNG, so a seed replays the same history.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * `minVV` is Go's `time.MinVersionVector`: element-wise min, and 0 for an
 * actor any vector does not carry.
 */
function minVV(vectors: Array<VersionVector>): VersionVector {
  const actors = new Set<string>();
  for (const v of vectors) {
    for (const [actor] of v) {
      actors.add(actor);
    }
  }
  const out = new VersionVector(new Map());
  for (const actor of actors) {
    let min: bigint | undefined;
    for (const v of vectors) {
      const l = v.get(actor) ?? 0n;
      min = min === undefined || l < min ? l : min;
    }
    out.set(actor, min!);
  }
  return out;
}

type Client = { doc: Document<ArrDoc>; id: string; cursor: number };

/**
 * `Server` models the server's pushpull: one ordered change log, one stored
 * version vector row per client, and minVV over the stored rows.
 */
class Server {
  private log: Array<Change<any>> = [];
  private rows = new Map<string, VersionVector>();

  /**
   * `sync` is one PushPull round trip: push, store the row, pull everything
   * this client has not seen, and hand the response to `applyChangePack`,
   * which applies then collects.
   */
  sync(c: Client, gc: boolean): void {
    const p = c.doc.createChangePack();
    const pushed = p.getChanges();
    this.log.push(...pushed);
    this.rows.set(c.id, p.getVersionVector()!.deepcopy());
    const lastSeq = pushed.length
      ? pushed[pushed.length - 1].getID().getClientSeq()
      : 0;

    const pulled = this.log
      .slice(c.cursor)
      .filter((ch) => ch.getID().getActorID() !== c.id);
    c.cursor = this.log.length;

    const vv = gc ? minVV([...this.rows.values()]) : InitialVersionVector;
    c.doc.applyChangePack(
      ChangePack.create(
        c.doc.getKey(),
        Checkpoint.of(0n, lastSeq),
        false,
        pulled,
        vv,
      ),
    );
  }
}

/**
 * `arrayOp` applies one random local array operation.
 */
function arrayOp(
  c: Client,
  rnd: () => number,
  tag: string,
  ops: Array<number>,
): void {
  const pick = (n: number) => Math.floor(rnd() * n);
  c.doc.update((r) => {
    const arr = r.arr;
    const n = arr.length;
    switch (ops[pick(ops.length)]) {
      case 0:
        if (n === 0) {
          arr.push(tag);
          return;
        }
        arr.insertAfter(arr.getElementByIndex(pick(n)).getID!(), tag);
        return;
      case 1:
        if (n > 0) {
          arr.delete!(pick(n));
        }
        return;
      case 2:
        if (n >= 2) {
          arr.moveAfterByIndex(pick(n), pick(n));
        }
        return;
      case 3:
        if (n > 0) {
          arr.setValue(pick(n), tag);
        }
        return;
    }
  });
}

/**
 * `runSeed` plays one random history and reports how it ended.
 */
function runSeed(
  seed: number,
  nClients: number,
  rounds: number,
  gc: boolean,
  ops: Array<number>,
): 'ok' | 'diverged' | 'error' {
  const rnd = mulberry32(seed);
  const srv = new Server();
  const cs: Array<Client> = [];
  for (let i = 0; i < nClients; i++) {
    const id = String(i + 1).padStart(24, '0');
    const doc = new Document<ArrDoc>('adv-doc');
    doc.setActor(id);
    cs.push({ doc, id, cursor: 0 });
  }

  try {
    cs[0].doc.update((r) => {
      r.arr = ['a', 'b', 'c'] as unknown as JSONArray<string>;
    });
    for (const c of cs) {
      srv.sync(c, gc);
    }

    for (let round = 0; round < rounds; round++) {
      for (const c of cs) {
        if (rnd() < 0.7) {
          arrayOp(c, rnd, `${c.id.slice(22)}${Math.floor(rnd() * 100)}`, ops);
        }
      }
      for (const c of cs) {
        if (rnd() < 0.55) {
          srv.sync(c, gc);
        }
      }
    }

    // Full convergence: everyone syncs until quiet.
    for (let i = 0; i < 6; i++) {
      for (const c of cs) {
        srv.sync(c, gc);
      }
    }
  } catch {
    return 'error';
  }

  const arrOf = (c: Client) =>
    (
      c.doc.getRootObject().get('arr') as unknown as { toJSON(): string }
    ).toJSON();
  const want = arrOf(cs[0]);
  return cs.every((c) => arrOf(c) === want) ? 'ok' : 'diverged';
}

/**
 * `sweep` runs `seeds` seeds and counts the outcomes.
 */
function sweep(
  seeds: number,
  gc: boolean,
  ops: Array<number>,
): Record<'ok' | 'diverged' | 'error', number> {
  const counts = { ok: 0, diverged: 0, error: 0 };
  for (let seed = 1; seed <= seeds; seed++) {
    counts[runSeed(seed, 3, 12, gc, ops)]++;
  }
  return counts;
}

describe.skipIf(!process.env.RGA_FUZZ)('RGA collection fuzz (opt-in)', () => {
  setLogLevel(LogLevel.Fatal);

  it('converges on every seed with collection off (control)', () => {
    const counts = sweep(300, false, [0, 1, 2, 3]);
    assert.equal(counts.ok, 300, JSON.stringify(counts));
  });

  it('reports collection-on outcomes per op mix', () => {
    const cases: Array<[string, Array<number>]> = [
      ['insert+delete', [0, 1]],
      ['insert+delete+move', [0, 1, 2]],
      ['insert+delete+set', [0, 1, 3]],
      ['insert+move', [0, 2]],
      ['insert+set', [0, 3]],
      ['all', [0, 1, 2, 3]],
    ];
    const lines = cases.map(([name, ops]) => {
      const c = sweep(1000, true, ops);
      return `${name.padEnd(20)} diverged=${c.diverged} error=${c.error}`;
    });
    // The test runner swallows console output, so the report can also go to
    // a file: RGA_FUZZ_OUT=/path/to/report.txt.
    console.log(lines.join('\n'));
    if (process.env.RGA_FUZZ_OUT) {
      writeFileSync(process.env.RGA_FUZZ_OUT, lines.join('\n') + '\n');
    }
  });
});
