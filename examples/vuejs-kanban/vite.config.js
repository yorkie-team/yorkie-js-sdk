import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  base: '',
  plugins: [vue()],
  resolve: {
    alias: [
      {
        find: '@yorkie-js-sdk/src',
        replacement: path.resolve(__dirname, '../../packages/sdk/src'),
      },
      {
        find: '@',
        replacement: fileURLToPath(new URL('./src', import.meta.url)),
      },
    ],
  },
});
