const { execSync } = require('child_process');
const { ESLint } = require('eslint');
const path = require('path');

(async function main() {
  try {
    // Define the path to the .eslintignore file in the sdk package
    const eslintIgnorePath = path.resolve('packages/sdk/.eslintignore');

    const eslint = new ESLint({ ignorePath: eslintIgnorePath });
    const files = process.argv.slice(2);

    // Filter out files that are ignored by ESLint using the specified .eslintignore file
    const filteredFiles = (
      await Promise.all(
        files.map(async (file) => {
          const isIgnored = await eslint.isPathIgnored(file);
          return isIgnored ? null : file;
        }),
      )
    ).filter(Boolean);

    if (filteredFiles.length > 0) {
      const fileArgs = filteredFiles.join(' ');
      const command = `pnpm --filter sdk eslint --fix --ignore-path ${eslintIgnorePath} ${fileArgs}`;

      console.log(`Running command: ${command}`);
      execSync(command, { stdio: 'inherit' });
    } else {
      console.log('No files to lint after filtering with .eslintignore.');
    }
  } catch (error) {
    console.error('Error running lint command:', error.message);
    process.exit(1);
  }
})();
