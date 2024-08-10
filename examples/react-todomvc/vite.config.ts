import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  base: '',
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: '@yorkie-js-sdk/src',
        replacement: path.resolve(__dirname, '../../packages/sdk/src'),
      },
    ],
  },
});
