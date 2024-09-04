// eslint-disable-next-line no-undef
module.exports = {
  extends: [
    '../../.eslintrc.js', // Extends the root ESLint configuration (which includes prettier)
    'plugin:@typescript-eslint/eslint-recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'eslint-plugin-tsdoc'], // No need to include prettier here
  rules: {
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
