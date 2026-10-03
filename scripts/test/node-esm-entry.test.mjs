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

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

import { nodeEsmEntry } from '../node-esm-entry.mjs';

function generate(format, chunk) {
  const files = {};
  const ctx = {
    emitFile: ({ fileName, source }) => {
      files[fileName] = source;
    },
  };
  nodeEsmEntry().generateBundle.call(
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
  assert.match(files['lib.node.d.mts'], /^export \* from '\.\/lib\.js';$/m);
  assert.match(files['lib.node.d.mts'], /^export default defaultExport;$/m);

  const noDefault = generate('umd', entry('lib.js', ['Document']));
  assert.equal(noDefault['lib.node.d.mts'], "export * from './lib.js';\n");
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

test('reads the namespace when the importer honours __esModule (Rollup, Vite SSR)', async () => {
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
    const wrapper = await importFrom(root, 'lib.mjs.node.mjs');
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
