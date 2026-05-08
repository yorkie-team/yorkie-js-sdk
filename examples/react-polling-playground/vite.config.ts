import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  base: '',
  plugins: [react(), tsconfigPaths()],
  resolve: {
    alias: [
      {
        find: '@yorkie-js/react',
        replacement: path.resolve(__dirname, '../../packages/react/src'),
      },
      {
        find: '@yorkie-js/sdk/src',
        replacement: path.resolve(__dirname, '../../packages/sdk/src'),
      },
    ],
  },
});
