# Lessons: polish the example apps

**Created**: 2026-11-14

- Under `pnpm dev` the Yorkie Watch stream never goes idle, so Playwright's
  `networkidle` never fires. Wait for `load`, then for the app's own
  "connected" state.
- yorkie.dev shows each example in iframes of about 590x250. An app that only
  looks right full-screen looks broken there, so check that size too.
- The yorkie.dev deploy fetches examples from the release tag. A change here
  reaches the yorkie.dev example pages only after the next release and the
  homepage version bump. The live previews at
  `yorkie.dev/yorkie-js-sdk/examples/<name>/` are different: they redeploy
  on every merge to `main`.
