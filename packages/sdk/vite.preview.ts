import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import commonjs from 'vite-plugin-commonjs';

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    minify: false,
    rollupOptions: {
      input: 'src/yorkie.ts',
      output: [
        {
          format: 'umd',
          name: 'yorkie',
          entryFileNames: 'yorkie-js-sdk.js',
        },
      ],
    },
  },
  plugins: [
    commonjs(),
    tsconfigPaths({
      ignoreConfigErrors: true,
    }),
  ],
});
