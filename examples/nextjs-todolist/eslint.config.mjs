import nextConfig from 'eslint-config-next';
import { globalIgnores } from 'eslint/config';
import prettierPlugin from 'eslint-plugin-prettier';

const eslintConfig = [
  ...nextConfig,
  {
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      'prettier/prettier': 'error',
    },
  },
  globalIgnores(['dist/*']),
];

export default eslintConfig;
