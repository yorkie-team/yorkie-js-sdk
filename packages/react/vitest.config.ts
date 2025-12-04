import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: [
      {
        find: '@yorkie-js/sdk/src',
        replacement: path.resolve(__dirname, '../sdk/src'),
      },
      {
        find: '@yorkie-js/sdk/package.json',
        replacement: path.resolve(__dirname, '../sdk/package.json'),
      },
      {
        find: '@yorkie-js/sdk',
        replacement: path.resolve(__dirname, '../sdk/src/yorkie.ts'),
      },
    ],
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/test-setup.ts'],
    globals: true,
  },
});
