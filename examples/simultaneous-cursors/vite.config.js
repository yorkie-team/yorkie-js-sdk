import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// https://vitejs.dev/config/
export default defineConfig({
  base: '',
  plugins: [react()],
  resolve: {
    alias: [
      {
        find: '@yorkie-js/sdk/src',
        replacement: path.resolve(__dirname, '../../packages/sdk/src'),
      },
    ],
  },
});
