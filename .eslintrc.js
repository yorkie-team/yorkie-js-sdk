module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'prettier'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/eslint-recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  // FIXME: We need to find a way to prevent a newline per chained call.
  // rules: {
  //   'prettier/prettier': 'error',
  // },
};
