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
import assert from 'node:assert/strict';
import {
  copyFileSync,
  existsSync,
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
const fixture = join(root, 'scripts/fixtures/package-exports');
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
  const tgz = Object.create(null);
  for (const name of PACKAGES) {
    run(
      'pnpm',
      ['--config.ignore-scripts=true', 'pack', '--pack-destination', packs],
      join(root, 'packages', name),
    );
  }
  for (const f of readdirSync(packs).filter((f) => f.endsWith('.tgz'))) {
    const m = f.match(/^yorkie-js-(schema|sdk|react|prosemirror)-[^/]+\.tgz$/);
    if (!m) throw new Error(`Unexpected tarball name: ${f}`);
    if (tgz[m[1]]) throw new Error(`Duplicate tarball for ${m[1]}: ${f}`);
    tgz[m[1]] = join(packs, f);
  }
  for (const name of PACKAGES) {
    if (!tgz[name]) throw new Error(`No tarball was packed for ${name}`);
  }

  // Lock the tools and runtime peers first. Installing the local tarballs
  // offline reuses these exact dependencies; it cannot fetch a fallback CLI
  // or mask duplicate SDK installations with an override. The lockfile also
  // pins the sdk's own dependencies: when those change, regenerate it with
  // `npm install --package-lock-only` in the fixture directory.
  for (const name of ['package.json', 'package-lock.json']) {
    copyFileSync(join(fixture, name), join(app, name));
  }
  run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], app);
  run(
    'npm',
    [
      'install',
      '--offline',
      '--ignore-scripts',
      '--strict-peer-deps',
      '--no-audit',
      '--no-fund',
      ...PACKAGES.map((name) => tgz[name]),
    ],
    app,
  );
  const tool = (name, bin) => {
    const directory = join(app, 'node_modules', name);
    const pkg = JSON.parse(
      readFileSync(join(directory, 'package.json'), 'utf8'),
    );
    const entry = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin[bin];
    assert.equal(typeof entry, 'string', `${name} has no ${bin} binary`);
    const file = resolve(directory, entry);
    assert.ok(existsSync(file), `${name} binary is missing: ${file}`);
    return file;
  };
  const vite = tool('vite', 'vite');
  const esbuild = tool('esbuild', 'esbuild');
  const tsc = tool('typescript', 'tsc');
  const attw = tool('@arethetypeswrong/cli', 'attw');

  // A mismatched host SDK must be rejected, rather than silently repaired
  // by installing the React peer as a nested SDK. Reuse the real tarball with
  // only its version changed, and resolve offline against the locked consumer.
  const incompatible = join(tmp, 'incompatible');
  mkdirSync(incompatible);
  run('tar', ['-xzf', tgz.sdk, '-C', incompatible], tmp);
  const sdkManifestPath = join(incompatible, 'package/package.json');
  const incompatibleSdk = JSON.parse(readFileSync(sdkManifestPath, 'utf8'));
  incompatibleSdk.version = '999.0.0';
  writeFileSync(sdkManifestPath, JSON.stringify(incompatibleSdk));
  const incompatibleTarball = join(tmp, 'incompatible-sdk.tgz');
  run('tar', ['-czf', incompatibleTarball, 'package'], incompatible);
  const conflict = join(tmp, 'peer-conflict');
  mkdirSync(conflict);
  const conflictManifest = JSON.parse(
    readFileSync(join(app, 'package.json'), 'utf8'),
  );
  conflictManifest.dependencies['@yorkie-js/sdk'] =
    `file:${incompatibleTarball}`;
  delete conflictManifest.dependencies['@yorkie-js/prosemirror'];
  writeFileSync(
    join(conflict, 'package.json'),
    JSON.stringify(conflictManifest),
  );
  copyFileSync(
    join(app, 'package-lock.json'),
    join(conflict, 'package-lock.json'),
  );
  let peerError;
  try {
    execFileSync(
      'npm',
      [
        'install',
        '--package-lock-only',
        '--offline',
        '--ignore-scripts',
        '--strict-peer-deps',
        '--no-audit',
        '--no-fund',
      ],
      { cwd: conflict, encoding: 'utf8', stdio: 'pipe' },
    );
  } catch (error) {
    peerError = error.stderr;
  }
  assert.match(
    peerError ?? '',
    /ERESOLVE/,
    'An incompatible host SDK must fail peer resolution',
  );

  const w = (f, s) => writeFileSync(join(app, f), s);
  // Runtime: ESM named imports and CJS require.
  w(
    'esm.mjs',
    `import yorkie, { Document } from '@yorkie-js/sdk';
import { YorkieProvider } from '@yorkie-js/react';
import { YorkieProseMirrorBinding } from '@yorkie-js/prosemirror';
import sdkPkg from '@yorkie-js/sdk/package.json' with { type: 'json' };
import { createRequire } from 'node:module';
for (const [n, v] of Object.entries({ Document, YorkieProvider, YorkieProseMirrorBinding }))
  if (typeof v !== 'function') throw new Error(n + ' missing in ESM');
if (typeof yorkie?.Client !== 'function') throw new Error('sdk default missing in ESM');
if (!sdkPkg.version) throw new Error('package.json export missing');
// prosemirror's peers ship separate ESM and CJS builds, so a Node import of
// the binding must use their ESM builds: the copies the app itself imports.
const cjsPeers = Object.keys(createRequire(import.meta.url).cache).filter(f => /node_modules.prosemirror-/.test(f));
if (cjsPeers.length) throw new Error('prosemirror peers loaded as CJS: ' + cjsPeers.join(', '));
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
import { existsSync, realpathSync } from 'node:fs';
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
  // prosemirror's Node import is its ES bundle (see esm.mjs), so only sdk and
  // react hand the same values to import and require.
  if (name !== 'prosemirror')
    for (const key of keys) assert.equal(esm[key], cjs[key], id + ':' + key);
  packages[name] = { esm, cjs };
}
// react re-exports SDK values, so it must hand out the SDK's own classes.
for (const format of ['esm', 'cjs'])
  for (const key of ['Text', 'Tree', 'Counter', 'SyncMode'])
    assert.equal(packages.react[format][key], packages.sdk[format][key], 'react:' + format + ':' + key);
// A peer must resolve the host's SDK without an override or nested copy.
const reactRequire = createRequire(require.resolve('@yorkie-js/react'));
assert.equal(realpathSync(reactRequire.resolve('@yorkie-js/sdk')), realpathSync(require.resolve('@yorkie-js/sdk')));
const reactPkg = require('@yorkie-js/react/package.json');
assert.equal(reactPkg.dependencies?.['@yorkie-js/sdk'], undefined);
assert.equal(reactPkg.unpkg, './dist/yorkie-js-react.js');
assert.equal(reactPkg.jsdelivr, reactPkg.unpkg);
assert.equal(reactPkg.exports['.'].unpkg, reactPkg.unpkg);
assert.equal(reactPkg.peerDependencies['@yorkie-js/sdk'], require('@yorkie-js/sdk/package.json').version);
// Every exported runtime/declaration path must exist in the installed tarball.
function checkTargets(target, directory) {
  if (typeof target === 'string') assert.ok(existsSync(resolve(directory, target)), target + ' is missing');
  else for (const value of Object.values(target)) checkTargets(value, directory);
}
for (const name of Object.keys(packages)) {
  const id = '@yorkie-js/' + name;
  checkTargets(require(id + '/package.json').exports, dirname(require.resolve(id + '/package.json')));
}
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
import { YorkieProvider, Text as ReactText, Tree as ReactTree, Counter as ReactCounter } from '@yorkie-js/react';
import { YorkieProseMirrorBinding } from '@yorkie-js/prosemirror';
import sdk = require('@yorkie-js/sdk');
import react = require('@yorkie-js/react');
import prosemirror = require('@yorkie-js/prosemirror');
import { document, text } from './types.cjs';
export const mixedDocument: Document<{ text: Text }> = document;
export const mixedText: Text = text;
export const reactText: Text = new ReactText();
export const reactTree: Tree = new ReactTree();
export const reactCounter: Counter = new ReactCounter(1);
export const reverseDocument: sdk.Document<{ text: sdk.Text }> = new Document<{ text: Text }>('reverse');
export const defaultConstructor: typeof Document = yorkie.Document;
export const provider: typeof react.YorkieProvider = YorkieProvider;
// prosemirror's Node import is its ES bundle, so its ESM and CJS types are
// separate declarations: check that both resolve, not that they match.
export const bindings = [YorkieProseMirrorBinding, prosemirror.YorkieProseMirrorBinding];
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
import { YorkieProvider, Text as ReactText, Tree as ReactTree, Counter as ReactCounter, SyncMode as ReactSyncMode } from '@yorkie-js/react';
import { Tree, Counter, SyncMode } from '@yorkie-js/sdk';
import { YorkieProseMirrorBinding } from '@yorkie-js/prosemirror';
const found = { Document, setLogLevel, YorkieProvider, YorkieProseMirrorBinding, 'default.Client': yorkie?.Client };
for (const [n, v] of Object.entries(found))
  if (typeof v !== 'function') throw new Error(n + ' missing in the bundle');
if (typeof converter !== 'object' || converter === null) throw new Error('converter missing in the bundle');
if (yorkie.Document !== Document) throw new Error('default and named Document differ in the bundle');
for (const [name, left, right] of [['Text', ReactText, Text], ['Tree', ReactTree, Tree], ['Counter', ReactCounter, Counter], ['SyncMode', ReactSyncMode, SyncMode]])
  if (left !== right) throw new Error('react and sdk ' + name + ' differ in the bundle');
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

  w(
    'umd.cjs',
    `const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { dirname, join } = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({
  React: require('react'), jsxRuntime: require('react/jsx-runtime'),
  console, setTimeout, clearTimeout, TextEncoder, TextDecoder, URL,
});
const reactDirectory = dirname(require.resolve('@yorkie-js/react/package.json'));
vm.runInContext(readFileSync(join(reactDirectory, 'dist/yorkie-js-react.js'), 'utf8'), context);
assert.equal(context['yorkie-js-sdk'], undefined);
const react = context['yorkie-js-react'];
for (const name of ['Text', 'Tree', 'Counter', 'YorkieProvider']) assert.equal(typeof react[name], 'function');
assert.ok(new react.Text() instanceof react.Text);
assert.ok(new react.Tree() instanceof react.Tree);
assert.equal(new react.Counter(1).getValue(), 1);
assert.deepEqual(Object.keys(react).sort(), Object.keys(require('@yorkie-js/react')).sort());
// ProseMirror's UMD reads the SDK from a YorkieSdk global (a pre-existing
// name the SDK UMD does not register), so a page aliases it.
const sdkDirectory = dirname(require.resolve('@yorkie-js/sdk/package.json'));
vm.runInContext(readFileSync(join(sdkDirectory, 'dist/yorkie-js-sdk.js'), 'utf8'), context);
context.YorkieSdk = context['yorkie-js-sdk'];
context.ProsemirrorModel = require('prosemirror-model');
context.ProsemirrorState = require('prosemirror-state');
context.ProsemirrorView = require('prosemirror-view');
context.ProsemirrorTransform = require('prosemirror-transform');
const pmDirectory = dirname(require.resolve('@yorkie-js/prosemirror/package.json'));
vm.runInContext(readFileSync(join(pmDirectory, 'dist/yorkie-js-prosemirror.js'), 'utf8'), context);
assert.equal(typeof context['yorkie-js-prosemirror'].YorkieProseMirrorBinding, 'function');
`,
  );

  run('node', ['esm.mjs'], app);
  run('node', ['cjs.cjs'], app);
  run('node', ['umd.cjs'], app);
  const cdnEntry = capture(
    process.execPath,
    [
      '--conditions=unpkg',
      '--input-type=module',
      '-e',
      "console.log(import.meta.resolve('@yorkie-js/react'))",
    ],
    app,
  ).trim();
  assert.ok(
    cdnEntry.endsWith('/dist/yorkie-js-react.js'),
    'UNPKG must resolve the legacy UMD entry',
  );
  run('node', ['mixed.mjs', 'esm-first'], app);
  run('node', ['mixed.mjs', 'cjs-first'], app);
  run(process.execPath, [vite, 'build'], app);
  run('node', ['vite-out/bundle-entry.mjs'], app);
  run(
    process.execPath,
    [
      esbuild,
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
  run(
    process.execPath,
    [
      esbuild,
      'bundle-entry.mjs',
      '--bundle',
      '--platform=browser',
      '--format=esm',
      '--outfile=browser-out.mjs',
      '--log-level=warning',
    ],
    app,
  );
  run('node', ['browser-out.mjs'], app);
  run(process.execPath, [tsc, '-p', 'tsconfig.json'], app);
  const listed = capture(
    process.execPath,
    [tsc, '-p', 'tsconfig.bundler.json', '--listFiles'],
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
    run(
      process.execPath,
      [attw, tgz[name], '--profile', 'node16', ...skip],
      app,
    );
  }

  const pkg = JSON.parse(
    readFileSync(join(app, 'node_modules/@yorkie-js/sdk/package.json'), 'utf8'),
  );
  console.log(
    `OK: ${pkg.name}@${pkg.version} loads as ESM, CJS and mixed modules, bundled by Vite SSR and esbuild, with legacy UMD, NodeNext and bundler types (skipLibCheck) on ${process.version}`,
  );
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
