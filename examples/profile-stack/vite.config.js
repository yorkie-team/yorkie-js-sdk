import { defineConfig } from 'vite';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  base: '',
  resolve: {
    alias: [
      {
        find: '@yorkie-js-sdk/src',
        replacement: path.resolve(__dirname, '../../packages/sdk/src'),
      },
    ],
  },
});
