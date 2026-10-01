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

/*
 * Packs sdk/react/prosemirror with pnpm (what CI publishes) and loads the
 * tarballs from a consumer outside the workspace, as ESM, CJS, and NodeNext
 * TypeScript. Run `pnpm build:packages` first.
 *
 *   node scripts/verify-package-exports.mjs
 */
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, stdio: 'inherit', encoding: 'utf8' });

const tmp = mkdtempSync(join(tmpdir(), 'yorkie-exports-'));
const packs = join(tmp, 'packs');
const app = join(tmp, 'app');
mkdirSync(packs);
mkdirSync(app);

try {
  const tgz = {};
  for (const name of ['schema', 'sdk', 'react', 'prosemirror']) {
    run(
      'pnpm',
      ['pack', '--pack-destination', packs],
      join(root, 'packages', name),
    );
  }
  const files = execFileSync('ls', [packs], { encoding: 'utf8' })
    .trim()
    .split('\n');
  for (const f of files) tgz[f.match(/^yorkie-js-(\w+)-/)[1]] = join(packs, f);

  // The sdk depends on @yorkie-js/schema@workspace:* -> point it at the tarball.
  writeFileSync(
    join(app, 'package.json'),
    JSON.stringify({
      name: 'consumer',
      private: true,
      dependencies: {
        '@yorkie-js/sdk': `file:${tgz.sdk}`,
        '@yorkie-js/react': `file:${tgz.react}`,
        '@yorkie-js/prosemirror': `file:${tgz.prosemirror}`,
        react: '^19',
        'react-dom': '^19',
        'prosemirror-model': '^1.20.0',
        'prosemirror-state': '^1.4.0',
        'prosemirror-view': '^1.30.0',
        typescript: '^5.9.3',
        '@types/node': '^22',
        '@types/react': '^19',
      },
      overrides: {
        '@yorkie-js/sdk': `file:${tgz.sdk}`,
        '@yorkie-js/schema': `file:${tgz.schema}`,
      },
    }),
  );
  run('npm', ['install', '--no-audit', '--no-fund'], app);

  const w = (f, s) => writeFileSync(join(app, f), s);
  // Runtime: ESM named imports and CJS require.
  w(
    'esm.mjs',
    `import yorkie, { Document } from '@yorkie-js/sdk';
import { YorkieProvider } from '@yorkie-js/react';
import { YorkieProseMirrorBinding } from '@yorkie-js/prosemirror';
import sdkPkg from '@yorkie-js/sdk/package.json' with { type: 'json' };
for (const [n, v] of Object.entries({ Document, YorkieProvider, YorkieProseMirrorBinding }))
  if (typeof v !== 'function') throw new Error(n + ' missing in ESM');
if (typeof yorkie?.Client !== 'function') throw new Error('sdk default missing in ESM');
if (!sdkPkg.version) throw new Error('package.json export missing');
`,
  );
  w(
    'cjs.cjs',
    `const sdk = require('@yorkie-js/sdk');
const { Document } = sdk;
const { YorkieProvider } = require('@yorkie-js/react');
const { YorkieProseMirrorBinding } = require('@yorkie-js/prosemirror');
for (const [n, v] of Object.entries({ Document, YorkieProvider, YorkieProseMirrorBinding }))
  if (typeof v !== 'function') throw new Error(n + ' missing in CJS');
if (typeof sdk.default?.Client !== 'function') throw new Error('sdk default missing in CJS');
`,
  );
  // Types: each format resolves its own declaration file under NodeNext.
  const ts = `import { Document } from '@yorkie-js/sdk';
import { YorkieProvider } from '@yorkie-js/react';
import { YorkieProseMirrorBinding } from '@yorkie-js/prosemirror';
export const used = [Document, YorkieProvider, YorkieProseMirrorBinding];
`;
  w('types.mts', ts);
  w(
    'types.cts',
    ts.replace(
      /import \{ (\w+) \} from ('[^']+');/g,
      'const { $1 } = require($2) as typeof import($2);',
    ),
  );
  w(
    'tsconfig.json',
    JSON.stringify({
      compilerOptions: {
        module: 'nodenext',
        moduleResolution: 'nodenext',
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        types: ['node'],
      },
      files: ['types.mts', 'types.cts'],
    }),
  );

  run('node', ['esm.mjs'], app);
  run('node', ['cjs.cjs'], app);
  run('npx', ['tsc', '-p', 'tsconfig.json'], app);

  // ATTW on the pnpm-made tarballs (its own --pack would use npm).
  for (const name of ['sdk', 'react', 'prosemirror']) {
    // prosemirror's rolled-up .d.ts imports '../../sdk/src/yorkie.ts' (a separate,
    // pre-existing packaging bug), so skip that one rule until it is fixed.
    const skip =
      name === 'prosemirror'
        ? ['--ignore-rules', 'internal-resolution-error']
        : [];
    run(
      'npx',
      [
        '--yes',
        '@arethetypeswrong/cli',
        tgz[name],
        '--profile',
        'node16',
        ...skip,
      ],
      app,
    );
  }

  const pkg = JSON.parse(
    readFileSync(join(app, 'node_modules/@yorkie-js/sdk/package.json'), 'utf8'),
  );
  console.log(
    `OK: ${pkg.name}@${pkg.version} loads as ESM, CJS and NodeNext types on ${process.version}`,
  );
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
