import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';
import commonjs from 'vite-plugin-commonjs';

// CI is true when running on GitHub Actions.
const isCI = process.env.CI === 'true';

export default defineConfig({
  test: {
    include: ['**/*_{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['**/lib/**', '**/node_modules/**'],
    coverage: {
      provider: 'istanbul',
      reporter: ['lcov', 'text-summary'],
    },
    onConsoleLog() {
      return true;
    },
    globals: true,
    testTimeout: isCI ? 5000 : Infinity,
    benchmark: {
      exclude: ['**/lib/**', '**/node_modules/**'],
    },
    setupFiles: ['./test/vitest.setup.ts'],
  },
  plugins: [
    commonjs(),
    tsconfigPaths({
      ignoreConfigErrors: true,
    }),
  ],
});
