# Yorkie Devtools

Yorkie Devtools is a Chrome extension designed to assist in debugging Yorkie.

<img src="https://github.com/yorkie-team/yorkie-js-sdk/assets/81357083/bb7e5df1-9704-4a90-b458-4dd89c17002a" width="660" alt="Yorkie Devtools" />

## Installation

Download the extension from the [Chrome Web Store](https://chromewebstore.google.com/detail/yorkie-devtools/djhcelgbkggnbipeccnnbafbnljoikkc), and you will see the `Yorkie 🐾` tab in Chrome Developer Tools.

To use devtools, you need to set the `enableDevtools` option when creating the Document.

```javascript
const doc = new yorkie.Document('docKey', {
  enableDevtools: true, // Adjust the condition according to your situation
});
```

> Devtools requires `@yorkie-js/sdk` v0.4.18 or newer — the release that added the `enableDevtools` option. No development build is needed: the option is the only gate. The extension and the SDK are released together and share a version number, so keeping both on the same version avoids message-protocol drift.

## Development

To start developing with Yorkie Devtools, follow these steps:

1. Run `pnpm install` in root directory of the repository.
2. Run `pnpm devtools dev` in the root directory of the repository or `pnpm dev` in the project directory.
3. Open your Chrome browser and go to [chrome://extensions](chrome://extensions).
4. Enable "Developer mode."
5. Click on "Load unpacked" and select the output directory `dist/chrome-mv3-prod`.
