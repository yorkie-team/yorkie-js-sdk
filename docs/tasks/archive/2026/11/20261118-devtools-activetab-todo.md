# Drop the unused activeTab permission from the devtools manifest

**Created**: 2026-11-18

The Chrome Web Store rejected the v0.7.28 submission of Yorkie Devtools
(violation "Purple Potassium", Use of Permissions): the manifest requests
`activeTab` but the extension never uses it.

`activeTab` grants temporary host access to the current tab after a user
gesture, for APIs such as `scripting.executeScript` or
`tabs.captureVisibleTab`. The extension calls none of them:

- `chrome.tabs.connect`, `chrome.tabs.reload` and `chrome.tabs.onUpdated`
  (reading `status` only) need no permission.
- The content script is declared statically for `<all_urls>`.
- `chrome.devtools.*` needs only `devtools_page`.
- The popup makes no `chrome.*` calls.

## Plan

1. Remove `manifest.permissions` from `packages/devtools/package.json`.
2. Build the extension and check the generated manifest.

## Checklist

- [x] `manifest.permissions` removed
- [x] `pnpm devtools build` manifest has no `permissions` key
- [x] `pnpm devtools test` and `pnpm devtools typecheck` pass
- [x] Archive this pair before the pull request merges
