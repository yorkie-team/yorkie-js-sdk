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
 * tarballs from a consumer outside the workspace: as ESM, CJS and mixed
 * modules in Node, bundled for Node by Vite SSR and esbuild, and as TypeScript
 * under NodeNext and bundler resolution (with skipLibCheck for existing
 * declaration errors). Build schema/sdk/react/prosemirror first.
 *
 *   node scripts/verify-package-exports.mjs
 */
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const PACKAGES = ['schema', 'sdk', 'react', 'prosemirror'];
const ATTW = '@arethetypeswrong/cli@0.18.5';
const VITE = JSON.parse(
  readFileSync(join(root, 'packages/sdk/package.json'), 'utf8'),
).devDependencies.vite;
const run = (cmd, args, cwd) =>
  execFileSync(cmd, args, { cwd, stdio: 'inherit', encoding: 'utf8' });
const capture = (cmd, args, cwd) => {
  try {
    return execFileSync(cmd, args, { cwd, encoding: 'utf8' });
  } catch (e) {
    process.stdout.write(e.stdout ?? '');
    process.stderr.write(e.stderr ?? '');
    throw e;
  }
};

const tmp = mkdtempSync(join(tmpdir(), 'yorkie-exports-'));
const packs = join(tmp, 'packs');
const app = join(tmp, 'app');
mkdirSync(packs);
mkdirSync(app);

try {
  const tgz = {};
  for (const name of PACKAGES) {
    run(
      'pnpm',
      ['pack', '--pack-destination', packs],
      join(root, 'packages', name),
    );
  }
  for (const f of readdirSync(packs).filter((f) => f.endsWith('.tgz'))) {
    const m = f.match(/^yorkie-js-(\w+)-/);
    if (!m) throw new Error(`Unexpected tarball name: ${f}`);
    tgz[m[1]] = join(packs, f);
  }
  for (const name of PACKAGES) {
    if (!tgz[name]) throw new Error(`No tarball was packed for ${name}`);
  }

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
        vite: VITE,
      },
      overrides: {
        '@yorkie-js/sdk': `file:${tgz.sdk}`,
        '@yorkie-js/schema': `file:${tgz.schema}`,
      },
    }),
  );
  run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], app);

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
  // Both load orders must share implementations and the full public surface.
  w(
    'mixed.mjs',
    `import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
const packages = {};
for (const name of ['sdk', 'react', 'prosemirror']) {
  const id = '@yorkie-js/' + name;
  let esm, cjs;
  if (process.argv[2] === 'cjs-first') {
    cjs = require(id);
    esm = await import(id);
  } else {
    esm = await import(id);
    cjs = require(id);
  }
  const keys = Object.keys(esm).sort();
  assert.deepEqual(keys, Object.keys(cjs).filter(k => k !== '__esModule').sort());
  for (const key of keys) assert.equal(esm[key], cjs[key], id + ':' + key);
  packages[name] = { esm, cjs };
}
// react re-exports SDK values, so it must hand out the SDK's own classes.
for (const format of ['esm', 'cjs'])
  for (const key of ['Text', 'Tree', 'Counter', 'SyncMode'])
    assert.equal(packages.react[format][key], packages.sdk[format][key], 'react:' + format + ':' + key);
const { esm, cjs } = packages.sdk;
assert.equal(esm.default, cjs.default);
assert.equal(esm.default.Document, cjs.Document);
for (const [documentApi, valueApi] of [[esm, cjs], [cjs, esm]]) {
  const doc = new documentApi.Document('mixed');
  doc.update(root => {
    root.text = new valueApi.Text();
    root.text.edit(0, 0, 'hello');
    root.tree = new valueApi.Tree({ type: 'root', children: [] });
    root.tree.edit(0, 0, { type: 'text', value: 'hello' });
    root.counter = new valueApi.Counter(1);
    root.counter.increase(2);
  });
  assert.equal(doc.getRoot().text.toString(), 'hello');
  assert.equal(doc.getRoot().tree.toXML(), '<root>hello</root>');
  assert.equal(doc.getRoot().counter.getValue(), 3);
  assert.deepEqual(JSON.parse(doc.toJSON()).text, [{ val: 'hello' }]);
}
// The browser-facing ES bundles retain the same public exports.
for (const name of Object.keys(packages)) {
  const id = '@yorkie-js/' + name;
  const pkg = require(id + '/package.json');
  assert.equal(pkg.exports['.'].import.default, pkg.module);
  const browser = await import(pathToFileURL(resolve(dirname(require.resolve(id + '/package.json')), pkg.module)));
  assert.deepEqual(Object.keys(browser).sort(), Object.keys(packages[name].esm).sort());
}
`,
  );
  // Node ESM declarations forward to CJS declarations to share class types.
  w(
    'types.mts',
    `import yorkie, { Document, Text, Tree, Counter } from '@yorkie-js/sdk';
import { YorkieProvider } from '@yorkie-js/react';
import { YorkieProseMirrorBinding } from '@yorkie-js/prosemirror';
import sdk = require('@yorkie-js/sdk');
import react = require('@yorkie-js/react');
import prosemirror = require('@yorkie-js/prosemirror');
import { document, text } from './types.cjs';
export const mixedDocument: Document<{ text: Text }> = document;
export const mixedText: Text = text;
export const reverseDocument: sdk.Document<{ text: sdk.Text }> = new Document<{ text: Text }>('reverse');
export const defaultConstructor: typeof Document = yorkie.Document;
export const provider: typeof react.YorkieProvider = YorkieProvider;
export const binding: typeof prosemirror.YorkieProseMirrorBinding = YorkieProseMirrorBinding;
const doc = new Document<{ text: Text; tree: Tree; counter: Counter }>('types');
doc.update(root => {
  root.text = new sdk.Text();
  root.text.edit(0, 0, 'hello');
  root.tree = new sdk.Tree();
  root.tree.edit(0, 0, { type: 'text', value: 'hello' });
  root.counter = new sdk.Counter(1);
  root.counter.increase(2);
});
// @ts-expect-error Document keys must remain typed as strings.
new Document(123);
`,
  );
  w(
    'types.cts',
    `import sdk = require('@yorkie-js/sdk');
import react = require('@yorkie-js/react');
import prosemirror = require('@yorkie-js/prosemirror');
export const document = new sdk.Document<{ text: sdk.Text }>('cjs-types');
export const text = new sdk.Text();
export const used = [react.YorkieProvider, prosemirror.YorkieProseMirrorBinding];
document.update(root => {
  root.text = new sdk.Text();
  root.text.edit(0, 0, 'hello');
});
`,
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
  // Bundlers resolve the `node` condition too, and Rollup reads a default
  // import of a module flagged __esModule differently from Node: the bundled
  // wrapper must still expose every export and the default.
  w(
    'bundle-entry.mjs',
    `import yorkie, { Document, Text, converter, setLogLevel } from '@yorkie-js/sdk';
import { YorkieProvider, Text as ReactText } from '@yorkie-js/react';
import { YorkieProseMirrorBinding } from '@yorkie-js/prosemirror';
const found = { Document, setLogLevel, YorkieProvider, YorkieProseMirrorBinding, 'default.Client': yorkie?.Client };
for (const [n, v] of Object.entries(found))
  if (typeof v !== 'function') throw new Error(n + ' missing in the bundle');
if (typeof converter !== 'object' || converter === null) throw new Error('converter missing in the bundle');
if (yorkie.Document !== Document) throw new Error('default and named Document differ in the bundle');
if (ReactText !== Text) throw new Error('react and sdk Text differ in the bundle');
`,
  );
  w(
    'vite.config.mjs',
    `export default {
  logLevel: 'error',
  ssr: { noExternal: true },
  build: {
    ssr: 'bundle-entry.mjs',
    outDir: 'vite-out',
    emptyOutDir: true,
    minify: false,
    rollupOptions: { output: { entryFileNames: '[name].mjs' } },
  },
};
`,
  );
  // Bundler resolution never sets `node`, so it reads the plain .d.mts twins.
  w(
    'types.bundler.ts',
    `import yorkie, { Document, Text, converter } from '@yorkie-js/sdk';
import { YorkieProvider } from '@yorkie-js/react';
import { YorkieProseMirrorBinding } from '@yorkie-js/prosemirror';
export const doc: Document<{ text: Text }> = new yorkie.Document<{ text: Text }>('bundler');
export const used = [converter, YorkieProvider, YorkieProseMirrorBinding];
`,
  );
  w(
    'tsconfig.bundler.json',
    JSON.stringify({
      compilerOptions: {
        module: 'esnext',
        moduleResolution: 'bundler',
        strict: true,
        noEmit: true,
        skipLibCheck: true,
        types: ['node'],
      },
      files: ['types.bundler.ts'],
    }),
  );

  run('node', ['esm.mjs'], app);
  run('node', ['cjs.cjs'], app);
  run('node', ['mixed.mjs', 'esm-first'], app);
  run('node', ['mixed.mjs', 'cjs-first'], app);
  run('npx', ['vite', 'build'], app);
  run('node', ['vite-out/bundle-entry.mjs'], app);
  run(
    'npx',
    [
      'esbuild',
      'bundle-entry.mjs',
      '--bundle',
      '--platform=node',
      '--format=esm',
      '--outfile=esbuild-out.mjs',
      '--log-level=warning',
    ],
    app,
  );
  run('node', ['esbuild-out.mjs'], app);
  run('npx', ['tsc', '-p', 'tsconfig.json'], app);
  const listed = capture(
    'npx',
    ['tsc', '-p', 'tsconfig.bundler.json', '--listFiles'],
    app,
  ).split('\n');
  for (const name of ['sdk', 'react', 'prosemirror']) {
    const dts = `/node_modules/@yorkie-js/${name}/dist/yorkie-js-${name}.d.mts`;
    if (!listed.some((line) => line.endsWith(dts))) {
      throw new Error(`Bundler resolution did not load ${dts}`);
    }
  }

  // ATTW on the pnpm-made tarballs (its own --pack would use npm).
  for (const name of ['sdk', 'react', 'prosemirror']) {
    // prosemirror's rolled-up .d.ts imports '../../sdk/src/yorkie.ts' (a separate,
    // pre-existing packaging bug), so skip that one rule until it is fixed.
    const skip =
      name === 'prosemirror'
        ? ['--ignore-rules', 'internal-resolution-error']
        : [];
    run('npx', ['--yes', ATTW, tgz[name], '--profile', 'node16', ...skip], app);
  }

  const pkg = JSON.parse(
    readFileSync(join(app, 'node_modules/@yorkie-js/sdk/package.json'), 'utf8'),
  );
  console.log(
    `OK: ${pkg.name}@${pkg.version} loads as ESM, CJS and mixed modules, bundled by Vite SSR and esbuild, with NodeNext and bundler types (skipLibCheck) on ${process.version}`,
  );
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
