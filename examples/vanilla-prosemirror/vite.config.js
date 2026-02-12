import { defineConfig } from 'vite';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// https://vitejs.dev/config/
export default defineConfig({
  base: '',
  resolve: {
    alias: [
      {
        find: '@yorkie-js/sdk/src',
        replacement: path.resolve(__dirname, '../../packages/sdk/src'),
      },
      {
        find: '@yorkie-js/prosemirror',
        replacement: path.resolve(__dirname, '../../packages/prosemirror/src'),
      },
    ],
  },
});
