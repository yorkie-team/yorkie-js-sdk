# Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for the general guides for contribution.

## Keeping create-yorkie-app in sync with examples

When adding a new example, you have to update create-yorkie-app's [FRAMEWORKS.ts](../tools//create-yorkie-app/FRAMEWORKS.ts).

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
        color: yellow,
      },
      {
        name: 'vanilla-quill',
        display: 'quill',
        color: yellow,
      },
      {
        name: 'profile-stack',
        display: 'profile-stack',
        color: yellow,
      },
      // Your yorkie example in Vanilla JS
      {
        name: 'directory-name',
        display: 'display-name',
        color: yellow,
      },
    ],
  },
  // ...
];
```
