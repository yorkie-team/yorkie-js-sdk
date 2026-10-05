import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import { copyFileSync } from 'fs';
import react from '@vitejs/plugin-react';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import { nodeEsmEntry } from '../../scripts/node-esm-entry.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'yorkie-js-react',
      fileName: (format) =>
        format === 'umd' ? 'yorkie-js-react.js' : 'yorkie-js-react.es.mjs',
    },
    rollupOptions: {
      // Keep the SDK external: a bundled copy would hand out its own Text,
      // Tree and Counter classes, which the user's SDK cannot recognize.
      external: ['react', 'react-dom', 'react/jsx-runtime', '@yorkie-js/sdk'],
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
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@yorkie-js/sdk/src': path.resolve(__dirname, '../sdk/src'),
    },
  },
  plugins: [
    nodeEsmEntry(),
    react(),
    dts({
      rollupTypes: true,
      // Node ESM resolves types per module format, so ship a .d.mts twin.
      afterBuild: () =>
        copyFileSync('dist/yorkie-js-react.d.ts', 'dist/yorkie-js-react.d.mts'),
    }),
  ],
});
