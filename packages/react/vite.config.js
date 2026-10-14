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
        // Every build shares the host's SDK. A script-tag page loads the SDK
        // UMD first, and this UMD reads the global it registers.
        external: [
          'react',
          'react-dom',
          '@yorkie-js/sdk',
          ...(umd ? [] : ['react/jsx-runtime']),
        ],
        output: {
          globals: {
            react: 'React',
            'react-dom': 'ReactDOM',
            '@yorkie-js/sdk': 'yorkie-js-sdk',
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
        // React's CDN builds expose no JSX runtime global.
        ...(umd
          ? {
              'react/jsx-runtime': path.resolve(
                __dirname,
                'src/umd-jsx-runtime.ts',
              ),
            }
          : {}),
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
