import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'yorkie-js-prosemirror',
      fileName: (format) =>
        format === 'umd'
          ? 'yorkie-js-prosemirror.js'
          : `yorkie-js-prosemirror.${format}.js`,
    },
    rollupOptions: {
      external: [
        'prosemirror-model',
        'prosemirror-state',
        'prosemirror-view',
        'prosemirror-transform',
      ],
      output: {
        globals: {
          'prosemirror-model': 'ProsemirrorModel',
          'prosemirror-state': 'ProsemirrorState',
          'prosemirror-view': 'ProsemirrorView',
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
    dts({
      rollupTypes: true,
    }),
  ],
});
