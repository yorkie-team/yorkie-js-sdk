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

// Node import and require must share one implementation: SDK values are
// recognized with instanceof, so independently evaluated bundles cannot mix.
export function nodeEsmEntry() {
  return {
    name: 'yorkie-node-esm-entry',
    generateBundle({ format }, bundle) {
      if (format !== 'umd') return;

      for (const chunk of Object.values(bundle)) {
        if (chunk.type !== 'chunk' || !chunk.isEntry) continue;

        const base = chunk.fileName.replace(/\.js$/, '');
        const target = `./${chunk.fileName}`;
        const named = chunk.exports.filter((name) => name !== 'default').sort();
        const hasDefault = chunk.exports.includes('default');
        const runtime = [
          `import cjs from '${target}';`,
          ...named.map((name) => `export const ${name} = cjs.${name};`),
          ...(hasDefault ? ['export default cjs.default;'] : []),
        ];
        // Re-export the CJS declarations rather than copying them, so classes
        // with private members also have one identity under NodeNext.
        const types = [
          `export * from '${target}';`,
          ...(hasDefault
            ? [
                `import cjs = require('${target}');`,
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
      }
    },
  };
}
