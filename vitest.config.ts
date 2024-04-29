import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

// CI is true when running on GitHub Actions.
const isCI = process.env.CI === 'true';

export default defineConfig({
  test: {
    include: ['**/*_{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['**/lib/**', '**/bench/*', '**/node_modules/**'],
    coverage: {
      provider: 'istanbul',
      reporter: ['lcov', 'text-summary'],
    },
    onConsoleLog() {
      return false;
    },
    environment: 'custom-jsdom',
    globals: true,
    testTimeout: isCI ? 5000 : Infinity,
  },
  plugins: [
    tsconfigPaths({
      ignoreConfigErrors: true,
    }),
  ],
});
