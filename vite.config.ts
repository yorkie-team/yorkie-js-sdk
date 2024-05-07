import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import commonjs from 'vite-plugin-commonjs';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/yorkie.ts',
      name: 'yorkie-js-sdk',
      fileName: (format) =>
        format === 'umd' ? 'yorkie-js-sdk.js' : `yorkie-js-sdk.${format}.js`,
    },
    outDir: 'dist',
    sourcemap: true,
    emptyOutDir: true,
  },
  plugins: [
    commonjs(),
    tsconfigPaths({
      ignoreConfigErrors: true,
    }),
  ],
});
