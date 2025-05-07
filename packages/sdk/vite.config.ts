import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import commonjs from 'vite-plugin-commonjs';

export default defineConfig({
  plugins: [
    commonjs(),
    tsconfigPaths({
      ignoreConfigErrors: true,
    }),
  ],
});
