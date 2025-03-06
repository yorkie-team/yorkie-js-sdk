import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'yorkie-js-react',
      fileName: (format) =>
        format === 'umd'
          ? 'yorkie-js-react.js'
          : `yorkie-js-react.${format}.js`,
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
    react(),
    dts({
      rollupTypes: true,
    }),
  ],
});
