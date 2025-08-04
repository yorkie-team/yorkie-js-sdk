import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettierPlugin from 'eslint-plugin-prettier';
import jsdocPlugin from 'eslint-plugin-jsdoc';
import { globalIgnores } from 'eslint/config';

export default tseslint.config(
  eslint.configs.recommended,
  tseslint.configs.recommended,
  tseslint.configs.eslintRecommended,
  {
    plugins: {
      prettier: prettierPlugin,
      jsdoc: jsdocPlugin,
    },
    rules: {
      'prettier/prettier': 'error',
      'object-shorthand': ['error', 'always'],
      'no-unreachable': 'error',
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tseslint.parser,
    },
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',

      'jsdoc/require-jsdoc': [
        'error',
        {
          contexts: ['MethodDefinition:not([accessibility="private"])'],

          require: {
            ClassDeclaration: true,
          },

          checkConstructors: false,
          enableFixer: false,
        },
      ],

      '@typescript-eslint/naming-convention': [
        'error',
        {
          selector: 'variable',
          format: ['camelCase', 'PascalCase'],
          leadingUnderscore: 'allowDouble',
          trailingUnderscore: 'allowDouble',
        },
      ],

      '@typescript-eslint/no-restricted-types': [
        'error',
        {
          types: {
            null: 'Use undefined instead of null',
          },
        },
      ],

      '@typescript-eslint/array-type': [
        'error',
        {
          default: 'generic',
        },
      ],

      '@typescript-eslint/no-this-alias': [
        'error',
        {
          allowDestructuring: true,
          allowedNames: ['node'],
        },
      ],
    },
  },
  {
    files: ['examples/**/*'],
    rules: {
      'jsdoc/require-jsdoc': 'off',
    },
  },
  globalIgnores([
    // common
    '**/dist/*',
    // sdk
    'packages/sdk/src/api/yorkie/v1/yorkie_grpc_web_pb.d.ts',
    'packages/sdk/src/api/yorkie/v1/yorkie_pb.d.ts',
    'packages/sdk/src/api/yorkie/v1/resources_grpc_web_pb.d.ts',
    'packages/sdk/src/api/yorkie/v1/resources_pb.d.ts',
    'packages/sdk/test/vitest.d.ts',
    'packages/sdk/lib',
    // examples
    'examples/**/*',
    // schema
    'packages/schema/antlr',
  ]),
);
