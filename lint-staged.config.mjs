import path from 'node:path';
import process from 'node:process';

const ESLINT =
  'pnpm exec eslint --fix --max-warnings=0 --no-warn-ignored --flag v10_config_lookup_from_file';

// Lint what CI lints. The root `eslint .` ignores `examples/**`, but explicit
// paths resolve to the nearest nested config, which does not carry that
// ignore — and several examples' own configs do not load. Filtering here keeps
// the commit gate from refusing files CI never checks.
export default {
  '**/*.{ts,tsx,mts,cts,js,mjs,cjs}': (files) => {
    // lint-staged passes absolute paths; judge them relative to the repo
    // root, or a clone under any directory named `examples` lints nothing.
    const linted = files.filter(
      (file) =>
        !path
          .relative(process.cwd(), file)
          .split(path.sep)
          .includes('examples'),
    );
    return linted.length
      ? `${ESLINT} ${linted.map((f) => JSON.stringify(f)).join(' ')}`
      : [];
  },
};
