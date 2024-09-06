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
  '**/*.ts': async (files) => {
    const filesToLint = await removeIgnoredFiles(files);

    if (filesToLint.length > 0) {
      const fileArgs = filesToLint.join(' ');
      const command = `pnpm exec eslint ${fileArgs} --fix --max-warnings=0 --ext .ts`;
      try {
        execSync(command, { stdio: 'inherit' });
        process.exit(0);
      } catch (error) {
        console.error('Linting failed. Commit will be aborted.');
        process.exit(1);
      }
    } else {
      console.log('No eligible files to lint. Skipping lint-staged command.');
      process.exit(0);
    }
  },
};
