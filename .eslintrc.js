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
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/ban-ts-comment': 'off',
    '@typescript-eslint/ban-types': [
      'error',
      {
        types: {
          null: 'Use undefined instead of null',
        },
      },
    ],
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
      },
    ],
  },
  overrides: [
    {
      files: ['test/**/*'],
      rules: {
        'jsdoc/require-jsdoc': 'off',
      },
    },
  ],
};
