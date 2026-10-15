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

// Tree convergence conformance suite, shared with yorkie (Go). `tree/` is a
// synced copy of yorkie's test/conformance/tree/ (see sync.sh and SOURCE).
//
//   - corpus: every script replays with the result its `status.js` records.
//   - parity: regenerated rows match the Go runner's fixture byte for byte.
//   - large runs (opt-in, no fixture comparison):
//       CONFORMANCE_FAM=all CONFORMANCE_RUNS=5000 CONFORMANCE_OUT=rows.json \
//         pnpm sdk exec vitest run test/conformance

import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import * as path from 'path';
import { describe, it, expect, vi } from 'vitest';
import { LogLevel, setLogLevel } from '@yorkie-js/sdk/src/util/logger';
import {
  checksString,
  errMessage,
  Mode,
  parseScript,
  replay,
  runScript,
  StatusResults,
} from './runner';
import { FixtureFamilies, gen } from './generator';

const TreeDir = path.join(__dirname, 'tree');
const CorpusDir = path.join(TreeDir, 'corpus');
const ParityDir = path.join(TreeDir, 'parity');
const DigestFile = path.join(TreeDir, 'corpus-digests.json');
const ParitySeed0 = 1;
const ParityRuns = 200;

// Every replay below runs its script twice (off and minvv), and under
// `pnpm sdk test:ci` every line of it goes through istanbul instrumentation.
// CI's default 5s (vitest.config.ts) is too short for that, so every test
// that replays a script states its own budget: generous, because a passing
// test never waits for it, and the only thing it has to beat is a run slow
// enough to be a false red.
const Timeout = 600_000;

// The same budget as this file's default, so a test added here later does not
// silently inherit the 5s one. The per-test arguments below stay: they are
// what the replaying suites are held to whatever this call does.
vi.setConfig({ testTimeout: Timeout });

// `tree/corpus-digests.json`: the Go runner's record of every corpus script,
// synced from yorkie with the corpus. The parity fixtures hold the two
// runners to the same step lines, xml and shapes for generated scripts, but
// a generated script has no undo, redo, snapshot, removeStyle, update or
// contents op in it — only the corpus does, and `status.js` alone says
// nothing about how those steps were spelled.
type CorpusDigest = {
  result: string;
  checks: string;
  digest: string;
  xmlDigest: string;
};

type ParityFixture = {
  fam: string;
  n: number;
  steps: number;
  seed0: number;
  runs: number;
  diverged: number;
  rows: Array<{
    seed: number;
    result: string;
    checks: string;
    digest: string;
    xmlDigest: string;
  }>;
};

/**
 * `jsonFiles` lists the `.json` files of `dir`, sorted, or none if it does
 * not exist.
 */
function jsonFiles(dir: string): Array<string> {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort();
}

/**
 * `genRows` runs `runs` generated scripts of one fixture family.
 */
function genRows(family: string, seed0: number, runs: number) {
  const { fam, n, steps } = FixtureFamilies[family];
  const rows = [];
  for (let k = 0; k < runs; k++) {
    const seed = seed0 + k;
    const rec = runScript(gen(seed, fam, n, steps));
    rows.push({
      seed,
      result: rec.result,
      checks: checksString(rec.checks),
      digest: rec.digest,
      xmlDigest: rec.xmlDigest,
    });
  }
  return { fam, n, steps, rows };
}

setLogLevel(LogLevel.Fatal);

const source = readFileSync(path.join(TreeDir, 'SOURCE'), 'utf8').trim();

describe('Tree conformance: corpus', () => {
  const files = jsonFiles(CorpusDir);
  const digests: Record<string, CorpusDigest> = JSON.parse(
    readFileSync(DigestFile, 'utf8'),
  );

  it('has a corpus', () => {
    expect(files.length, `no scripts in ${CorpusDir}`).toBeGreaterThan(0);
  });

  it('has a Go record for every script and no more', () => {
    expect(
      Object.keys(digests).sort(),
      'tree/corpus-digests.json does not list exactly the corpus scripts',
    ).toEqual(files);
  });

  for (const file of files) {
    it(
      file,
      () => {
        const script = parseScript(
          readFileSync(path.join(CorpusDir, file), 'utf8'),
          file,
        );
        const status = script.status?.js;
        expect(status, `${file}: status.js is missing`).toBeDefined();
        const rec = runScript(script);
        expect(
          rec.result,
          `${file}: status.js is "${status}" but the result is ` +
            `"${rec.result}" (checks ${JSON.stringify(rec.checks)}` +
            `${rec.error ? `, error ${rec.error}` : ''}` +
            `${rec.expects.length ? `, ${rec.expects.join('; ')}` : ''}): ` +
            `update status.js ` +
            `in yorkie's test/conformance/tree/corpus and re-sync if the ` +
            `change is intended\n${rec.steps.join('\n')}`,
        ).toBe(StatusResults[status!]);

        // …and the expect blocks, which the result alone cannot speak for.
        // `runScript` ranks !I2 (error) over !I1 (diverged) over E, so on a
        // `known-error`, `known-diverge` or `known-fail` script the recorded
        // status is reached whatever the expects did — the XML every one of
        // those scripts carries would be asserted nowhere. Hold them here
        // instead, for every status: an expect that stopped holding is a
        // real change in behaviour even where the ledger already tolerates
        // the run failing for another reason.
        expect(
          rec.expects,
          `${file}: expect steps that did not hold\n${rec.steps.join('\n')}`,
        ).toEqual([]);
        // …and that they RAN. `E` is false when the off replay stopped
        // before an expect step, which is the one way an empty `expects`
        // means "nothing was checked" rather than "everything held". A
        // script whose off replay errors has no such guarantee to make.
        if (!rec.error?.startsWith('off:')) {
          expect(
            rec.checks.E,
            `${file}: an expect step did not run (checks ` +
              `${JSON.stringify(rec.checks)})\n${rec.steps.join('\n')}`,
          ).toBe(true);
        }

        // …and the Go record, which is where this runner is held to the Go
        // one byte for byte: `digest` covers the step lines, the xml and
        // the shapes, `xmlDigest` the step lines and the xml. A step line
        // spelled differently here, or an undo that restored the same xml
        // over a different node, moves them while the result stays `pass`.
        expect(
          {
            result: rec.result,
            checks: checksString(rec.checks),
            digest: rec.digest,
            xmlDigest: rec.xmlDigest,
          },
          `${file}: the Go runner at yorkie ${source} recorded ` +
            `${JSON.stringify(digests[file])} for this script. A digest ` +
            `moves when a step line, the xml or a shape differs; fix the ` +
            `runner, or change yorkie's runner and re-sync if the change ` +
            `is intended\n${rec.steps.join('\n')}\n` +
            `${rec.xml.join('\n')}\n${rec.shapes.join('\n')}`,
        ).toEqual(digests[file]);
      },
      Timeout,
    );
  }
});

describe('Tree conformance: script loading', () => {
  // The Go runner's TestLoadScriptRejects cases, plus an inherited status
  // name that only a JS lookup could mistake for a ledger value.
  const head = '"v":1,"id":"x","replicas":1,"init":"ab"';
  const step = (st: string) => `{${head},"steps":[${st}]}`;
  const bad: Record<string, string> = {
    version: '{"v":3,"id":"x","replicas":1,"init":"ab","steps":[]}',
    field: `{${head},"steps":[],"extra":1}`,
    'step field': step('{"r":0,"op":"pull","form":1}'),
    op: step('{"r":0,"op":"insert"}'),
    'gen kind': step('{"r":0,"op":"gen","k":"move","f":0,"g":0,"h":0,"v":"c"}'),
    status: `{${head},"status":{"js":"diverged"},"steps":[]}`,
    'status sdk': `{${head},"status":{"goo":"pass"},"steps":[]}`,
    'inherited status': `{${head},"status":{"js":"toString"},"steps":[]}`,
    replica: step('{"r":1,"op":"pull"}'),
    'fractional r': step('{"r":0.5,"op":"pull"}'),
    'missing r': step('{"op":"pull"}'),
    'null r': step('{"r":null,"op":"pull"}'),
    'null step': step('null'),
    replicas: '{"v":1,"id":"x","replicas":0,"init":"ab","steps":[]}',
    'fractional reps': '{"v":1,"id":"x","replicas":1.5,"init":"ab","steps":[]}',
    'trailing doc': `{${head},"steps":[]} {}`,
    'trailing brace': `{${head},"steps":[]} }`,
    'edit no to': step('{"r":0,"op":"edit","from":1}'),
    'edit float': step('{"r":0,"op":"edit","from":1.5,"to":2}'),
    'edit null text': step('{"r":0,"op":"edit","from":1,"to":1,"text":null}'),
    'edit int text': step('{"r":0,"op":"edit","from":1,"to":1,"text":1}'),
    'edit attrs': step('{"r":0,"op":"edit","from":1,"to":1,"attrs":{"b":"1"}}'),
    'style no attrs': step('{"r":0,"op":"style","from":0,"to":1}'),
    'style {} attrs': step('{"r":0,"op":"style","from":0,"to":1,"attrs":{}}'),
    'style int attr': step(
      '{"r":0,"op":"style","from":0,"to":1,"attrs":{"b":1}}',
    ),
    'style null attr': step(
      '{"r":0,"op":"style","from":0,"to":1,"attrs":{"b":null}}',
    ),
    'rs no keys': step('{"r":0,"op":"removeStyle","from":0,"to":1}'),
    'rs empty keys': step(
      '{"r":0,"op":"removeStyle","from":0,"to":1,"keys":[]}',
    ),
    'rs int key': step('{"r":0,"op":"removeStyle","from":0,"to":1,"keys":[1]}'),
    'rs null key': step(
      '{"r":0,"op":"removeStyle","from":0,"to":1,"keys":[null]}',
    ),
    'gen no v': step('{"r":0,"op":"gen","k":"ins","f":0,"g":0,"h":0}'),
    'gen f of 1': step(
      '{"r":0,"op":"gen","k":"ins","f":1,"g":0,"h":0,"v":"c"}',
    ),
    'gen negative h': step(
      '{"r":0,"op":"gen","k":"ins","f":0,"g":0,"h":-0.1,"v":"c"}',
    ),
    'gen int v': step('{"r":0,"op":"gen","k":"ins","f":0,"g":0,"h":0,"v":1}'),
    'pull attrs': step('{"r":0,"op":"pull","attrs":{"b":"1"}}'),
    'undo from': step('{"r":0,"op":"undo","from":0}'),
  };
  for (const [name, body] of Object.entries(bad)) {
    it(`rejects a bad ${name}`, () => {
      expect(() => parseScript(body, 'bad.json')).toThrow(/bad\.json/);
    });
  }

  // The Go runner's rejectsV2 cases, the format v2 rules.
  const v1 = '"v":1,"id":"x","replicas":2';
  const v2 = '"v":2,"id":"x","replicas":2';
  const log = (st: string) => `{${v2},"init":"ab","steps":[${st}]}`;
  const ex = (st: string) =>
    `{${v2},"delivery":"exchange","init":"ab","steps":[${st}]}`;
  const init = (node: string) => `{${v2},"init":${node},"steps":[]}`;
  const edit = '"op":"edit","from":1,"to":1';
  const badV2: Record<string, string> = {
    'v1 expect': `{${v1},"init":"ab","steps":[{"op":"expect","xml":["",""]}]}`,
    'v1 update': `{${v1},"init":"ab","steps":[{"r":0,"op":"update","ops":[{${edit}}]}]}`,
    'v1 tree init': `{${v1},"init":{"type":"doc"},"steps":[]}`,
    'v1 contents': `{${v1},"init":"ab","steps":[{"r":0,${edit},"contents":[{"type":"p"}]}]}`,
    'v1 delivery': `{${v1},"delivery":"log","init":"ab","steps":[]}`,
    delivery: `{${v2},"delivery":"push","init":"ab","steps":[]}`,
    'null delivery': `{${v2},"delivery":null,"init":"ab","steps":[]}`,
    'null init': `{${v2},"init":null,"steps":[]}`,
    'number init': init('1'),
    'text root': init('{"type":"text","value":"a"}'),
    'no type': init('{"children":[]}'),
    'empty type': init('{"type":""}'),
    'element value': init('{"type":"doc","value":"a"}'),
    'element field': init('{"type":"doc","kids":[]}'),
    'text children': init(
      '{"type":"doc","children":[{"type":"text","value":"a","children":[]}]}',
    ),
    'text no value': init('{"type":"doc","children":[{"type":"text"}]}'),
    'text int value': init(
      '{"type":"doc","children":[{"type":"text","value":1}]}',
    ),
    'null child': init('{"type":"doc","children":[null]}'),
    'children object': init('{"type":"doc","children":{}}'),
    'int attribute': init('{"type":"doc","attributes":{"b":1}}'),
    'null attribute': init('{"type":"doc","attributes":{"b":null}}'),
    'gen with tree init':
      `{${v2},"init":{"type":"doc"},"steps":[` +
      '{"r":0,"op":"gen","k":"ins","f":0,"g":0,"h":0,"v":"c"}]}',
    'contents and text': log(
      `{"r":0,${edit},"text":"a","contents":[{"type":"p"}]}`,
    ),
    'empty contents': log(`{"r":0,${edit},"contents":[]}`),
    'contents object': log(`{"r":0,${edit},"contents":{"type":"p"}}`),
    'bad contents node': log(
      `{"r":0,${edit},"contents":[{"type":"p","extra":1}]}`,
    ),
    'update no ops': log('{"r":0,"op":"update"}'),
    'update empty ops': log('{"r":0,"op":"update","ops":[]}'),
    'update nested r': log(`{"r":0,"op":"update","ops":[{"r":0,${edit}}]}`),
    'update nested undo': log('{"r":0,"op":"update","ops":[{"op":"undo"}]}'),
    'update nested update': log(
      `{"r":0,"op":"update","ops":[{"op":"update","ops":[{${edit}}]}]}`,
    ),
    'update nested no to': log(
      '{"r":0,"op":"update","ops":[{"op":"edit","from":1}]}',
    ),
    'update nested no op': log(
      '{"r":0,"op":"update","ops":[{"from":1,"to":1}]}',
    ),
    'update nested null': log('{"r":0,"op":"update","ops":[null]}'),
    'update no r': log(`{"op":"update","ops":[{${edit}}]}`),
    'pull in exchange': ex('{"r":0,"op":"pull"}'),
    'sync in exchange': ex('{"r":0,"op":"sync"}'),
    'exchange in log': log('{"op":"exchange"}'),
    'exchange r': ex('{"r":0,"op":"exchange"}'),
    'exchange null orders': ex('{"op":"exchange","orders":null}'),
    'orders count': ex('{"op":"exchange","orders":[[1]]}'),
    'orders self': ex('{"op":"exchange","orders":[[0],[0]]}'),
    'orders missing': ex('{"op":"exchange","orders":[[],[0]]}'),
    'orders duplicate': ex('{"op":"exchange","orders":[[1,1],[0]]}'),
    'orders out of range': ex('{"op":"exchange","orders":[[2],[0]]}'),
    'orders null order': ex('{"op":"exchange","orders":[[1],null]}'),
    'orders null replica': ex('{"op":"exchange","orders":[[null],[0]]}'),
    'orders fractional': ex('{"op":"exchange","orders":[[1.5],[0]]}'),
    'expect r': log('{"r":0,"op":"expect","xml":["",""]}'),
    'expect no xml': log('{"op":"expect"}'),
    'expect xml count': log('{"op":"expect","xml":[""]}'),
    'expect null xml entry': log('{"op":"expect","xml":["",null]}'),
    'expect int label': log('{"op":"expect","xml":["",""],"label":1}'),
  };
  for (const [name, body] of Object.entries(badV2)) {
    it(`rejects a bad v2 ${name}`, () => {
      expect(() => parseScript(body, 'bad.json')).toThrow(/bad\.json/);
    });
  }
});

describe('Tree conformance: expect', () => {
  // The Go runner's TestExpect: an expect that does not hold fails the run
  // without touching I1-I4.
  for (const [xml, result, checks] of [
    ['<doc><p>ab</p></doc>', 'pass', '11111'],
    ['<doc><p>ba</p></doc>', 'fail', '11110'],
  ]) {
    it(`gives ${result} for ${xml}`, () => {
      const rec = runScript(
        parseScript(
          '{"v":2,"id":"x","replicas":2,"init":"ab","steps":[' +
            `{"op":"expect","xml":["<doc><p>ab</p></doc>","${xml}"]}]}`,
          'x.json',
        ),
      );
      expect(rec.result).toBe(result);
      expect(checksString(rec.checks)).toBe(checks);
    });
  }
});

describe('Tree conformance: replay errors', () => {
  // `replay` hands its error back as a string, and every caller - the I2
  // check and the `!offErr` guards of runScript - reads a replay that threw
  // off its truthiness. A thrower that carries no message of its own must
  // still come back truthy, or an aborted replay is filed as error-free and
  // its digests are taken over half-replayed documents.
  for (const [name, thrown, want] of [
    ['an error with a message', new Error('boom'), 'boom'],
    ['an error without one', new Error(''), 'Error'],
    ['a named error without one', new RangeError(''), 'RangeError'],
    ['an empty string', '', 'thrown string'],
    ['undefined', undefined, 'undefined'],
    ['null', null, 'null'],
    ['zero', 0, '0'],
  ] as Array<[string, unknown, string]>) {
    it(`describes ${name} in a non-empty line`, () => {
      const msg = errMessage(thrown);
      expect(msg).toBe(want);
      expect(msg, 'a thrown value must never read as falsy').toBeTruthy();
    });
  }
});

describe('Tree conformance: element without children', () => {
  // The Go runner's TestElementWithoutChildren: an element node without
  // `children`, the init root or a node of an edit's contents, has none.
  it('reads a missing children as none', () => {
    const rec = runScript(
      parseScript(
        '{"v":2,"id":"x","replicas":2,"init":{"type":"doc"},"steps":[' +
          '{"op":"expect","xml":["<doc></doc>","<doc></doc>"]},' +
          '{"r":0,"op":"edit","from":0,"to":0,"contents":[{"type":"p"}]},' +
          '{"r":1,"op":"sync"}]}',
        'x.json',
      ),
    );
    expect(
      rec.result,
      `checks ${JSON.stringify(rec.checks)}, error ${rec.error}`,
    ).toBe('pass');
    expect(rec.xml).toEqual(['<doc><p></p></doc>', '<doc><p></p></doc>']);
  });
});

/**
 * `wantArrivals` is every delivery an exchange with the given orders
 * (undefined: ascending index) calls for, as Replay.arrivals spells them,
 * keeping only the packs of senders, the replicas that had changes to hand
 * over.
 */
function wantArrivals(
  orders: Array<Array<number>> | undefined,
  n: number,
  senders: Array<number>,
): Array<string> {
  const want: Array<string> = [];
  for (let to = 0; to < n; to++) {
    const order =
      orders?.[to] ??
      Array.from({ length: n }, (_, j) => j).filter((j) => j !== to);
    for (const from of order) {
      if (senders.includes(from)) want.push(`d${to + 1}<-d${from + 1}`);
    }
  }
  return want;
}

describe('Tree conformance: exchange orders', () => {
  // The Go runner's TestExchangeOrders: the exchange step delivers in the
  // arrival order its `orders` declares, in off and minvv mode, and says so
  // in its step line. A runner that parsed `orders` and then delivered in
  // ascending index would converge on every corpus script all the same, so
  // nothing else here would catch it.
  const exchangeScript = (orders: string) =>
    parseScript(
      '{"v":2,"id":"orders","replicas":3,"delivery":"exchange",' +
        '"init":"abc","steps":[' +
        '{"r":0,"op":"edit","from":1,"to":1,"text":"A"},' +
        '{"r":1,"op":"edit","from":2,"to":2,"text":"B"},' +
        '{"r":2,"op":"edit","from":3,"to":3,"text":"C"},' +
        `{"op":"exchange"${orders}}]}`,
      'orders.json',
    );
  const ascending = [
    'd1<-d2',
    'd1<-d3',
    'd2<-d1',
    'd2<-d3',
    'd3<-d1',
    'd3<-d2',
  ];
  for (const [name, orders, arrivals, line] of [
    [
      'absent is ascending index',
      '',
      ascending,
      'exchange d1<-[d2,d3] d2<-[d1,d3] d3<-[d1,d2]',
    ],
    [
      'spelling out the ascending order changes nothing',
      ',"orders":[[1,2],[0,2],[0,1]]',
      ascending,
      'exchange d1<-[d2,d3] d2<-[d1,d3] d3<-[d1,d2]',
    ],
    [
      'every replica reversed',
      ',"orders":[[2,1],[2,0],[1,0]]',
      ['d1<-d3', 'd1<-d2', 'd2<-d3', 'd2<-d1', 'd3<-d2', 'd3<-d1'],
      'exchange d1<-[d3,d2] d2<-[d3,d1] d3<-[d2,d1]',
    ],
    [
      'the order the split-order-*-3 scripts use',
      ',"orders":[[2,1],[0,2],[1,0]]',
      ['d1<-d3', 'd1<-d2', 'd2<-d1', 'd2<-d3', 'd3<-d2', 'd3<-d1'],
      'exchange d1<-[d3,d2] d2<-[d1,d3] d3<-[d2,d1]',
    ],
  ] as Array<[string, string, Array<string>, string]>) {
    it(name, () => {
      const script = exchangeScript(orders);
      for (const mode of ['off', 'minvv'] as Array<Mode>) {
        const [rn, err] = replay(script, mode);
        expect(err).toBeUndefined();
        // Two exchanges run: the step, then the end-of-run one, which
        // delivers nothing because the step handed over and acked every
        // replica's changes.
        expect(rn.arrivals, mode).toEqual([arrivals, []]);
      }

      const rec = runScript(script);
      expect(rec.result, `error ${rec.error}`).toBe('pass');
      expect(rec.steps).toContain(line);
    });
  }

  // The Go runner's TestExchangeOrdersCorpus: every exchange of the corpus
  // scripts with `exchange` delivery, in off and minvv mode, delivers
  // exactly what its orders call for. A known-error script is held to the
  // exchanges that completed before the error.
  it(
    'holds every corpus exchange to its orders',
    () => {
      let declared = 0;
      let delivered = 0;
      for (const file of jsonFiles(CorpusDir)) {
        const script = parseScript(
          readFileSync(path.join(CorpusDir, file), 'utf8'),
          file,
        );
        if (script.delivery !== 'exchange') continue;
        const orders: Array<Array<Array<number>> | undefined> = [];
        for (const st of script.steps) {
          if (st.op !== 'exchange') continue;
          orders.push(st.orders);
          if (st.orders) declared++;
        }
        // The end-of-run exchange, with default orders.
        orders.push(undefined);

        for (const mode of ['off', 'minvv'] as Array<Mode>) {
          const [rn, err] = replay(script, mode);
          if (script.status?.js !== 'known-error') {
            expect(err, `${file} (${mode})`).toBeUndefined();
            expect(rn.arrivals.length, `${file} (${mode})`).toBe(orders.length);
          }
          rn.arrivals.forEach((got, k) => {
            expect(got, `${file}: exchange ${k} (${mode})`).toEqual(
              wantArrivals(orders[k], script.replicas, rn.senders[k]),
            );
            delivered += got.length;
          });
        }
      }
      expect(declared, 'no corpus script declares orders').toBeGreaterThan(0);
      expect(
        delivered,
        'no corpus exchange delivered anything',
      ).toBeGreaterThan(0);
    },
    Timeout,
  );
});

describe('Tree conformance: parity with Go', () => {
  for (const family of Object.keys(FixtureFamilies)) {
    it(
      `${family}.json`,
      () => {
        const file = path.join(ParityDir, `${family}.json`);
        expect(existsSync(file), `${file} is missing; re-sync`).toBe(true);
        const fx: ParityFixture = JSON.parse(readFileSync(file, 'utf8'));
        expect(fx.rows.length, `${file}: rows do not match runs`).toBe(fx.runs);

        const { fam, n, steps, rows } = genRows(
          family,
          ParitySeed0,
          ParityRuns,
        );
        const diverged = rows.filter((r) => r.result === 'diverged').length;
        const head = {
          fam: fx.fam,
          n: fx.n,
          steps: fx.steps,
          seed0: fx.seed0,
          runs: fx.runs,
          diverged: fx.diverged,
        };
        expect(
          head,
          `${file}: header differs from the regenerated one`,
        ).toEqual({
          fam,
          n,
          steps,
          seed0: ParitySeed0,
          runs: ParityRuns,
          diverged,
        });

        const mismatches = [];
        for (let i = 0; i < fx.rows.length; i++) {
          const w = fx.rows[i];
          const g = rows[i];
          if (
            g.seed !== w.seed ||
            g.result !== w.result ||
            g.checks !== w.checks ||
            g.digest !== w.digest ||
            g.xmlDigest !== w.xmlDigest
          ) {
            mismatches.push({ want: w, got: g });
          }
        }
        expect(
          mismatches.slice(0, 5),
          `${mismatches.length} rows differ`,
        ).toEqual([]);
      },
      Timeout,
    );
  }
});

describe.skipIf(!process.env.CONFORMANCE_FAM)(
  'Tree conformance: large run (opt-in)',
  () => {
    it('writes rows', () => {
      const family = process.env.CONFORMANCE_FAM!;
      expect(
        FixtureFamilies[family],
        `unknown family: ${family}`,
      ).toBeDefined();
      const runs = Number(process.env.CONFORMANCE_RUNS ?? 5000);
      const seed0 = Number(process.env.CONFORMANCE_SEED0 ?? 1);
      const { fam, n, steps, rows } = genRows(family, seed0, runs);
      const diverged = rows.filter((r) => r.result === 'diverged').length;
      const out = { fam, n, steps, seed0, runs, diverged, rows };
      if (process.env.CONFORMANCE_OUT) {
        writeFileSync(process.env.CONFORMANCE_OUT, JSON.stringify(out));
      }
    }, 3_600_000);
  },
);
