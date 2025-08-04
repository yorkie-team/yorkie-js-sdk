import tseslint from 'typescript-eslint';
import { globalIgnores } from 'eslint/config';
import baseConfig from '../../eslint.config.mjs';

export default tseslint.config(
  ...baseConfig,
  {
    files: ['test/**/*', 'lib/**/*'],
    rules: {
      'jsdoc/require-jsdoc': 'off',
      '@typescript-eslint/no-restricted-types': 'off',
    },
  },
  globalIgnores([
    'dist/*',
    'src/api/yorkie/v1/*.d.ts',
    'test/vitest.d.ts',
    'lib/*',
  ]),
);
