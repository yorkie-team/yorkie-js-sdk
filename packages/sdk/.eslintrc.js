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
  ignorePatterns: [
    'dist/**/*',
    '**/*.d.ts',
    // TODO(pengooseDev): Consider unifying the test file naming convention (e.g. .test or _test)
    '**/*_test.ts',
    '**/*.bench.ts',
  ],
};
