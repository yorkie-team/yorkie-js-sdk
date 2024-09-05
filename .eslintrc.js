module.exports = {
  root: true,
  plugins: ['@typescript-eslint', 'prettier', 'jsdoc'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/eslint-recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  rules: {
    'prettier/prettier': 'error',
    'object-shorthand': ['error', 'always'],
    'no-unreachable': 'error',
  },
  overrides: [
    {
      files: ['**/*.ts', '**/*.tsx'],
      parser: '@typescript-eslint/parser',
      plugins: ['@typescript-eslint'],
      extends: ['plugin:@typescript-eslint/recommended'],
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
        '@typescript-eslint/ban-types': [
          'error',
          {
            types: { null: 'Use undefined instead of null' },
          },
        ],
        '@typescript-eslint/array-type': ['error', { default: 'generic' }],
        '@typescript-eslint/no-this-alias': [
          'error',
          {
            allowDestructuring: true,
            allowedNames: ['node'],
          },
        ],
      },
    },
  ],
};
