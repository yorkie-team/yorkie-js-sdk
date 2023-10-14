# Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for the general guides for contribution.

## Keeping create-yorkie-app in sync with examples

When adding a new example, you have to update create-yorkie-app's [frameworks.ts](../tools//create-yorkie-app/frameworks.ts).

Add FrameworkVariant to the variants array under appropriate category like:

```js
export const FRAMEWORKS: Array<Framework> = [
  {
    name: 'vanilla',
    display: 'Vanilla',
    color: yellow,
    variants: [
      {
        name: 'vanilla-codemirror6',
        display: 'codemirror',
      },
      {
        name: 'vanilla-quill',
        display: 'quill',
      },
      {
        name: 'profile-stack',
        display: 'profile-stack',
      },
      // Your yorkie example in Vanilla JS
      {
        name: 'directory-name',
        display: 'display-name',
      },
    ],
  },
  // ...
];
```
