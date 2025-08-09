import { globalIgnores } from 'eslint/config';
import prettierPlugin from 'eslint-plugin-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import baseConfig from '../../eslint.config.mjs';

const eslintConfig = [
  ...baseConfig,
  reactHooks.configs['recommended-latest'],
  reactRefresh.configs.vite,
  {
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      'prettier/prettier': 'error',
      'jsdoc/require-jsdoc': 'off',
    },
  },
  globalIgnores(['dist/*']),
];

export default eslintConfig;
