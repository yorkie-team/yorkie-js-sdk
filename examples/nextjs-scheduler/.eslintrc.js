module.exports = {
  extends: ['next', 'plugin:prettier/recommended'],
  rules: {
    'prettier/prettier': [
      'error',
      {
        endOfLine: 'auto',
      },
    ],
    '@next/next/no-html-link-for-pages': 'off',
  },
};
