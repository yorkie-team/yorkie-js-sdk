# Maintaining create-yorkie-app

This package is an automated tool to scaffold an example project that shows practical usage of yorkie-js-sdk.

```bash
.
├── MAINTAINING.md
├── README.md
├── frameworks.ts   # abstract data object representing examples/ directory
├── index.ts        # main script
├── package.json
├── tsconfig.json
└── webpack.config.js
```

## Adding a New Example

Add information about your new example in [frameworks.ts](https://github.com/yorkie-team/yorkie-js-sdk/blob/main/tools/create-yorkie-app/frameworks.ts).

Choose or create an appropriate category (e.g. vanilla, react, nextjs, vue, ...) and add an object like below to variants array.

```ts
{
  name: directory_name,
  display: displayed_name_in_prompt
}
```

## Publishing a New Version

Update the version in [package.json](https://github.com/yorkie-team/yorkie-js-sdk/blob/main/tools/create-yorkie-app/package.json#L3).

Publication will be done via [create-yorkie-app-publish.yml](https://github.com/yorkie-team/yorkie-js-sdk/blob/main/.github/workflows/create-yorkie-app-publish.yml) when changes are pushed into main branch.
