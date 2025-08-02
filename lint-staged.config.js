const { ESLint } = require('eslint');
const { execSync } = require('child_process');
const path = require('path');

const removeIgnoredFiles = async (files) => {
  const eslintIgnorePath = path.resolve('.eslintignore'); // Pointing to the root .eslintignore
  const eslint = new ESLint({ ignorePath: eslintIgnorePath });

  const isIgnored = await Promise.all(
    files.map(async (file) => {
      const ignored = await eslint.isPathIgnored(file);
      return ignored;
    }),
  );

  const filteredFiles = files.filter((_, i) => !isIgnored[i]);
  return filteredFiles;
};

module.exports = {
  '**/*.{ts,tsx}': 'pnpm exec eslint --fix --max-warnings=0 --no-warn-ignored',
};
