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
import { describe, it, expect } from 'vitest';
import { LogLevel, setLogLevel } from '@yorkie-js/sdk/src/util/logger';
import { parseScript, runScript, StatusResults } from './runner';
import { FixtureFamilies, gen } from './generator';

const TreeDir = path.join(__dirname, 'tree');
const CorpusDir = path.join(TreeDir, 'corpus');
const ParityDir = path.join(TreeDir, 'parity');
const ParitySeed0 = 1;
const ParityRuns = 200;

// Each test replays hundreds of scripts; CI's default 5s is too short.
const Timeout = 120_000;

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
      digest: rec.digest,
      xmlDigest: rec.xmlDigest,
    });
  }
  return { fam, n, steps, rows };
}

setLogLevel(LogLevel.Fatal);

describe('Tree conformance: corpus', () => {
  const files = jsonFiles(CorpusDir);

  it('has a corpus', () => {
    expect(files.length, `no scripts in ${CorpusDir}`).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(file, () => {
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
          `${rec.error ? `, error ${rec.error}` : ''}): update status.js ` +
          `in yorkie's test/conformance/tree/corpus and re-sync if the ` +
          `change is intended\n${rec.steps.join('\n')}`,
      ).toBe(StatusResults[status!]);
    });
  }
});

describe('Tree conformance: script loading', () => {
  const head = '"v":1,"id":"x","replicas":1,"init":"ab"';
  const bad: Record<string, string> = {
    version: '{"v":2,"id":"x","replicas":1,"init":"ab","steps":[]}',
    field: `{${head},"steps":[],"extra":1}`,
    'step field': `{${head},"steps":[{"r":0,"op":"pull","form":1}]}`,
    op: `{${head},"steps":[{"r":0,"op":"insert"}]}`,
    'gen kind': `{${head},"steps":[{"r":0,"op":"gen","k":"move"}]}`,
    status: `{${head},"status":{"js":"diverged"},"steps":[]}`,
    replica: `{${head},"steps":[{"r":1,"op":"pull"}]}`,
  };
  for (const [name, body] of Object.entries(bad)) {
    it(`rejects a bad ${name}`, () => {
      expect(() => parseScript(body, 'bad.json')).toThrow(/bad\.json/);
    });
  }
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
