# Maintaining

## Releasing a New Version

### Updating and Deploying yorkie-js-sdk

1. Update `version` in [package.json](https://github.com/yorkie-team/yorkie-js-sdk/blob/main/package.json#L3) and [package.publish.json](https://github.com/yorkie-team/yorkie-js-sdk/blob/main/package.publish.json#L3).
2. Write changelog of this version in [CHANGELOG.md](https://github.com/yorkie-team/yorkie/blob/main/CHANGELOG.md).
3. Create Pull Request and merge it into main.
4. Create [a new release](https://github.com/yorkie-team/yorkie-js-sdk/releases/new) by attaching the changelog by clicking `Generate release notes` button.
5. Then [GitHub action](https://github.com/yorkie-team/yorkie-js-sdk/blob/main/.github/workflows/npm-publish.yml) will deploy Yorkie JS SDK to [npm](https://www.npmjs.com/package/yorkie-js-sdk).
6. Update `yorkie-js-sdk` version in each project's `package.json` in [/examples](https://github.com/yorkie-team/yorkie-js-sdk/tree/main/examples) and submit a new Pull Request and merge it into the main branch.
