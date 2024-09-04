module.exports = {
  extends: ['next', 'plugin:prettier/recommended', '../../.eslintrc.js'],
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
