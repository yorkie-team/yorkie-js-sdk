// eslint-disable-next-line no-undef
module.exports = {
  extends: ['../../.eslintrc.js'],
  plugins: ['eslint-plugin-tsdoc'],
  rules: {
    'tsdoc/syntax': 'error',
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
