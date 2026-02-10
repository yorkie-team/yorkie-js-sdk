import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    alias: {
      '@yorkie-js/prosemirror': path.resolve(__dirname, 'src'),
    },
  },
  server: {
    open: true,
    fs: {
      // Allow serving files from the monorepo root so SDK sources can be imported.
      allow: ['../..'],
    },
  },
  define: {
    'process.env': {},
  },
});
