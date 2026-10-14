# Yorkie React SDK

Yorkie React SDK is a library that provides React hooks and components for building collaborative applications with Yorkie.

## Installation

```sh
npm install @yorkie-js/react @yorkie-js/sdk
```

`@yorkie-js/sdk` is a peer dependency, so your app and these hooks share one
SDK. npm 7+ and pnpm install it automatically; Yarn does not.

### Script tags

The UMD build reads React and the SDK from the globals their own UMD builds
register, so load them first:

```html
<script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
<script src="https://unpkg.com/@yorkie-js/sdk"></script>
<script src="https://unpkg.com/@yorkie-js/react"></script>
```

## How to use React SDK

To get started using Yorkie React SDK, see: https://yorkie.dev/docs/getting-started/with-react

## Contributing

See [CONTRIBUTING](../../CONTRIBUTING.md) for details on submitting patches and the contribution workflow.

## Contributors ✨

Thanks goes to these incredible people:

<a href="https://github.com/yorkie-team/yorkie-js-sdk/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=yorkie-team/yorkie-js-sdk" />
</a>
