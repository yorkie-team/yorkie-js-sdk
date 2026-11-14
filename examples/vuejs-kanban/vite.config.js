import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// https://vitejs.dev/config/
export default defineConfig({
  base: '',
  plugins: [vue()],
  resolve: {
    // The workspace SDK source imports itself through this path.
    alias: [
      {
        find: '@yorkie-js/sdk/src',
        replacement: path.resolve(__dirname, '../../packages/sdk/src'),
      },
    ],
  },
});
