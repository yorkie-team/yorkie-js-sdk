// eslint-disable-next-line no-undef
module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'prettier', 'eslint-plugin-tsdoc', 'jsdoc'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/eslint-recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  rules: {
    'prettier/prettier': 'error',
    '@typescript-eslint/naming-convention': [
      'error',
      {
        selector: 'variable',
        format: ['camelCase', 'PascalCase'],
        leadingUnderscore: 'allowDouble',
        trailingUnderscore: 'allowDouble',
      },
    ],
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/ban-ts-comment': 'off',
    '@typescript-eslint/ban-types': [
      'error',
      {
        types: { null: 'Use undefined instead of null' },
      },
    ],
    '@typescript-eslint/array-type': ['error', { default: 'generic' }],
    'tsdoc/syntax': 'error',
    'object-shorthand': ['error', 'always'],
    'no-unreachable': 'error',
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
    '@typescript-eslint/no-this-alias': [
      'error',
      {
        allowDestructuring: true,
        allowedNames: ['node'],
      },
    ],
  },
  overrides: [
    {
      files: ['test/**/*', 'lib/**/*'],
      rules: {
        'jsdoc/require-jsdoc': 'off',
        '@typescript-eslint/ban-types': 'off',
      },
    },
  ],
};
