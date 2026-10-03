import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { copyFileSync } from 'fs';
import commonjs from 'vite-plugin-commonjs';
import tsconfigPaths from 'vite-tsconfig-paths';
import { nodeEsmEntry } from '../../scripts/node-esm-entry.mjs';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/yorkie.ts',
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
        copyFileSync('dist/yorkie-js-sdk.d.ts', 'dist/yorkie-js-sdk.d.mts'),
    }),
    commonjs(),
    tsconfigPaths({
      ignoreConfigErrors: true,
    }),
  ],
});
