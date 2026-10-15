import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

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
      return false;
    },
    globals: true,
    // 5s on CI, so a hung integration test fails instead of eating the job's
    // wall clock. A suite that legitimately needs longer — the conformance
    // replays, which `test:unit` and `test:ci` both collect, the latter with
    // istanbul instrumentation — states its own budget, per file with
    // `vi.setConfig({ testTimeout })` and per test with `it`'s third
    // argument; see test/conformance/tree_conformance_test.ts.
    testTimeout: isCI ? 5000 : Infinity,
    benchmark: {
      exclude: ['**/lib/**', '**/node_modules/**'],
    },
    setupFiles: ['./test/vitest.setup.ts'],
  },
  plugins: [
    tsconfigPaths({
      ignoreConfigErrors: true,
    }),
  ],
});
