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

// A port of Go's pkg/document/text_undo_fuzz_test.go (yorkie-team/yorkie
// #2310). It drives Text undo and redo against concurrent deletions over the
// push/pull model of test/helper/adv_sync.ts, every change through protobuf.
// The default run takes a few seeds per required setting; more seeds, and
// the setting that is only reported, run with
//
//   TEXT_UNDO_FUZZ_SEEDS=1000 TEXT_UNDO_FUZZ_FULL=1 \
//     pnpm sdk exec vitest run test/unit/document/text_undo_fuzz_test.ts
//
// It requires convergence with GC off, and with GC on when nothing is
// inserted, and that every replica's removal ledger survives a snapshot.
// With GC on and inserts, a recreated piece can still land after text
// inserted between the gap and the following piece of its insertion (see
// "Known limits" in the task doc), so that setting is only reported. The
// PRNG is not Go's, so seed-for-seed results differ from Go's; the settings
// and what each requires are the same.

import { describe, it, expect } from 'vitest';
import { Document } from '@yorkie-js/sdk/src/document/document';
import { Text } from '@yorkie-js/sdk/src/yorkie';
import { converter } from '@yorkie-js/sdk/src/api/converter';
import { ChangePack } from '@yorkie-js/sdk/src/document/change/change_pack';
import { Checkpoint } from '@yorkie-js/sdk/src/document/change/checkpoint';
import { CRDTText } from '@yorkie-js/sdk/src/document/crdt/text';
import { LogLevel, setLogLevel } from '@yorkie-js/sdk/src/util/logger';
import {
  AdvServer,
  mulberry32,
  newAdvClients,
} from '@yorkie-js/sdk/test/helper/adv_sync';

type Root = { t: Text };

const seeds = Number(process.env.TEXT_UNDO_FUZZ_SEEDS ?? 10);
const full = !!process.env.TEXT_UNDO_FUZZ_FULL;

/**
 * `wire` passes the server log through protobuf.
 */
function wire(s: AdvServer): void {
  s.log = s.log.map((ch) => {
    const pack = converter.fromChangePack(
      converter.toChangePack(
        ChangePack.create('k', Checkpoint.of(0n, 0), false, [ch]),
      ),
    );
    return pack.getChanges()[0];
  });
}

/**
 * `ledger` is the removal ledger of every node as a value: removedAt, the
 * removals and the cancel pairs.
 */
function ledger(text: CRDTText): string {
  const out: Array<string> = [];
  for (const n of text.getRGATreeSplit()) {
    const [ledgered, dels, cancels] = n.getLedger();
    let ds: Array<string> = [];
    let cs: Array<string> = [];
    if (ledgered) {
      ds = dels.map((d) => d.toTestString());
      cs = cancels.map(
        (c) => `${c.deletion.toTestString()}>${c.cancelledAt.toTestString()}`,
      );
    } else if (n.getRemovedAt()) {
      ds = [n.getRemovedAt()!.toTestString()];
    }
    ds.sort();
    cs.sort();
    const ra = n.getRemovedAt()?.toTestString() ?? '-';
    out.push(`${n.getID().toTestString()} r=${ra} d=${ds} c=${cs}`);
  }
  return out.join('|');
}

const textOf = (d: Document<Root>) =>
  d.getRootObject().get('t') as unknown as CRDTText;

/**
 * `snapshotMismatch` reports a ledger that does not survive a snapshot.
 */
function snapshotMismatch(d: Document<Root>): string {
  const bytes = converter.snapshotToBytes(d.getRootObject(), new Map());
  let got: CRDTText;
  try {
    got = converter.bytesToSnapshot(bytes).root.get('t') as unknown as CRDTText;
  } catch (err) {
    return `decode: ${(err as Error).message}`;
  }
  const want = ledger(textOf(d));
  const have = ledger(got);
  return want === have ? '' : `ledger\n ${want}\n ${have}`;
}

/**
 * `runSeed` runs one seed and returns '' on convergence, or the failure.
 */
function runSeed(
  seed: number,
  gc: boolean,
  insertPct: number,
  clients: number,
  steps: number,
): string {
  const rnd = mulberry32(seed);
  const pick = (n: number) => Math.floor(rnd() * n);
  const s = new AdvServer();
  const cs = newAdvClients<Root>(clients);
  cs[0].doc.update((root) => {
    root.t = new Text();
    root.t.edit(0, 0, 'abcdefghij');
  });
  for (const c of cs) {
    s.sync(c, gc);
  }
  s.sync(cs[0], gc);
  cs[0].doc.clearHistory();

  for (let step = 0; step < steps; step++) {
    const c = cs[pick(cs.length)];
    let k = pick(10);
    if (k < 2 && pick(100) >= insertPct) {
      k = 2;
    }
    try {
      if (k < 2) {
        const pos = pick(c.doc.getRoot().t.length + 1);
        const ch = String.fromCharCode(65 + pick(26));
        c.doc.update((root) => root.t.edit(pos, pos, ch));
      } else if (k < 5) {
        const l = c.doc.getRoot().t.length;
        if (l === 0) {
          continue;
        }
        const from = pick(l);
        const to = from + 1 + pick(Math.min(3, l - from));
        c.doc.update((root) => root.t.edit(from, to, ''));
      } else if (k < 7) {
        c.doc.history.undo();
      } else if (k < 8) {
        c.doc.history.redo();
      } else {
        s.sync(c, gc);
        wire(s);
      }
    } catch (err) {
      return `step ${step}: ${(err as Error).message}`;
    }
    for (const x of cs) {
      const why = snapshotMismatch(x.doc);
      if (why) {
        return `step ${step}: ${why}`;
      }
    }
  }
  try {
    for (let round = 0; round < 3; round++) {
      for (const c of cs) {
        s.sync(c, gc);
      }
    }
  } catch (err) {
    return `final sync: ${(err as Error).message}`;
  }
  const want = cs[0].doc.getRoot().t.toString();
  for (const c of cs.slice(1)) {
    const got = c.doc.getRoot().t.toString();
    if (got !== want) {
      return `diverged ${JSON.stringify(want)} vs ${JSON.stringify(got)}`;
    }
  }
  return '';
}

/**
 * `quietly` runs `fn` with the SDK logger silenced: a seed that fails while
 * applying a change logs it before rethrowing.
 */
function quietly<T>(fn: () => T): T {
  setLogLevel(LogLevel.Fatal);
  try {
    return fn();
  } finally {
    setLogLevel(LogLevel.Warn);
  }
}

describe('Text undo fuzz', () => {
  const settings = [
    { gc: false, insertPct: 0, clients: 3, required: true },
    { gc: false, insertPct: 100, clients: 3, required: true },
    { gc: false, insertPct: 100, clients: 4, required: true },
    { gc: true, insertPct: 0, clients: 3, required: true },
    { gc: true, insertPct: 100, clients: 3, required: false },
  ];
  for (const tc of settings) {
    if (!tc.required && !full) {
      continue;
    }
    const name = `gc=${tc.gc} insert=${tc.insertPct}% clients=${tc.clients}`;
    it(name, () => {
      const failures: Array<string> = [];
      quietly(() => {
        for (let seed = 0; seed < seeds; seed++) {
          const why = runSeed(seed, tc.gc, tc.insertPct, tc.clients, 40);
          if (why) {
            failures.push(`seed ${seed}: ${why}`);
          }
        }
      });
      // The config swallows console output, so the count goes to stderr,
      // with every failing seed on a full sweep.
      if (full || failures.length) {
        process.stderr.write(
          `${name}: ${failures.length} of ${seeds} seeds failed\n`,
        );
      }
      if (full) {
        for (const failure of failures) {
          process.stderr.write(`  ${failure.split('\n')[0]}\n`);
        }
      }
      if (tc.required) {
        expect(failures.slice(0, 3)).toEqual([]);
      }
    });
  }

  // The divergence the setting above only reports, pinned to a seed so it is
  // asserted rather than left to a sweep nobody runs. It FAILS on purpose:
  // with GC on and inserts, a recreated piece can still land after text
  // inserted between the gap and the following piece of its insertion, and
  // the replicas end up holding different text. Delete this `.fails` -- do
  // not delete the test -- when that is fixed; seeds 56 and 90 of the first
  // 300 are the ones that reproduce it.
  it.fails('gc=true insert=100% clients=3 diverges (known, seed 56)', () => {
    expect(quietly(() => runSeed(56, true, 100, 3, 40))).toBe('');
  });
});
