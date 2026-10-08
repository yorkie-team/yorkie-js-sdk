import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import react from '@vitejs/plugin-react';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  copyEsmDeclarations,
  nodeEsmEntry,
} from '../../scripts/node-esm-entry.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const umd = mode === 'umd';
  return {
    root: __dirname,
    build: {
      lib: {
        entry: path.resolve(__dirname, 'src/index.ts'),
        name: 'yorkie-js-react',
        formats: umd ? ['umd'] : ['es', 'cjs'],
        fileName: (format) =>
          format === 'umd'
            ? 'yorkie-js-react.js'
            : format === 'cjs'
              ? 'yorkie-js-react.cjs'
              : 'yorkie-js-react.es.mjs',
      },
      rollupOptions: {
        // Node and browser bundlers share the consumer's SDK. The legacy
        // script-tag UMD keeps its bundled SDK so it needs no new global.
        external: [
          'react',
          'react-dom',
          'react/jsx-runtime',
          ...(umd ? [] : ['@yorkie-js/sdk']),
        ],
        output: {
          globals: {
            react: 'React',
            'react-dom': 'ReactDOM',
            'react/jsx-runtime': 'jsxRuntime',
          },
        },
      },
      outDir: 'dist',
      sourcemap: true,
      minify: false,
      emptyOutDir: !umd,
    },
    resolve: {
      alias: {
        '@yorkie-js/sdk/src': path.resolve(__dirname, '../sdk/src'),
      },
    },
    plugins: [
      ...(!umd ? [nodeEsmEntry({ format: 'cjs' })] : []),
      react(),
      ...(!umd
        ? [
            dts({
              rollupTypes: true,
              // Node ESM resolves types per module format, so ship a .d.mts twin.
              afterBuild: () =>
                copyEsmDeclarations(
                  path.resolve(__dirname, 'dist/yorkie-js-react'),
                ),
            }),
          ]
        : []),
    ],
  };
});
