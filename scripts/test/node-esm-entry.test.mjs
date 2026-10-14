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

// Tests for the Node ESM entry generator. Every case plants its tree under the
// OS temp directory, as the sibling suites do, and imports the generated
// wrapper from there to check what it actually hands to consumers.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL, URL } from 'node:url';

import { copyEsmDeclarations, nodeEsmEntry } from '../node-esm-entry.mjs';

function generate(format, chunk, options) {
  const files = {};
  const ctx = {
    emitFile: ({ fileName, source }) => {
      files[fileName] = source;
    },
  };
  nodeEsmEntry(options).generateBundle.call(
    ctx,
    { format },
    { [chunk.fileName]: chunk },
  );
  return files;
}

function entry(fileName, exports) {
  return { type: 'chunk', isEntry: true, fileName, exports };
}

async function withTree(files, body) {
  const root = mkdtempSync(path.join(tmpdir(), 'node-esm-entry-'));
  try {
    for (const [rel, contents] of Object.entries(files)) {
      writeFileSync(path.join(root, rel), contents);
    }
    return await body(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

const importFrom = (root, rel) => import(pathToFileURL(path.join(root, rel)));

// What a Rollup UMD build of an entry with a default export looks like to
// require(): every export on module.exports, flagged __esModule.
const CJS_WITH_DEFAULT = `Object.defineProperty(exports, '__esModule', { value: true });
class Document {}
exports.Document = Document;
exports.helper = { kind: 'helper' };
exports.default = { Document };
`;

test('ignores formats other than umd and chunks that are not entries', () => {
  assert.deepEqual(generate('es', entry('lib.js', ['Document'])), {});
  assert.deepEqual(
    generate('umd', { ...entry('lib.js', ['Document']), isEntry: false }),
    {},
  );
});

test('emits a wrapper and declarations next to the UMD entry', () => {
  const files = generate('umd', entry('lib.js', ['Document', 'default']));
  assert.deepEqual(Object.keys(files).sort(), [
    'lib.node.d.mts',
    'lib.node.mjs',
  ]);
  assert.match(files['lib.node.d.mts'], /^export \* from "\.\/lib\.js";$/m);
  assert.match(files['lib.node.d.mts'], /^export default defaultExport;$/m);

  const noDefault = generate('umd', entry('lib.js', ['Document']));
  assert.equal(noDefault['lib.node.d.mts'], 'export * from "./lib.js";\n');
});

test('reads module.exports when the importer hands it over whole (Node, esbuild, webpack)', async () => {
  const files = generate(
    'umd',
    entry('lib.js', ['Document', 'default', 'helper']),
  );
  await withTree(
    { 'package.json': '{}', 'lib.js': CJS_WITH_DEFAULT, ...files },
    async (root) => {
      const cjs = (await importFrom(root, 'lib.js')).default;
      const wrapper = await importFrom(root, 'lib.node.mjs');
      assert.equal(wrapper.Document, cjs.Document);
      assert.equal(wrapper.helper, cjs.helper);
      assert.equal(wrapper.default, cjs.default);
    },
  );
});

test('reads a simulated namespace that honours __esModule', async () => {
  // Rollup turns a default import of a module flagged __esModule into
  // module.exports.default, and spreads the other exports onto the namespace.
  // An ES module of that shape stands in for the CommonJS one here.
  const rollupShaped = `export class Document {}
export const helper = { kind: 'helper' };
export default { Document };
`;
  const files = generate(
    'umd',
    entry('lib.mjs', ['Document', 'default', 'helper']),
  );
  await withTree({ 'lib.mjs': rollupShaped, ...files }, async (root) => {
    const ns = await importFrom(root, 'lib.mjs');
    const wrapper = await importFrom(root, 'lib.node.mjs');
    assert.equal(wrapper.Document, ns.Document);
    assert.equal(wrapper.helper, ns.helper);
    assert.equal(wrapper.default, ns.default);
  });
});

test('reads module.exports for an entry without a default export', async () => {
  const cjs = `class Provider {}
exports.Provider = Provider;
exports.helper = { kind: 'helper' };
`;
  const files = generate('umd', entry('lib.js', ['Provider', 'helper']));
  await withTree(
    { 'package.json': '{}', 'lib.js': cjs, ...files },
    async (root) => {
      const wrapper = await importFrom(root, 'lib.node.mjs');
      assert.equal(typeof wrapper.Provider, 'function');
      assert.deepEqual(wrapper.helper, { kind: 'helper' });
      assert.equal('default' in wrapper, false);
    },
  );
});

test('generates a CJS-backed wrapper without emitting one for UMD', async () => {
  const options = { format: 'cjs' };
  assert.deepEqual(generate('umd', entry('lib.js', ['Document']), options), {});
  const files = generate(
    'cjs',
    entry('lib.cjs', ['Document', 'default', 'helper']),
    options,
  );
  assert.deepEqual(Object.keys(files).sort(), [
    'lib.d.cts',
    'lib.node.d.mts',
    'lib.node.mjs',
  ]);
  await withTree({ 'lib.cjs': CJS_WITH_DEFAULT, ...files }, async (root) => {
    const cjs = (await importFrom(root, 'lib.cjs')).default;
    const wrapper = await importFrom(root, 'lib.node.mjs');
    assert.equal(wrapper.Document, cjs.Document);
    assert.equal(wrapper.default, cjs.default);
  });
});

test('public names never collide with the wrapper local bindings', async () => {
  const names = ['cjs', 'ns', 'value0', 'class', 'await', 'defaultExport'];
  const files = generate('umd', entry('lib.js', names));
  const cjs = names
    .map((name, index) => `exports[${JSON.stringify(name)}] = ${index};`)
    .join('\n');
  await withTree({ 'lib.js': cjs, ...files }, async (root) => {
    const wrapper = await importFrom(root, 'lib.node.mjs');
    for (const [index, name] of names.entries())
      assert.equal(wrapper[name], index);
  });
});

test('rejects arbitrary string export names before emitting any files', () => {
  for (const name of [
    'not-valid',
    'x"',
    'x\nx',
    'x;globalThis.injected=true',
    '',
  ]) {
    const emitted = [];
    assert.throws(
      () =>
        nodeEsmEntry().generateBundle.call(
          { emitFile: (file) => emitted.push(file) },
          { format: 'umd' },
          { 'lib.js': entry('lib.js', ['Document', name]) },
        ),
      /Unsupported export name/,
    );
    assert.deepEqual(emitted, []);
  }
});

test('quotes entry filenames instead of interpolating source code', async () => {
  const name = "lib'quoted.js";
  const files = generate('umd', entry(name, ['Document', 'default', 'helper']));
  await withTree({ [name]: CJS_WITH_DEFAULT, ...files }, async (root) => {
    const wrapper = await importFrom(root, "lib'quoted.node.mjs");
    assert.equal(typeof wrapper.Document, 'function');
  });
});

test('ignores assets and emits independent wrappers for multiple entries', () => {
  const files = {};
  nodeEsmEntry().generateBundle.call(
    {
      emitFile: ({ fileName, source }) => {
        files[fileName] = source;
      },
    },
    { format: 'umd' },
    {
      'first.js': entry('first.js', ['Document']),
      'second.js': entry('second.js', ['Provider']),
      'asset.css': { type: 'asset', fileName: 'asset.css', source: '' },
      'shared.js': { ...entry('shared.js', ['helper']), isEntry: false },
    },
  );
  assert.deepEqual(Object.keys(files).sort(), [
    'first.node.d.mts',
    'first.node.mjs',
    'second.node.d.mts',
    'second.node.mjs',
  ]);
});

test('copies the .d.mts twin next to the given base', async () => {
  await withTree(
    { 'lib.d.ts': 'export declare class Document {}\n' },
    async (root) => {
      copyEsmDeclarations(path.join(root, 'lib'));
      assert.equal(
        readFileSync(path.join(root, 'lib.d.mts'), 'utf8'),
        readFileSync(path.join(root, 'lib.d.ts'), 'utf8'),
      );
    },
  );
});

test('generated declarations type-check strictly and preserve nominal identity', async () => {
  const tsc = createRequire(
    new URL('../../packages/sdk/package.json', import.meta.url),
  ).resolve('typescript/bin/tsc');
  for (const [format, extension] of [
    ['umd', 'js'],
    ['cjs', 'cjs'],
  ]) {
    for (const hasDefault of [false, true]) {
      const names = hasDefault ? ['Document', 'default'] : ['Document'];
      const files = generate(format, entry(`lib.${extension}`, names), {
        format,
      });
      const declaration = `export declare class Document { private brand; }\n${hasDefault ? 'declare const sdk: { Document: typeof Document };\nexport default sdk;\n' : ''}`;
      await withTree(
        {
          ...files,
          'lib.d.ts': declaration,
          'consumer.mts': `import { Document } from './lib.node.mjs';
import cjs = require('./lib.${extension}');
const forward: Document = new cjs.Document();
const reverse: cjs.Document = new Document();
${hasDefault ? "import sdk from './lib.node.mjs';\nconst constructor: typeof cjs.Document = sdk.Document;" : ''}
`,
          'tsconfig.json': JSON.stringify({
            compilerOptions: {
              module: 'NodeNext',
              moduleResolution: 'NodeNext',
              strict: true,
              noEmit: true,
              skipLibCheck: false,
              types: [],
            },
            files: ['consumer.mts'],
          }),
        },
        async (root) => {
          execFileSync(process.execPath, [tsc, '-p', 'tsconfig.json'], {
            cwd: root,
            stdio: 'pipe',
          });
        },
      );
    }
  }
});
