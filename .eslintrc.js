module.exports = {
  root: true,
  plugins: ['prettier', 'jsdoc'],
  extends: ['eslint:recommended'],
  rules: {
    'prettier/prettier': 'error',
    'object-shorthand': ['error', 'always'],
    'no-unreachable': 'error',
  },
  overrides: [
    {
      // TypeScript-specific configuration
      files: ['**/*.ts', '**/*.tsx'],
      parser: '@typescript-eslint/parser',
      plugins: ['@typescript-eslint'],
      extends: [
        'plugin:@typescript-eslint/recommended', // TypeScript linting rules
      ],
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
      },
    },
  ],
};
