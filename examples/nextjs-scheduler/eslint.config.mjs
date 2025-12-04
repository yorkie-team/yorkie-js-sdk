import nextConfig from 'eslint-config-next';
import { globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';
import prettierPlugin from 'eslint-plugin-prettier';

export default tseslint.config(
  ...nextConfig,
  {
    plugins: {
      prettier: prettierPlugin,
    },
    rules: {
      'prettier/prettier': 'error',
      '@next/next/no-html-link-for-pages': 'off',
    },
  },
  globalIgnores(['dist/*']),
);
