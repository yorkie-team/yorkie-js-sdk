/* eslint-env node */
import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
const outfile = join(rootDir, 'dist/index.js');

await esbuild.build({
  entryPoints: [join(rootDir, 'dist/index.js')],
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'esm',
  outfile,
  allowOverwrite: true,
  external: [
    // Keep these external as they're npm packages that will be installed
    '@modelcontextprotocol/sdk',
    'zod',
  ],
  // Resolve @yorkie-js/sdk to the built distribution
  alias: {
    '@yorkie-js/sdk': join(rootDir, '../sdk/dist/yorkie-js-sdk.es.js'),
  },
});

// Add shebang to the output
const content = readFileSync(outfile, 'utf-8');
const withShebang = content.startsWith('#!')
  ? content
  : '#!/usr/bin/env node\n' + content;
writeFileSync(outfile, withShebang);

// eslint-disable-next-line no-undef
console.log('Bundle created successfully');
