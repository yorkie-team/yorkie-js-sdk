module.exports = {
  // todo: add tsx
  '**/*.ts':
    'pnpm exec eslint --fix --max-warnings=0 --no-warn-ignored --flag v10_config_lookup_from_file',
};
