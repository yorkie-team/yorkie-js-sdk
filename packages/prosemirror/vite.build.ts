import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import { copyEsmDeclarations } from '../../scripts/node-esm-entry.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// https://vitejs.dev/config/
export default defineConfig({
  root: __dirname,
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/index.ts'),
      name: 'yorkie-js-prosemirror',
      fileName: (format) =>
        format === 'umd'
          ? 'yorkie-js-prosemirror.js'
          : 'yorkie-js-prosemirror.es.mjs',
    },
    rollupOptions: {
      external: [
        'prosemirror-model',
        'prosemirror-state',
        'prosemirror-view',
        'prosemirror-transform',
        '@yorkie-js/sdk',
      ],
      output: {
        globals: {
          'prosemirror-model': 'ProsemirrorModel',
          'prosemirror-state': 'ProsemirrorState',
          'prosemirror-view': 'ProsemirrorView',
          'prosemirror-transform': 'ProsemirrorTransform',
          '@yorkie-js/sdk': 'YorkieSdk',
        },
      },
    },
    outDir: 'dist',
    sourcemap: true,
    minify: false,
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@yorkie-js/sdk/src': path.resolve(__dirname, '../sdk/src'),
    },
  },
  plugins: [
    // No Node wrapper: prosemirror-* ship separate ESM and CJS builds, so a
    // wrapper around the UMD would load their CJS copies next to the app's.
    dts({
      rollupTypes: true,
      // Node ESM resolves types per module format, so ship a .d.mts twin.
      afterBuild: () =>
        copyEsmDeclarations(
          path.resolve(__dirname, 'dist/yorkie-js-prosemirror'),
        ),
    }),
  ],
});
