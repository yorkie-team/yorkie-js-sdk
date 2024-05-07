import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import commonjs from 'vite-plugin-commonjs';
import tsconfigPaths from 'vite-tsconfig-paths';

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
    minify: false,
    emptyOutDir: true,
  },
  plugins: [
    dts({
      rollupTypes: true,
    }),
    commonjs(),
    tsconfigPaths({
      ignoreConfigErrors: true,
    }),
  ],
});
