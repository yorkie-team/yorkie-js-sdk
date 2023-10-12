import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  test: {
    include: ['**/*_{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['**/bench/*'],
    coverage: {
      provider: 'istanbul',
      reporter: ['lcov', 'text-summary'],
    },
    environment: 'jsdom',
    globals: true,
    singleThread: true,
    testTimeout: 15000,
  },
  plugins: [tsconfigPaths()],
});
