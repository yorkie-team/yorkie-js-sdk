import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { fileURLToPath } from 'node:url';
import commonjs from 'vite-plugin-commonjs';
import tsconfigPaths from 'vite-tsconfig-paths';
import {
  copyEsmDeclarations,
  nodeEsmEntry,
} from '../../scripts/node-esm-entry.mjs';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  build: {
    lib: {
      entry: fileURLToPath(new URL('./src/yorkie.ts', import.meta.url)),
      name: 'yorkie-js-sdk',
      fileName: (format) =>
        format === 'umd' ? 'yorkie-js-sdk.js' : 'yorkie-js-sdk.es.mjs',
    },
    outDir: 'dist',
    sourcemap: true,
    minify: false,
    emptyOutDir: true,
  },
  plugins: [
    nodeEsmEntry(),
    dts({
      rollupTypes: true,
      // Node ESM resolves types per module format, so ship a .d.mts twin.
      afterBuild: () =>
        copyEsmDeclarations(
          fileURLToPath(new URL('./dist/yorkie-js-sdk', import.meta.url)),
        ),
    }),
    commonjs(),
    tsconfigPaths({
      ignoreConfigErrors: true,
    }),
  ],
});
