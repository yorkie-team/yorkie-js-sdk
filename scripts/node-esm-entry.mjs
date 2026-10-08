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

import { copyFileSync } from 'node:fs';

/**
 * Emits `<entry>.node.mjs` and `<entry>.node.d.mts` next to the UMD entry (or
 * the CJS one, with `format: 'cjs'`). Node import and require must share one
 * implementation: SDK values are recognized with instanceof, so independently
 * evaluated bundles cannot mix.
 */
export function nodeEsmEntry({ format: entryFormat = 'umd' } = {}) {
  return {
    name: 'yorkie-node-esm-entry',
    generateBundle({ format }, bundle) {
      if (format !== entryFormat) return;

      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk' || !chunk.isEntry) continue;

        const base = chunk.fileName.replace(/\.(?:cjs|mjs|js)$/, '');
        const target = JSON.stringify(`./${chunk.fileName}`);
        const named = chunk.exports.filter((name) => name !== 'default').sort();
        // Our entries use identifier export names. Reject arbitrary string
        // names before they can become JavaScript source. Export aliases also
        // allow reserved words and names like cjs/ns without local collisions.
        for (const name of named) {
          if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) {
            throw new Error(
              `Unsupported export name ${JSON.stringify(name)} in ${chunk.fileName}`,
            );
          }
        }
        const hasDefault = chunk.exports.includes('default');
        // An entry with a default export makes a Rollup UMD or CJS build flag
        // module.exports with __esModule.
        // Node, esbuild and webpack still import module.exports as the default;
        // Rollup honours the flag, imports module.exports.default instead and
        // spreads the exports onto the namespace. Take whichever holds them.
        const load = hasDefault
          ? [
              `import * as ns from ${target};`,
              'const cjs = ns.default && ns.default.__esModule ? ns.default : ns;',
            ]
          : [`import cjs from ${target};`];
        const runtime = [
          ...load,
          ...named.flatMap((name, index) => [
            `const value${index} = cjs[${JSON.stringify(name)}];`,
            `export { value${index} as ${name} };`,
          ]),
          ...(hasDefault ? ['export default cjs.default;'] : []),
        ];
        // Re-export the CJS declarations rather than copying them, so classes
        // with private members also have one identity under NodeNext.
        const types = [
          `export * from ${target};`,
          ...(hasDefault
            ? [
                `import cjs = require(${target});`,
                'declare const defaultExport: typeof cjs.default;',
                'export default defaultExport;',
              ]
            : []),
        ];

        this.emitFile({
          type: 'asset',
          fileName: `${base}.node.mjs`,
          source: `${runtime.join('\n')}\n`,
        });
        this.emitFile({
          type: 'asset',
          fileName: `${base}.node.d.mts`,
          source: `${types.join('\n')}\n`,
        });
        // TypeScript reads a .cjs file's types from .d.cts. Forward them to
        // the .d.ts that require() uses, so both share one class identity.
        if (chunk.fileName.endsWith('.cjs')) {
          const canonical = JSON.stringify(`./${base}.js`);
          this.emitFile({
            type: 'asset',
            fileName: `${base}.d.cts`,
            source: [
              `export * from ${canonical};`,
              ...(hasDefault ? [`export { default } from ${canonical};`] : []),
              '',
            ].join('\n'),
          });
        }
      }
    },
  };
}

/**
 * Copies `<base>.d.ts` to the `<base>.d.mts` twin that ESM resolution reads.
 * Run it only after the declaration rollup has finished. Callers pass an
 * absolute base, so running Vite from another directory cannot copy the
 * wrong file.
 */
export function copyEsmDeclarations(base) {
  copyFileSync(`${base}.d.ts`, `${base}.d.mts`);
}
