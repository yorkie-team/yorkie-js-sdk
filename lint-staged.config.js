const { ESLint } = require('eslint');
const { execSync } = require('child_process');
const path = require('path');

module.exports = {
  '**/*.{ts,tsx}': 'pnpm exec eslint --fix --max-warnings=0 --no-warn-ignored',
};
