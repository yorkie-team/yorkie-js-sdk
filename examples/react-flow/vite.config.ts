import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  base: '',
  plugins: [react()],
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
